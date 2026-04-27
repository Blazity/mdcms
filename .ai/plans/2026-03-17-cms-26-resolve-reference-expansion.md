# CMS-26 Resolve Reference Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement shallow `resolve=` reference expansion across all full
content read endpoints, with environment-scoped validation and deterministic
`resolveErrors` metadata for unresolved targets.

**Architecture:** Keep base content reads in the existing content store and add
a dedicated server-side reference-resolution layer for read responses. Validate
requested field paths against schema registry snapshots for the routed
environment, fetch referenced targets through existing content-store reads, and
surface failures as `null` plus top-level `resolveErrors` keyed by full field
paths.

**Tech Stack:** Bun, Nx, TypeScript, Elysia, Drizzle, Postgres, Zod, Node test

---

### Task 1: Update The Normative Contract

**Files:**

- Modify: `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- Modify: `docs/specs/SPEC-008-cli-and-sdk.md`
- Modify: `packages/shared/src/lib/contracts/content-api.ts:17-56`

**Step 1: Update the owning content spec**

Add the approved `resolve` contract to the endpoint table and query-parameter
sections in `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`.
Document support for:

- `GET /api/v1/content`
- `GET /api/v1/content/:documentId`
- `GET /api/v1/content/:documentId/versions/:version`

Document these rules explicitly:

- shallow-only resolution
- top-level optional `resolveErrors`
- full-path error keys
- `null` for unresolved fields
- `INVALID_QUERY_PARAM` for unknown/non-reference/excluded paths

**Step 2: Align the SDK spec**

Update `docs/specs/SPEC-008-cli-and-sdk.md` so its `cms.get(..., { resolve })`
example and surrounding prose match the normative contract without adding any
new SDK behavior beyond CMS-26.

**Step 3: Extend the shared API response types**

Update `packages/shared/src/lib/contracts/content-api.ts` so
`ContentDocumentResponse` and `ContentVersionDocumentResponse` can carry
optional resolution metadata:

```ts
export type ContentResolveError = {
  code:
    | "REFERENCE_NOT_FOUND"
    | "REFERENCE_DELETED"
    | "REFERENCE_TYPE_MISMATCH"
    | "REFERENCE_FORBIDDEN";
  message: string;
  ref: {
    documentId: string;
    type: string;
  };
};

export type ResolveErrorsMap = Record<string, ContentResolveError>;
```

Then add:

```ts
resolveErrors?: ResolveErrorsMap;
```

to the full-document response types only.

**Step 4: Run typecheck**

Run: `bun run typecheck`

Expected: PASS for shared contract updates before server implementation begins.

**Step 5: Commit**

```bash
git add docs/specs/SPEC-003-content-storage-versioning-and-migrations.md docs/specs/SPEC-008-cli-and-sdk.md packages/shared/src/lib/contracts/content-api.ts
git commit -m "docs: define cms-26 resolve contract"
```

Do not stage or commit anything under `docs/plans/`.

### Task 2: Add Failing CMS-26 Integration Coverage

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing tests**

Add targeted DB-backed tests in `apps/server/src/lib/content-api.test.ts` for:

- list reads resolve a valid reference inline
- single-document reads accept `resolve` and resolve inline
- immutable version reads accept `resolve` and resolve inline
- `GET /api/v1/content/:documentId/versions` ignores `resolve` support and
  remains summary-only
- invalid `resolve` field path returns `INVALID_QUERY_PARAM`
- non-reference `resolve` field path returns `INVALID_QUERY_PARAM`
- missing referenced target returns `null` plus
  `resolveErrors["frontmatter.author"].code === "REFERENCE_NOT_FOUND"`
- deleted referenced target returns `REFERENCE_DELETED`
- type mismatch between stored ref metadata and fetched target returns
  `REFERENCE_TYPE_MISMATCH`
- forbidden referenced target returns `REFERENCE_FORBIDDEN`
- published reads do not expand draft-only referenced targets
- `draft=true` reads can expand draft-visible referenced targets

Seed schema registry entries with reference metadata in the test fixture, for
example:

```ts
const resolvedSchema = {
  type: "BlogPost",
  directory: "content/blog",
  localized: true,
  fields: {
    author: {
      kind: "string",
      required: false,
      nullable: true,
      reference: { targetType: "Author" },
    },
  },
};
```

Also add at least one nested path fixture, such as `frontmatter.hero.author`,
to verify full-path keys in `resolveErrors`.

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "resolve|reference"
```

Expected: FAIL because the routes currently accept `resolve` only on list reads
and do not perform any reference expansion.

**Step 3: Commit the failing tests**

```bash
git add apps/server/src/lib/content-api.test.ts
git commit -m "test: codify cms-26 resolve behavior"
```

### Task 3: Implement Query Parsing And Schema Path Validation

**Files:**

- Modify: `apps/server/src/lib/content-api/types.ts:54-190`
- Modify: `apps/server/src/lib/content-api/parsing.ts:1-240`
- Create: `apps/server/src/lib/content-api/reference-resolution.ts`
- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Extend the route dependencies and query parsing**

Update `apps/server/src/lib/content-api/types.ts` so route options can load the
resolved schema for a type in the routed scope:

```ts
import type { SchemaRegistryTypeSnapshot } from "@mdcms/shared";

export type ContentSchemaLookup = (
  scope: ContentScope,
  type: string,
) => Promise<SchemaRegistryTypeSnapshot | undefined>;

export type MountContentApiRoutesOptions = {
  store: ContentStore;
  authorize: ContentRequestAuthorizer;
  requireCsrf: ContentRequestCsrfProtector;
  getSchemaSnapshot: ContentSchemaLookup;
};
```

In `apps/server/src/lib/content-api/parsing.ts`, add a parser that normalizes
`resolve` from `string | string[] | undefined` into a deduplicated string array
and rejects empty segments.

**Step 2: Create the schema-aware resolver helpers**

Create `apps/server/src/lib/content-api/reference-resolution.ts` with pure
helpers to:

- normalize field paths to full `frontmatter.*` paths
- walk `SchemaRegistryTypeSnapshot.fields`
- verify each requested path points at a reference field
- extract `{ documentId, type }` from the stored reference value
- build deterministic `RuntimeError` instances for invalid query paths

Suggested shape:

```ts
export type ParsedResolveField = {
  requestPath: string;
  frontmatterPath: string;
  segments: string[];
  targetType: string;
};

export function parseResolveFields(
  rawResolve: string | string[] | undefined,
  schema: SchemaRegistryTypeSnapshot,
): ParsedResolveField[] {
  // normalize, validate, dedupe, throw INVALID_QUERY_PARAM on invalid input
}
```

**Step 3: Wire schema lookup into the real server runtime**

Update `apps/server/src/lib/runtime-with-modules.ts` so
`mountContentApiRoutes()` receives `getSchemaSnapshot`. The callback should read
`schema_registry_entries.resolved_schema` for the routed `(project, environment,
type)` tuple using the existing database connection.

Keep the `createHandler()` helper in `apps/server/src/lib/content-api.test.ts`
working by passing a simple stub that returns `undefined` when tests do not
exercise `resolve`.

**Step 4: Run the targeted tests**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "resolve|reference"
```

Expected: FAIL later in the flow because routes still do not perform reference
expansion, but invalid-path cases should now be able to compile against the new
helpers.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api/types.ts apps/server/src/lib/content-api/parsing.ts apps/server/src/lib/content-api/reference-resolution.ts apps/server/src/lib/content-api.ts apps/server/src/lib/runtime-with-modules.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): add cms-26 resolve validation scaffolding"
```

### Task 4: Resolve References In Read Responses

**Files:**

- Modify: `apps/server/src/lib/content-api/routes.ts:1-240`
- Modify: `apps/server/src/lib/content-api/responses.ts:19-70`
- Modify: `apps/server/src/lib/content-api/reference-resolution.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the response-level resolution flow**

In `apps/server/src/lib/content-api/reference-resolution.ts`, add a helper that
resolves requested references for a returned document by:

- validating the root document schema
- reading the stored ref payload from `frontmatter`
- fetching the target through `store.getById(scope, documentId, { draft })`
- authorizing secondary reads against the resolved target path
- returning an updated document payload plus `resolveErrors`

Suggested shape:

```ts
export async function resolveDocumentReferences(input: {
  document: ContentDocument | ContentVersionDocument;
  scope: ContentScope;
  resolveFields: ParsedResolveField[];
  draft: boolean;
  getById: ContentStore["getById"];
  authorizeDocumentPath: (path: string) => Promise<void>;
}): Promise<{
  frontmatter: Record<string, unknown>;
  resolveErrors?: ResolveErrorsMap;
}> {
  // replace successful fields inline
  // set null + resolveErrors for missing/deleted/type mismatch/forbidden
}
```

Use full field paths like `frontmatter.author` and `frontmatter.hero.author`
when populating `resolveErrors`.

**Step 2: Apply resolution to all full-document read endpoints**

Update `apps/server/src/lib/content-api/routes.ts` so these endpoints parse and
apply `resolve`:

- `GET /api/v1/content`
- `GET /api/v1/content/:documentId`
- `GET /api/v1/content/:documentId/versions/:version`

Do not change `GET /api/v1/content/:documentId/versions`.

For list reads, resolve each returned document independently after the primary
authorization checks succeed. For immutable version reads, resolve referenced
targets via published-mode reads.

**Step 3: Serialize `resolveErrors`**

Update `apps/server/src/lib/content-api/responses.ts` so
`toDocumentResponse()` and `toVersionDocumentResponse()` include
`resolveErrors` when present and omit it when absent.

**Step 4: Run the targeted tests to verify they pass**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "resolve|reference"
```

Expected: PASS for the new CMS-26 cases.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api/routes.ts apps/server/src/lib/content-api/responses.ts apps/server/src/lib/content-api/reference-resolution.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): implement cms-26 reference expansion"
```

### Task 5: Verify Adjacent Behavior And Finish

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Add any missing regression coverage**

Fill any remaining gaps found while implementing, especially:

- published-default reads still behave like CMS-25
- immutable version reads still return unchanged base snapshot fields
- version-summary endpoint stays summary-only
- non-`resolve` reads still omit `resolveErrors`

**Step 2: Run the focused server test file**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts
```

Expected: PASS

**Step 3: Run workspace validation required by repo policy**

Run:

```bash
bun run format:check
bun run check
```

Expected: PASS

**Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected:

- code/spec files for CMS-26 are staged or committed as intended
- local-only paths remain unstaged and untracked:
  - `AGENTS.md`
  - `ROADMAP_TASKS.md`
  - `docs/plans/`

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.test.ts
git commit -m "test: finalize cms-26 regression coverage"
```

Do not stage or commit anything under `docs/plans/`.
