# AI chat — grounding the model in real project data

**Status:** Design, ready for implementation planning.
**Date:** 2026-05-16

## Context

The Studio AI chat assistant currently hallucinates project-specific data because the model has no visibility into what actually exists. Concrete failure we observed in production this week: a user asked "make a new blog post" against the `marketing-site:staging` project. The model invented `type: "blog"` from the path heuristic in the system prompt. The project's registered types are actually `author`, `campaign`, `page`, `post` — no `blog`. The validator built in CMS-235 caught the lie after the fact (`UNKNOWN_CONTENT_TYPE`), but the lie shouldn't have been possible.

Same class of bug affects other surfaces:

- Reference fields (e.g. setting `author` on a new post): the model has no way to look up which authors exist, so it either makes up an id or omits the field.
- Locales: model defaults to `"en"`, may not know which locales the project actually supports.
- Required frontmatter shape per type: model fills in what feels right rather than what the schema requires.
- Path collisions: model picks a path that's already taken.

The pattern from the Anthropic Architect Foundations exam guide (Domain 2 — Tool Design + MCP Integration) frames the answer: **resources** for bounded static facts the agent needs every turn (content catalogs, capability lists), **tools** for unbounded dynamic lookups (search results, individual entry details), and **validators** as a server-side trust boundary for everything the agent emits. Our Vercel AI SDK setup is the same shape — system-prompt context as resources, `tool()` definitions as tools, the CMS-235 proposalValidator as the trust boundary.

This design grounds the chat model comprehensively: every fact the model could hallucinate gets either pre-injected as context, retrievable as a tool call, or caught by a validator.

## Goals

- The model never needs to *guess* a content type. The registered types and their schemas are in the system prompt.
- The model never needs to *invent* a reference id. A `find_entries` tool returns real candidates.
- The model can read a specific entry's full content when comparing or cross-referencing via a `get_entry` tool.
- The validator backstop catches lies the model still slips through: unknown types, missing required fields, unknown fields, wrong-type values, taken paths, dangling references.
- The plumbing is project-aware (per-project schema + locale + user) and request-cheap (parallel DB fetches, no caching needed for v1 sizes).

## Non-goals (v1)

- MDX component catalog grounding (blocked on the catalog itself — separate ticket).
- Body-embedded reference validation (model emits `<Link to="doc_xyz" />` inside MDX bodies) — same catalog dependency.
- Semantic / embedding search for `find_entries` — substring + path match for v1; swap in CMS-148's search index later without changing the tool signature.
- Provider prompt caching — Groq doesn't support it; the design positions the static block to be cache-friendly so a future Anthropic switch picks it up.
- Caching of the four per-turn project-knowledge lookups — bounded DB cost; add caching when latency observation demands it.
- Roles / team / group context beyond user name + id.

## Architecture overview

Three pillars, layered by cost:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. STATIC CONTEXT — system prompt, every turn               │
│    • Content type catalog (names + schemas)                  │
│    • Supported locales                                       │
│    • Current user identity                                   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 2. TOOLS — model-callable lookups, called on demand          │
│    • find_entries({ type, query?, locale?, limit? })         │
│    • get_entry({ documentId })                               │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 3. VALIDATOR — server-side proof on every proposal           │
│    • UNKNOWN_CONTENT_TYPE              (CMS-235, existing)   │
│    • MISSING_REQUIRED_FRONTMATTER      (CMS-235, existing)   │
│    • UNKNOWN_FRONTMATTER_FIELD         (CMS-235, existing)   │
│    • INVALID_FRONTMATTER_TYPE          (CMS-235, existing)   │
│    • PATH_ALREADY_IN_USE                          (new)      │
│    • UNKNOWN_REFERENCE                            (new)      │
└─────────────────────────────────────────────────────────────┘
```

The split: facts the model needs every turn and that fit cheaply in the prompt go into the system prompt. Facts that don't fit (entire author rosters, full document bodies) go behind tools. Anything the model can still get wrong gets caught by the validator before it lands on a proposal card.

## Static context — system prompt block

A new section in `buildChatSystemPrompt` injects this block, rendered from per-turn lookup results.

### Concrete render (marketing-site:staging)

```
## Project knowledge

Project: marketing-site
Environment: staging
Current user: Karol Chudzik (id: 712020:35547964-…)

### Content types registered in this project
Use these exact `type` ids when calling propose_create_document.
Anything else will fail validation. Path prefixes are conventions, not enforced.

- **author** (directory: authors/, localized: no)
  Fields:
  - name (string, required)
  - bio (string, optional, nullable)
  - avatar (image, optional, nullable)

- **campaign** (directory: campaigns/, localized: yes)
  Fields:
  - title (string, required)
  - status (enum: "planned" | "live" | "archived", required)
  - launchDate (date, required)
  - owner (reference → author, optional)

- **page** (directory: pages/, localized: no)
  Fields:
  - title (string, required)
  - body (richText, optional)

- **post** (directory: blog/, localized: yes)
  Fields:
  - title (string, required)
  - date (date, required)
  - excerpt (string, optional, nullable)
  - author (reference → author, optional, nullable)
  - tags (array of string, optional)
  - published (boolean, optional)

### Supported locales
en, pl

### Reference fields require real entry ids
When a field is `reference → <type>`, fill it with a documentId that
exists in this project. Use the `find_entries` tool to look up
candidates. Do not invent ids — the apply will reject them.
```

### Rendering rules

- Per-type heading with directory + localized flag.
- Field bullet format: `name (kind, required|optional, nullable?)`.
- Enum kinds inline-render their options (`status (enum: "a" | "b" | "c", required)`).
- Reference kinds inline-render their target type (`author (reference → author, optional)`).
- Array kinds inline-render the item kind (`tags (array of string, optional)`).
- Nested object fields render as sub-bullets, capped at depth 2 — deeper nesting renders as `<nested object>` with a hint that the model should call `get_entry` on a sibling document for the full shape.
- Types sorted alphabetically (deterministic for snapshot tests + provider prompt caching).

### Format choice rationale

Markdown bullets, not JSON or TypeScript types. LLMs parse tabular markdown more reliably than nested JSON when reading their own context. The token cost is ~70% lower than the equivalent indented JSON. Tool *outputs* stay JSON because that's what the model parses programmatically.

### Token budget

| Project size | Project knowledge block |
|---|---|
| Small (~4 types) | ~600 tokens |
| Medium (~15 types) | ~2,100 tokens |
| Large (~50 types) | ~6,200 tokens |

For `openai/gpt-oss-120b` (128k context), even the large case is <5% of the window. At Groq pricing (~$0.50 / 1M input), a 20-turn conversation in a 50-type project runs ~$0.10 of input cost.

## Tool: `find_entries`

### Description (model-facing)

> Search the project's documents by content type with an optional text query. Use this when:
> 1. **Filling a reference field on a proposal** — e.g. setting `author` on a new post. Call `find_entries({ type: "author", query: "<name>" })` and pick the right `documentId` from the results.
> 2. **Checking what already exists** before proposing a new draft to avoid duplicates.
>
> Returns up to `limit` matches (default 10, max 25), most-recently-updated first. The `type` parameter is enum-constrained to the project's registered content types; passing anything else fails the call. Do not use this for editing — combine with the propose_* tools after picking a result.

### Input schema (Zod, dynamic enums per turn)

```ts
z.object({
  type: z.enum([...registeredTypes]),
  query: z.string().optional(),
  locale: z.enum([...supportedLocales]).optional(),
  limit: z.number().int().min(1).max(25).optional(),
})
```

The `type` and `locale` enums are constructed at chat-time from the per-turn `projectKnowledge`. Vercel SDK rejects mismatched values before our `execute` runs — the model literally cannot ask for a nonexistent type.

### Output shape

```ts
{
  matches: [
    {
      documentId: string,
      path: string,
      type: string,
      locale: string,
      title?: string,                    // pulled from frontmatter when present
      summary?: string,                  // first 200 chars of excerpt or body
      updatedAt: string,
      hasUnpublishedChanges: boolean,
    },
    …
  ],
  total: number,                          // total matches even if > limit
}
```

### Capability gating

Registered only when the caller has `content:read:draft`. Without that, the tool isn't on the toolset → graceful degradation, model answers in text.

### Backend

Wraps the existing `listContent` query path the @-mention picker already uses. When CMS-148 ships, the implementation swaps the substring matcher for the real search index without touching the tool signature.

### Error responses (structured per CMS-236)

```ts
{ errorCategory: "transient",  isRetryable: true,  message: "..." }   // DB blip
{ errorCategory: "validation", isRetryable: true,  message: "..." }   // bad query
```

## Tool: `get_entry`

### Description (model-facing)

> Fetch the full body + frontmatter of a specific document by its `documentId`. Use this when:
> 1. You need to read an existing document's content before proposing changes to a *different* document that references or links to it.
> 2. You picked a candidate from `find_entries` and want to read its full content before referencing or duplicating parts of it.
>
> Returns the document's frontmatter, body, type, locale, path, and revision info. If the document doesn't exist or has been soft-deleted, returns an error. The active document the user is editing is already in your context — don't call this for it.

### Input schema

```ts
z.object({
  documentId: z.string().min(1),
})
```

### Output shape

```ts
{
  documentId: string,
  path: string,
  type: string,
  locale: string,
  draftRevision: number,
  hasUnpublishedChanges: boolean,
  publishedVersion: number | null,
  frontmatter: Record<string, unknown>,
  body: string,
}
```

### Body length

No truncation by default. Add `bodyMaxChars` input if real bodies blow context (premature otherwise).

### Capability gating

`content:read:draft`. Tool absent when caller lacks it.

### Backend

Wraps `GET /api/v1/content/:documentId?draft=true` (the editor already uses this).

### Error responses

```ts
{ errorCategory: "validation", isRetryable: false, message: "documentId not found" }
{ errorCategory: "validation", isRetryable: false, message: "document is deleted" }
{ errorCategory: "transient",  isRetryable: true,  message: "..." }
```

## Validator extensions

Two new error codes plug into `createSchemaAwareProposalValidator` from CMS-235.

### `PATH_ALREADY_IN_USE`

Fires on `create_document` proposals where the proposed path already belongs to a non-deleted document in the same project + environment.

```ts
{
  code: "PATH_ALREADY_IN_USE",
  message: "Path 'blog/poems/morning-poem' is already used by another document — pick a different path or update the existing doc instead.",
  path: "operations[0].path",
}
```

New validator dependency:

```ts
type PathLookup = (input: {
  project: string;
  environment: string;
  path: string;
}) => Promise<boolean>;
```

### `UNKNOWN_REFERENCE`

Fires on `create_document` and `update_frontmatter` proposals when a reference-kind field's value points to a documentId that doesn't exist (or is soft-deleted).

Walk `schema.fields` looking for `field.kind === "reference"`. For each present reference in the proposal's frontmatter (or patch), extract the documentId and verify it resolves. Aggregate one error per missing reference so the card shows all dangling references at once.

```ts
{
  code: "UNKNOWN_REFERENCE",
  message: "Field 'author' references documentId 'doc_xyz' which does not exist in this project.",
  path: "frontmatter.author",
}
```

New validator dependency:

```ts
type DocumentLookup = (input: {
  project: string;
  environment: string;
  documentId: string;
}) => Promise<boolean>;
```

### Reference value shape — open question

The schema declares `reference?: { targetType: string }` on the field but the **runtime shape of a reference value in stored frontmatter** isn't clear from spec. Candidates: bare string `"doc_xyz"`, object `{ ref: "doc_xyz" }`, or object `{ documentId: "doc_xyz", type: "author" }`. Implementation plan grep the content store + existing seed data to confirm. Validator extractor handles the one shape MDCMS actually uses.

### Updated factory signature

```ts
createSchemaAwareProposalValidator({
  schemaLookup,       // existing (CMS-235)
  pathExists,         // new
  documentExists,     // new
});
```

### Body-embedded references — out of scope

MDX `<Link to="doc_xyz" />` inside `body` content is not validated. Pairs with the MDX catalog work; separate ticket.

## Server-side wiring

### Dependency layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ runtime-with-modules.ts (host)                                       │
│   ├── contentTypesLookup, supportedLocalesLookup, userLookup         │
│   ├── listEntries, getEntry                          (chat backends) │
│   └── pathExists, documentExists                     (validator)     │
└──────────────────────────────────────────────────────────────────────┘
            │                                  │
            │ MountAiRoutesOptions             │ createSchemaAwareProposalValidator
            ▼                                  ▼
┌─────────────────────────────────┐  ┌─────────────────────────────┐
│ handleChatMessage               │  │ proposal validator          │
│   (per-turn data gathering)     │  │ (per-proposal, await)       │
└─────────────────────────────────┘  └─────────────────────────────┘
            │
            │ AiChatInput.projectKnowledge + AiChatInput.toolBackends
            ▼
┌─────────────────────────────────┐
│ orchestrator.runChat            │
│   ├── buildChatSystemPrompt     │ (renders the project-knowledge block)
│   └── buildChatTools            │ (enum-constrains type/locale; wires backends)
└─────────────────────────────────┘
```

### `MountAiRoutesOptions` additions

```ts
type MountAiRoutesOptions = {
  // ... existing fields ...

  // Per-turn project knowledge
  contentTypesLookup: (i: { project; environment }) => Promise<SchemaRegistryTypeSnapshot[]>;
  supportedLocalesLookup: (i: { project; environment }) => Promise<string[]>;
  userLookup: (i: { userId }) => Promise<{ id: string; displayName: string }>;

  // Tool backends
  listEntries: (i: { project; environment; type; query?; locale?; limit? }) => Promise<FindEntriesResult>;
  getEntry: (i: { project; environment; documentId }) => Promise<GetEntryResult | null>;
};
```

### `AiChatInput` additions

```ts
type AiChatInput = {
  // ... existing fields ...
  projectKnowledge: {
    registeredTypes: SchemaRegistryTypeSnapshot[];
    supportedLocales: string[];
    currentUser?: { id: string; displayName: string };
  };
  toolBackends: {
    findEntries: typeof MountAiRoutesOptions["listEntries"];
    getEntry: typeof MountAiRoutesOptions["getEntry"];
  };
};
```

### `handleChatMessage` flow

```
1. CSRF + routing + authorize           (existing)
2. Validate body                        (existing)
3. Resolve allowed actions              (existing)
4. PARALLEL FETCH (Promise.all):        (new)
     - attached doc context             (existing — now parallel)
     - contentTypesLookup
     - supportedLocalesLookup
     - userLookup(actorId)
5. orchestrator.runChat({
     ...,
     projectKnowledge,
     toolBackends: { findEntries: listEntries, getEntry },
   })
6. Audit + response                     (existing)
```

### `runtime-with-modules.ts` wiring

```ts
const contentTypesLookup = async ({ project, environment }) => {
  const scope = await resolveProjectEnvironmentScope(db, { project, environment });
  if (!scope) return [];
  const rows = await db.query.schemaRegistryEntries.findMany({
    where: and(
      eq(schemaRegistryEntries.projectId, scope.project.id),
      eq(schemaRegistryEntries.environmentId, scope.environment.id),
    ),
  });
  return rows.map((r) => r.resolvedSchema as SchemaRegistryTypeSnapshot);
};

const userLookup = async ({ userId }) => {
  const row = await db.query.authUsers.findFirst({
    where: eq(authUsers.id, userId),
    columns: { id: true, displayName: true, email: true },
  });
  return row
    ? { id: row.id, displayName: row.displayName ?? row.email }
    : { id: userId, displayName: userId };
};

const listEntries = async ({ project, environment, type, query, locale, limit }) =>
  contentStore.list(
    { project, environment },
    { type, query, locale, limit: limit ?? 10, draft: true },
  );

const getEntry = async ({ project, environment, documentId }) =>
  contentStore.getById({ project, environment }, documentId, { draft: true });

const pathExists = async ({ project, environment, path }) => {
  const existing = await contentStore.getByPath({ project, environment }, path, { draft: true });
  return existing !== null && !existing.isDeleted;
};

const documentExists = async ({ project, environment, documentId }) => {
  const doc = await contentStore.getById({ project, environment }, documentId, { draft: true });
  return doc !== null && !doc.isDeleted;
};
```

All five are thin wrappers around the existing `contentStore` + Drizzle schema. No new tables, no new query patterns.

### What stays unchanged

- Vercel AI SDK call shape (`generateText` with tools + system + prompt + `stopWhen`).
- The five `propose_*` tools' input schemas — `find_entries` and `get_entry` are purely additive.
- Chat wire contract (request/response). New fields are server-internal.
- localStorage / proposal persistence. Proposals flow exactly as today.
- Audit records — the two new lookup tools emit no proposals so they don't show up in audits except via token usage.

## Per-turn perf

| Cost surface | Magnitude |
|---|---|
| Project knowledge in prompt | ~600 tokens for small projects, ~6k for 50-type projects |
| DB fetch (4 parallel queries) | ~3 ms added wall-clock (longest query dominates) |
| `find_entries` tool call | ~10 ms backend + ~500-2000 result tokens |
| `get_entry` tool call | ~5 ms backend + body-size result tokens |

Two scenarios to monitor:

1. **Schemas with deeply-nested object fields.** Recursive rendering can balloon tokens. Mitigation: cap rendering at depth 2 (built into the design); deeper structures render as `<nested object>` with a hint to use `get_entry` on a similar existing doc.
2. **`get_entry` on long documents.** A 50k-character body fills context. Mitigation deferred: add `bodyMaxChars` input if observed.

## Testing strategy

### Unit tests

**NEW `project-knowledge.test.ts`** — pure prompt-block builder:
- Empty types → minimal block.
- Reference field renders `reference → <target>`.
- Enum field renders `enum: "a" | "b"`.
- Array field renders `array of string`.
- Nested object renders sub-bullets up to depth 2; deeper → `<nested object>`.
- Types sorted alphabetically (deterministic snapshot).
- Snapshot against the marketing-site fixture to catch drift.

**NEW `chat-tools.test.ts`** — `find_entries` and `get_entry`:
- `find_entries.type` enum is constrained to `registeredTypes`; unregistered → SDK validation fails pre-execute.
- Locale filter passes through.
- `limit` defaults to 10, caps at 25.
- Backend errors → structured `errorCategory: "transient"` results.
- `get_entry` returns full body + frontmatter; NOT_FOUND / soft-deleted → `errorCategory: "validation"`, `isRetryable: false`.
- Both tools only register when `canRead` is set.

**EXTEND `validate-proposal.test.ts`** (CMS-235):
- `PATH_ALREADY_IN_USE`: pathExists true → invalid; pathExists false → no error.
- `UNKNOWN_REFERENCE`: single missing → invalid; multiple references where some valid + some missing → only missing in errors; null on nullable ref → no error.

### Integration tests (`routes.test.ts`)

- **System prompt grounding**: chat-message with mocked lookups → orchestrator receives populated `projectKnowledge`. Rendered system prompt matches expectations.
- **`find_entries` end-to-end**: echo-scripted tool call → backend invoked with model's args → result fed back.
- **`get_entry` end-to-end**: same flow.
- **`PATH_ALREADY_IN_USE`**: scripted create_document at a taken path → response carries `validation.status: "invalid"` + `PATH_ALREADY_IN_USE`.
- **`UNKNOWN_REFERENCE`**: scripted create with author ref where `documentExists` returns false → invalid with `UNKNOWN_REFERENCE`.
- **Capability gating**: caller without `content:read:draft` → tools not registered, model answers in text.

### Manual smoke

1. "Find me a post by John" → model calls `find_entries`, surfaces results.
2. "Make a new blog post by John Doe" → model calls `find_entries`, then `propose_create_document` with the resolved author id. Card validates green.
3. "Make a new post at blog/welcome" (path taken) → INVALID with `PATH_ALREADY_IN_USE`.
4. "Create a `podcast` post" (unknown type) → SDK rejects the call pre-execute; model retries or answers in text.

## Open questions (resolve at implementation time)

1. **Reference field value shape** — grep content store + seed data to confirm `"doc_xyz"` vs `{ ref }` vs `{ documentId, type }`. Validator extractor handles the actual shape.
2. **Locale list source** — project config table, schemaSyncs metadata, mount context's `supportedLocales` field, or environment table? Existing `useStudioMountInfo` surfaces the list on the client, so the source exists somewhere reachable on the server.
3. **`userLookup` field choice** — `authUsers.displayName` else `email` else `id` fallback. Confirm column population state.
4. **`contentStore.list`** — verify it already supports `type` + `query` + `locale` filters with the semantics `find_entries` needs (substring match on path + frontmatter title, recency-ordered). If not, add the query path before the design works end-to-end. (Path-existence and getByPath probably also need verification.)
5. **Display-name escaping** — sanitize before injecting into the system prompt to avoid markdown-injection from backtick-containing names.

## Verification

End-to-end checks after implementation, in order:

1. `bun run format:check` — clean.
2. `bun --cwd packages/shared tsc --build tsconfig.lib.json` — clean.
3. `bun --cwd packages/modules tsc --build tsconfig.lib.json` — clean.
4. `bun --cwd packages/studio tsc --build tsconfig.lib.json` — clean.
5. `bun --cwd apps/server tsc --build tsconfig.json` — clean.
6. `bun test --cwd packages/modules/core.ai` — all unit + integration tests pass.
7. `bun nx run studio:build && docker compose up -d --build server` — fresh runtime.
8. Manual smoke at `http://localhost:4173/admin/content/...` — the four scenarios listed under "Manual smoke" above.

## Critical files (modify list)

| File | Change |
|---|---|
| `packages/modules/core.ai/src/server/project-knowledge.ts` (NEW) | The prompt-block builder + helper renderers |
| `packages/modules/core.ai/src/server/project-knowledge.test.ts` (NEW) | Snapshot + per-field-kind rendering tests |
| `packages/modules/core.ai/src/server/chat-tools.ts` | Add `find_entries` + `get_entry`; thread type/locale enums + backends through `ChatToolDeps` |
| `packages/modules/core.ai/src/server/chat-tools.test.ts` (NEW) | Tests for the two new tools |
| `packages/modules/core.ai/src/server/tasks.ts` | `buildChatSystemPrompt` accepts `projectKnowledge`, renders the block |
| `packages/modules/core.ai/src/server/orchestrator.ts` | `AiChatInput` gains `projectKnowledge` + `toolBackends`; `runChat` passes them through |
| `packages/modules/core.ai/src/server/routes.ts` | `MountAiRoutesOptions` gains the 5 lookup fields; `handleChatMessage` parallel-fetches; passes to `runChat` |
| `packages/modules/core.ai/src/server/validate-proposal.ts` | Add `pathExists` + `documentExists` deps; emit `PATH_ALREADY_IN_USE` + `UNKNOWN_REFERENCE` |
| `packages/modules/core.ai/src/server/validate-proposal.test.ts` | Extend with new error code tests |
| `packages/modules/core.ai/src/index.ts` | Export new types + factory tweaks |
| `packages/modules/src/index.ts` | Re-export |
| `apps/server/src/lib/runtime-with-modules.ts` | Wire the 5 new lookups + pass new validator deps |
| `packages/modules/core.ai/src/server/routes.test.ts` | Integration tests for system-prompt grounding + new tools + new validator codes |
| `docs/specs/SPEC-014-ai-assisted-studio-editing.md` | Document the new tools + grounding architecture + new error codes |

## Reuse — existing helpers

| Helper | Path | Why |
|---|---|---|
| `createSchemaAwareProposalValidator` | `packages/modules/core.ai/src/server/validate-proposal.ts` | Extend with two new deps + two new error codes |
| `contentStore.list / getById / getByPath` | `apps/server/src/lib/content-api/database-store.ts` | All five lookups are thin wrappers |
| `resolveProjectEnvironmentScope` | `apps/server/src/lib/project-provisioning.ts` | Already used by `lookupSchemaHashForScope` |
| `schemaRegistryEntries` table | `apps/server/src/lib/db/schema.ts` | Schema lookup source — same one CMS-235 uses |
| `authUsers` table | `apps/server/src/lib/db/schema.ts` | `userLookup` source |
| `SchemaRegistryTypeSnapshot` / `SchemaRegistryFieldSnapshot` | `@mdcms/shared` | Shapes for the catalog + per-field rendering |
| `useStudioMountInfo` (mount-info-context.tsx) | `packages/studio/src/lib/runtime-ui/app/admin/mount-info-context.tsx` | `supportedLocales` source — confirm parallel exists server-side |
| Existing `propose_*` tools | `packages/modules/core.ai/src/server/chat-tools.ts` | Pattern for `find_entries` + `get_entry` (capability gating, error structure) |

## Scope summary

~6 source files modified, 3 new files, ~5 test files modified/added. No new tables, no new dependencies. Wire contract unchanged. The new functionality is purely additive: existing chats keep working with no behavior change for projects that haven't installed the lookups (though `runtime-with-modules.ts` will install them by default for the production server).

The implementation plan should phase commits by surface so review stays manageable:

1. Project-knowledge block + system prompt rendering (no new behavior in tools/validator).
2. `find_entries` + `get_entry` tools (backends wired, capability gating).
3. Validator `PATH_ALREADY_IN_USE` + `UNKNOWN_REFERENCE` (resolves the reference-shape open question).
4. Spec update + final integration tests.
