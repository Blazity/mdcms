# CMS-28 CMS-29 Reference Identity And Schema Hash Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement CMS-28 and CMS-29 together so content create/update writes
require a matching target-environment schema hash and persist reference fields
as validated env-local `document_id` UUID strings.

**Architecture:** Keep the schema-hash gate at the route layer because it is an
HTTP contract keyed off request headers and target-environment sync state. Keep
reference validation in reusable content-store helpers so DB-backed routes,
in-memory tests, and future write flows all enforce the same storage contract
after the schema gate passes.

**Tech Stack:** Bun, Nx, TypeScript, Elysia, Drizzle, Postgres, Zod, Node test

---

### Task 1: Publish The Normative Contract

**Files:**

- Modify: `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- Modify: `docs/specs/SPEC-004-schema-system-and-sync.md`
- Modify: `apps/server/README.md`

**Step 1: Update the schema-system spec**

Add the approved CMS-29 write-gate contract to
`docs/specs/SPEC-004-schema-system-and-sync.md`. Document:

- `x-mdcms-schema-hash` on `POST /api/v1/content`
- `x-mdcms-schema-hash` on `PUT /api/v1/content/:documentId`
- `SCHEMA_HASH_REQUIRED` (`400`)
- `SCHEMA_NOT_SYNCED` (`409`)
- `SCHEMA_HASH_MISMATCH` (`409`)
- stored reference values are plain env-local `document_id` strings

**Step 2: Update the content spec**

Update `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` so
the reference section and endpoint table match the approved contract. Keep
`resolve=` as read-time expansion only and keep `INVALID_INPUT` (`400`) as the
reference-validation failure code.

**Step 3: Update the point-of-use server docs**

Add a short operator-facing note to `apps/server/README.md` covering:

- required `x-mdcms-schema-hash` on content create/update
- the three schema-gate errors
- stored reference fields are env-local document ID strings

**Step 4: Run format check for the doc edits**

Run:

```bash
bun run format:check
```

Expected: PASS or only unrelated pre-existing failures outside these doc edits.

**Step 5: Commit**

```bash
git add docs/specs/SPEC-003-content-storage-versioning-and-migrations.md docs/specs/SPEC-004-schema-system-and-sync.md apps/server/README.md
git commit -m "docs: define cms-28 and cms-29 content write contract"
```

Do not stage or commit anything under `docs/plans/`.

### Task 2: Add Failing Schema-Gate Coverage

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Add failing route tests for missing and stale schema state**

Add DB-backed route tests in `apps/server/src/lib/content-api.test.ts` for:

- missing `x-mdcms-schema-hash` returns `SCHEMA_HASH_REQUIRED`
- missing target schema sync record returns `SCHEMA_NOT_SYNCED`
- mismatched header and server hash returns `SCHEMA_HASH_MISMATCH`
- matching hash allows create/update to proceed

Reuse the existing schema-seeding helpers where possible, and add one helper
that can seed a known `schemaHash` for the target environment.

**Step 2: Run the targeted tests to verify they fail**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "schema hash|SCHEMA_HASH|not synced"
```

Expected: FAIL because content writes do not currently read or enforce the
schema-hash header.

**Step 3: Commit the failing tests**

```bash
git add apps/server/src/lib/content-api.test.ts
git commit -m "test: codify cms-29 schema hash gate"
```

### Task 3: Implement The Route-Level Schema Hash Gate

**Files:**

- Create: `apps/server/src/lib/content-api/schema-hash.ts`
- Modify: `apps/server/src/lib/content-api/types.ts`
- Modify: `apps/server/src/lib/content-api/parsing.ts`
- Modify: `apps/server/src/lib/content-api/routes.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Add a schema-sync lookup contract for content routes**

Extend `apps/server/src/lib/content-api/types.ts` with a route dependency that
can read the current schema sync state for a routed scope:

```ts
export type ContentSchemaSyncState = {
  schemaHash: string;
};

export type ContentSchemaSyncLookup = (
  scope: ContentScope,
) => Promise<ContentSchemaSyncState | undefined>;
```

Add `getSchemaSyncState` to `MountContentApiRoutesOptions`.

**Step 2: Add header parsing helpers**

In `apps/server/src/lib/content-api/parsing.ts`, add a small parser that reads
`x-mdcms-schema-hash`, trims it, and returns `undefined` for missing values.
Keep error creation in the gate helper so the parser stays generic.

**Step 3: Implement the gate helper**

Create `apps/server/src/lib/content-api/schema-hash.ts` with pure helpers to:

- read `x-mdcms-schema-hash`
- throw `SCHEMA_HASH_REQUIRED` (`400`) on missing/blank values
- throw `SCHEMA_NOT_SYNCED` (`409`) when no sync state exists
- throw `SCHEMA_HASH_MISMATCH` (`409`) when the client hash differs from the
  server hash

Suggested entry point:

```ts
export async function assertSchemaHashMatches(input: {
  request: Request;
  scope: ContentScope;
  getSchemaSyncState: ContentSchemaSyncLookup;
}): Promise<void> {
  // parse header, load sync state, throw RuntimeError when needed
}
```

**Step 4: Wire the gate into create and update routes**

Update `apps/server/src/lib/content-api/routes.ts` so `POST /api/v1/content`
and `PUT /api/v1/content/:documentId` call `assertSchemaHashMatches(...)`
before store writes. Do not add the gate to delete, restore, publish, or
unpublish routes.

**Step 5: Wire the real lookup into the runtime**

Update `apps/server/src/lib/runtime-with-modules.ts` so
`mountContentApiRoutes()` receives a `getSchemaSyncState` callback that reads
the target `(project, environment)` row from `schemaSyncs`.

For tests that mount routes directly, provide a lightweight stub callback.

**Step 6: Run the targeted schema-gate tests**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "schema hash|SCHEMA_HASH|not synced"
```

Expected: PASS for the new schema-gate cases.

**Step 7: Commit**

```bash
git add apps/server/src/lib/content-api/schema-hash.ts apps/server/src/lib/content-api/types.ts apps/server/src/lib/content-api/parsing.ts apps/server/src/lib/content-api/routes.ts apps/server/src/lib/runtime-with-modules.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): add cms-29 schema hash gate"
```

### Task 4: Add Failing Reference-Identity Coverage

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Add failing create/update tests for reference writes**

Add DB-backed tests in `apps/server/src/lib/content-api.test.ts` for:

- valid reference UUID strings succeed on create and update when the schema hash
  gate passes
- malformed UUID strings return `INVALID_INPUT`
- non-string reference values return `INVALID_INPUT`
- missing referenced targets return `INVALID_INPUT`
- deleted referenced targets return `INVALID_INPUT`
- wrong-type referenced targets return `INVALID_INPUT`
- nested object references validate recursively
- arrays of references validate recursively

Reuse the existing CMS-26 schema fixture and extend it with at least one array
reference field so the write helper has both nested-object and array coverage.

**Step 2: Add direct-store tests for DB and in-memory parity**

Add focused direct-store tests proving both `createDatabaseContentStore(...)`
and `createInMemoryContentStore(...)` enforce the same reference validation
when schema snapshots are present for the target type.

**Step 3: Run the targeted tests to verify they fail**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "reference identity|reference write|cms-28"
```

Expected: FAIL because writes currently accept arbitrary JSON values in
`frontmatter`.

**Step 4: Commit the failing tests**

```bash
git add apps/server/src/lib/content-api.test.ts
git commit -m "test: codify cms-28 reference identity"
```

### Task 5: Implement Reusable Reference Validation

**Files:**

- Create: `apps/server/src/lib/content-api/reference-validation.ts`
- Modify: `apps/server/src/lib/content-api/database-store.ts`
- Modify: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `apps/server/src/lib/content-api/parsing.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Create a reusable reference-validation helper**

Create `apps/server/src/lib/content-api/reference-validation.ts` with pure
schema walkers that:

- traverse nested objects and arrays
- detect reference-bearing fields from `SchemaRegistryTypeSnapshot`
- validate that each stored value is a UUID string
- return full frontmatter paths such as `frontmatter.author` or
  `frontmatter.reviewers[0]`

Suggested shape:

```ts
export type ReferenceValidationFailure = {
  fieldPath: string;
  reason:
    | "invalid_shape"
    | "invalid_uuid"
    | "not_found"
    | "deleted"
    | "type_mismatch";
  targetType: string;
  documentId?: string;
};
```

**Step 2: Integrate the helper into the database store**

Update `apps/server/src/lib/content-api/database-store.ts` so create/update:

- load the effective type schema for the routed environment
- reject unknown types with `INVALID_INPUT`
- validate reference fields before insert/update
- resolve targets only within the same routed `(project, environment)`
- reject deleted or wrong-type targets with `INVALID_INPUT`

Keep non-reference field behavior unchanged.

**Step 3: Integrate the helper into the in-memory store**

Update `apps/server/src/lib/content-api/in-memory-store.ts` so the in-memory
store enforces the same reference rules when schema snapshots are present.

This keeps route tests and direct store tests aligned.

**Step 4: Run the targeted reference tests**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts --test-name-pattern "reference identity|reference write|cms-28"
```

Expected: PASS for the new reference-write cases.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api/reference-validation.ts apps/server/src/lib/content-api/database-store.ts apps/server/src/lib/content-api/in-memory-store.ts apps/server/src/lib/content-api/parsing.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): enforce cms-28 reference identity"
```

### Task 6: Run Full Verification And Cleanup

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`
- Modify: `apps/server/src/lib/content-api/routes.ts`
- Modify: `apps/server/src/lib/content-api/database-store.ts`
- Modify: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- Modify: `docs/specs/SPEC-004-schema-system-and-sync.md`
- Modify: `apps/server/README.md`

**Step 1: Run the focused server suite**

Run:

```bash
bun test apps/server/src/lib/content-api.test.ts
```

Expected: PASS for existing content API coverage plus the new CMS-28/CMS-29
cases.

**Step 2: Run workspace format check**

Run:

```bash
bun run format:check
```

Expected: PASS.

**Step 3: Run the workspace baseline check**

Run:

```bash
bun run check
```

Expected: PASS.

**Step 4: Confirm git hygiene**

Run:

```bash
git status --short
```

Expected:

- only task-related tracked files are staged or modified
- local-only paths such as `docs/plans/`, `ROADMAP_TASKS.md`, `AGENTS.md`, and
  `.codex/` remain unstaged and uncommitted

**Step 5: Final commit**

```bash
git add docs/specs/SPEC-003-content-storage-versioning-and-migrations.md docs/specs/SPEC-004-schema-system-and-sync.md apps/server/README.md apps/server/src/lib/content-api/schema-hash.ts apps/server/src/lib/content-api/reference-validation.ts apps/server/src/lib/content-api/types.ts apps/server/src/lib/content-api/parsing.ts apps/server/src/lib/content-api/routes.ts apps/server/src/lib/content-api/database-store.ts apps/server/src/lib/content-api/in-memory-store.ts apps/server/src/lib/runtime-with-modules.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): enforce cms-28 and cms-29 content write contracts"
```

Do not stage or commit anything under `docs/plans/`.
