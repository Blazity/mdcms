# CMS-153 Clone & Promote End-to-End — Implementation Plan

Branch: `feat/cms-153-clone-promote-end-to-end`
Tickets in scope: CMS-94, CMS-95, CMS-96, CMS-97, CMS-98 (Epic CMS-153).

## Spec delta

Owning spec is `docs/specs/SPEC-009-i18n-and-environments.md`. The clone and promote contracts, atomic-remap rule, default values (`includeDrafts=true`), reduced MVP payload (no media), and endpoint table (auth mode, scope, errors) are already specified there. **No spec delta required.** Implementation follows the spec verbatim.

## Affected files (new + modified)

- `apps/server/src/lib/environments-api.ts` — extend `EnvironmentStore` with `clone` and `promote`, mount `POST /:id/clone` + `POST /:targetId/promote`.
- `apps/server/src/lib/environments-clone-promote.ts` (new) — clone and promote orchestration; uses the remap helper.
- `apps/server/src/lib/environments-reference-remap.ts` (new) — atomic reference remap walker (CMS-96).
- `apps/server/src/lib/environments-api.test.ts` — extend with clone/promote routes + scope/CSRF coverage.
- `apps/server/src/lib/environments-clone-promote.integration.test.ts` (new) — full DB integration matrix for CMS-97.
- `apps/server/src/lib/runtime-with-modules.ts` — wire `authorizeScoped` (the route option name) so the new routes go through `authService.authorizeRequest({ requiredScope, project, environment })`.
- `packages/shared/src/lib/contracts/environments.ts` — request/response types + Zod schemas for clone/promote.
- `packages/studio/src/lib/environment-api.ts` — client methods `clone` and `promote`.
- `packages/studio/src/lib/runtime-ui/app/admin/environments-page.tsx` — "Clone" action per env card with payload-options dialog.
- `packages/studio/src/lib/runtime-ui/app/admin/promote-page.tsx` (new) — per-document promote workflow.
- `packages/studio/src/lib/runtime-ui/app/admin/environments-page.test.tsx` and `promote-page.test.tsx` — view tests.

## Architecture

### Single shared transaction for both flows

Both clone and promote run inside a single `db.transaction` so any reference-remap failure rolls the whole operation back. Drizzle transactions throwing aborts and propagates the error.

### Reference remap module (`environments-reference-remap.ts`)

Pure function, no I/O of its own — receives:
- `frontmatter: Record<string, unknown>`
- `schema: SchemaRegistryTypeSnapshot`
- `referenceLookup: (sourceDocumentId) => { translationGroupId, locale } | undefined`
- `targetDocumentResolver: (translationGroupId, locale) => targetDocumentId | undefined`

Walks fields the same way `content-api/reference-validation.ts` does (objects + arrays + nested), and for every `field.reference` value:
1. Look up source by `documentId` to get `(translationGroupId, locale)`.
2. Resolve the target by `(translationGroupId, locale)`.
3. If missing, throw `RuntimeError { code: "REFERENCE_REMAP_FAILED", statusCode: 409 }` with details `{ sourceDocumentId, fieldPath, targetType, translationGroupId, locale }`.
4. Otherwise, replace the value (deep-cloning along the way).

Returns the rewritten `frontmatter`. The same module is used by clone (when copying head + latest published) and promote (when overwriting target draft + auto-publishing).

### Clone (CMS-94)

`POST /api/v1/environments/:id/clone` — `:id` is the **target** environment id (already created via `POST /environments`).

Steps inside one transaction:
1. Resolve `(project, sourceEnvId, targetEnvId)`. Validate target ≠ source, both belong to routed project.
2. Load all non-deleted source documents (filter by `includeDrafts === false ⇒ skip rows where publishedVersion is null`).
3. Pre-compute target documentIds (`new uuid()` per source) keyed by `(translationGroupId, locale)`.
4. Build the source-doc lookup `documentId ⇒ (translationGroupId, locale)` over all source docs.
5. For every source document:
   - Remap frontmatter via the helper using the target id map.
   - Insert the new `documents` row with the new `documentId`, preserved `translationGroupId`, target env. `path` is preserved (spec says `preservePaths` is in the payload — we already preserve paths, so the flag controls whether *path conflicts* against the target env are tolerated; for MVP we treat target env as initially empty, so `preservePaths` is informational and surfaced in details).
   - If a `publishedVersion` exists on the source, also insert a `document_versions` row at version 1 in the target with the remapped frontmatter, then update the inserted target row's `publishedVersion = 1` and `hasUnpublishedChanges = false`.
6. `include.settings: true` — copy the latest `schema_syncs` row + `schema_registry_entries` for the source env to the target env (best-effort; if no source sync, no-op). This lets the target environment be queryable immediately.
7. Return `{ data: { targetEnvironmentId, documentsCloned } }`.

Notes:
- `include.content: false` ⇒ skip step 5 entirely.
- Media is explicitly deferred (spec rule). The clone request schema rejects `include.media` to make the deferral observable.
- Target env can be non-empty: in that case the unique constraint `(projectId, environmentId, translationGroupId, locale)` and `(projectId, environmentId, locale, path)` will refuse the insert, surfaced as `CONFLICT` (target environment already populated). Matches "clone creates a new environment with copies", spec implication.

### Promote (CMS-95)

`POST /api/v1/environments/:targetId/promote` — `:targetId` is the target env id.

Steps inside one transaction:
1. Resolve `(project, sourceEnvId, targetEnvId)`. Validate target ≠ source, both belong to routed project.
2. Load each source document by `documentIds`. Reject if any id is unknown or in another env (`NOT_FOUND`).
3. If `includeUnpublished !== true`, filter to docs with `publishedVersion !== null`. (Other docs are skipped silently in dry-run output, surfaced as `skipped: "unpublished"`.)
4. Build source lookup over **all** documents that could be referenced by the promoted set. We resolve dependencies lazily — the remap helper requests `(translationGroupId, locale)` per documentId, served from a memoized SQL query. Forward references to documents *not* in the promoted set still need a target match (matched by `translationGroupId + locale` in the target env). The helper fails atomically if a target match is missing.
5. For each promoted document, find target by `(translationGroupId, locale)`:
   - **Match found:** overwrite `body`, `frontmatter (post-remap)`, `path`, `contentFormat`. `draftRevision := draftRevision + 1`. Then auto-publish: insert `document_versions` row at next version, set `publishedVersion = nextVersion`, `hasUnpublishedChanges = false`.
   - **No match:** insert new `documents` row (new `documentId`, preserved `translationGroupId`, target env). Then auto-publish version 1, same as above.
6. If `dryRun === true`, run all of the above except the actual writes — produce `DocumentPromotionResult[]` describing planned actions. We achieve this by performing the writes inside the transaction and then `throw`ing a sentinel (`DryRunRollbackSentinel`) at the end so Drizzle aborts and we still return the planned diff cleanly. (Alternative: collect plans via pure compute first; we do that to avoid spurious version increments. Final design: pure compute path that does the resolution and remap but doesn't issue writes — same code path, conditional `tx.execute` calls.)
7. Return `{ data: { promoted: DocumentPromotionResult[] } }`.

`DocumentPromotionResult` fields (per spec table requires it; design here):
```ts
type DocumentPromotionResult = {
  sourceDocumentId: string;
  targetDocumentId: string | null;
  status: "overwrote" | "created" | "skipped_unpublished";
  path: string;
  locale: string;
  type: string;
  publishedVersion: number | null;
  remappedReferences: number;
};
```

### Atomic remap (CMS-96)

Concentrates in `environments-reference-remap.ts`. Atomicity is the natural consequence of the surrounding `db.transaction` — the helper throws `REFERENCE_REMAP_FAILED`, the route handler lets it bubble, the transaction rolls back. No partial inserts can survive.

Test plan covers:
- Frontmatter top-level reference, nested object reference, array-of-references.
- Cross-locale promote where source `(grp=g, en)` references `(grp=h, fr)` and target lacks `(h, fr)` ⇒ atomic abort, no rows written.
- Reference to a doc that *will be* created in the same operation (forward/back ref within a clone) ⇒ resolved from the pre-computed `targetDocumentIdByGroupLocale` map.

### Auth and routing

- Both endpoints use `authService.authorizeRequest(request, { requiredScope, project, environment })` — same pattern as content-api.
- Scopes already exist in `auth.ts`: `environments:clone`, `environments:promote`.
- `pickProject(request)` enforces `MISSING_TARGET_ROUTING (400)`.
- CSRF required on both write endpoints (matches existing `POST /environments`).

### Studio UI (CMS-98)

- **Environments page** gains a "Clone..." action on each env's dropdown menu (admin-only, role-gated by existing `useStudioCapabilities` hook). Opens a dialog with:
  - Read-only "Cloning into: `<env name>`".
  - "Source environment" select (excludes self).
  - Toggles: Include content (default on), Include settings (default off), Include drafts (default on), Preserve paths (default on).
  - "Clone" button → call `clone()` API → on `REFERENCE_REMAP_FAILED`, render the error inline with the offending field path; on success, close + toast + refresh.
- **Promote workflow** is a new page reachable from the content list (`/admin/promote`):
  - Source env picker, Target env picker.
  - Multi-select content list scoped to source.
  - Toggles: include unpublished.
  - Stage 1: "Preview" runs `dryRun:true`, lists impacted target docs (overwrite vs create), with explicit "no merge — target content is replaced" copy.
  - Stage 2: Confirmation dialog showing exact target documents that will be overwritten before execution.
  - Stage 3: Real run; remap failures surfaced as actionable errors (which field on which document failed).
- All states have role gating; non-admins get the "forbidden" view we already render.

### Studio review app

`apps/studio-review/` is **not** a tracked source directory in this repo — only `.next` and `.generated` build outputs sit on disk and they are gitignored (`git ls-tree origin/main apps/studio-review` returns empty). AGENTS.md mentions it for contract syncing but there's nothing to update in this PR. We'll note this in the PR description.

## Test matrix (CMS-97)

Integration tests (real Postgres) cover:
1. Clone with content only — counts equal source non-deleted docs; new documentIds; preserved translation_group_id; target env queryable.
2. Clone with `includeDrafts:false` — only documents with `publishedVersion` are cloned, with their published version row at v1 in target.
3. Clone with `include.settings:true` — schema sync + registry copied to target.
4. Clone fails atomically when a frontmatter reference points to a doc whose `(translationGroupId, locale)` has no counterpart in the (post-clone) target — no rows written.
5. Promote, target match by `(translationGroupId, locale)` — overwrites + publishes; new `document_versions` row appended.
6. Promote, no target match — creates + publishes.
7. Promote with `dryRun:true` — returns plan, zero side effects (verify counts unchanged).
8. Promote `includeUnpublished:false` — unpublished sources are skipped with `status:"skipped_unpublished"`.
9. Promote atomic abort on a single missing reference — no rows changed in target.
10. Locale matrix — localized type pair (en/fr) clones + promotes correctly; non-localized (`__mdcms_default__`) cloned + promoted correctly; no cross-locale leakage.
11. Project boundary — clone source and target must belong to the routed project; cross-project source rejected with `NOT_FOUND`.
12. Auth/scope — clone without `environments:clone` scope → `FORBIDDEN`; promote without `environments:promote` → `FORBIDDEN`.
13. CSRF — missing CSRF token rejected on both routes.

## Out of scope

- Media inclusion (explicitly deferred by spec).
- Conflict resolution / merge for promote (spec is "no merge").
- Changelog summarization for auto-publish (we set `changeSummary: null`).
- Preview-app fixture sync (no source under `apps/studio-review`).

## Validation

Run before PR:
- `bun run format:check`
- `bun run check`
- `bun test --cwd apps/server` (skips DB-bound tests when no Postgres)
- `bun test --cwd packages/studio`
- If Docker running: `bun run integration` (full matrix)
