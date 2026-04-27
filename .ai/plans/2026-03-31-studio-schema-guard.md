# Studio Schema Guard And Read-Only Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a shared Studio schema state path that powers live read-only schema browsing and guarded write-blocking recovery when the local schema hash does not match the server schema hash.

**Architecture:** Reuse the existing local schema capability logic in `@mdcms/studio` to derive the local config snapshot and hash, add a dedicated schema route adapter for `GET /api/v1/schema` and `PUT /api/v1/schema`, and feed that shared state into `/admin/schema`, Settings schema access, and the document route guard. Keep auth capability inference server-driven via endpoint responses instead of adding new role data to the client session contract.

**Tech Stack:** Bun, React 19, TypeScript, `@mdcms/shared` contracts, existing Studio runtime adapters, Bun test, server schema/content APIs.

---

### Task 1: Add Studio Schema Route Adapter

**Files:**

- Create: `packages/studio/src/lib/schema-route-api.ts`
- Create: `packages/studio/src/lib/schema-route-api.test.ts`
- Modify: `packages/studio/package.json`

**Step 1: Write the failing adapter tests**

Cover:

- `GET /api/v1/schema` sends `X-MDCMS-Project` and `X-MDCMS-Environment`
- cookie auth uses `credentials: "include"`
- token auth sends `Authorization: Bearer ...`
- `PUT /api/v1/schema` bootstraps CSRF for cookie auth, forwards the local payload, and surfaces `403` / `409` failures as runtime errors

Use the existing test style from:

- `packages/studio/src/lib/document-route-api.test.ts`
- `packages/studio/src/lib/studio.test.ts`

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/studio/src/lib/schema-route-api.test.ts
```

Expected:

- FAIL because `schema-route-api.ts` does not exist yet

**Step 3: Write minimal implementation**

Implement a dedicated adapter that:

- accepts `{ project, environment, serverUrl }`
- exposes `listSchema()` and `syncSchema(payload)`
- uses the existing `applyStudioAuthToRequestInit(...)`
- uses `GET /api/v1/auth/session` to obtain `csrfToken` for session-authenticated sync when needed
- validates and returns shared schema contract shapes from `@mdcms/shared`

Do not export this adapter from the public package root unless a real external consumer requires it.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/studio/src/lib/schema-route-api.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/schema-route-api.ts packages/studio/src/lib/schema-route-api.test.ts packages/studio/package.json
git commit -m "feat(studio): add schema route adapter"
```

### Task 2: Extend Local Schema Capability Into Shared Schema State

**Files:**

- Modify: `packages/studio/src/lib/document-route-schema.ts`
- Create: `packages/studio/src/lib/schema-state.ts`
- Create: `packages/studio/src/lib/schema-state.test.ts`
- Modify: `packages/studio/src/lib/studio-loader.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`

**Step 1: Write the failing state and contract tests**

Cover:

- local capability now exposes the full sync payload pieces needed by Studio: `rawConfigSnapshot`, `resolvedSchema`, and `schemaHash`
- mount context still supports the existing document route write contract
- shared schema state computes `isMismatch`, `canSync`, and deterministic `loading/ready/forbidden/error` states from adapter responses

Use the existing fixtures in:

- `packages/studio/src/lib/document-route-schema.test.ts`
- `packages/studio/src/lib/studio-loader.test.ts`
- `packages/shared/src/lib/contracts/extensibility.test.ts`

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/studio/src/lib/document-route-schema.test.ts packages/studio/src/lib/schema-state.test.ts packages/studio/src/lib/studio-loader.test.ts packages/shared/src/lib/contracts/extensibility.test.ts
```

Expected:

- FAIL because the richer capability and shared schema state do not exist yet

**Step 3: Write minimal implementation**

Update `resolveStudioDocumentRouteSchemaCapability(...)` so the write-enabled path includes:

- `environment`
- `rawConfigSnapshot`
- `resolvedSchema`
- `schemaHash`

Add a new internal schema state module that:

- fetches server schema entries
- derives `serverSchemaHash` from the returned registry entries
- compares against the local hash
- exposes `syncSchema()` that uses the local sync payload

If you must extend `StudioMountContext`, keep it narrow and internal-facing. Preserve compatibility with existing loader tests and runtime consumers.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/studio/src/lib/document-route-schema.test.ts packages/studio/src/lib/schema-state.test.ts packages/studio/src/lib/studio-loader.test.ts packages/shared/src/lib/contracts/extensibility.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/document-route-schema.ts packages/studio/src/lib/schema-state.ts packages/studio/src/lib/schema-state.test.ts packages/studio/src/lib/studio-loader.ts packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts
git commit -m "feat(studio): add shared schema mismatch state"
```

### Task 3: Replace Placeholder Schema Page With Live Read-Only Browser

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/app/admin/schema-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/app/admin/schema-page.test.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`

**Step 1: Write the failing schema page tests**

Cover:

- loading, empty, forbidden, and generic error states
- rendering of type name, directory, localized badge, field kind, required flag, and constraint metadata from live schema entries
- no schema edit controls
- mismatch banner and privileged `Sync Schema` action rendering when state says mismatch + `canSync`

Reuse existing render patterns from:

- `packages/studio/src/lib/remote-studio-app.test.ts`
- `packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/studio/src/lib/runtime-ui/app/admin/schema-page.test.tsx packages/studio/src/lib/remote-studio-app.test.ts
```

Expected:

- FAIL because `/admin/schema` is still a static placeholder

**Step 3: Write minimal implementation**

Replace the current placeholder with a read-only browser component that consumes the shared schema state and renders:

- top-level mismatch banner
- optional sync action
- grouped schema entries
- field tables derived from `resolvedSchema.fields`

Keep the UI truthful:

- no builder copy
- no drag-and-drop claims
- no edit or mutation affordances

**Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/studio/src/lib/runtime-ui/app/admin/schema-page.test.tsx packages/studio/src/lib/remote-studio-app.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/app/admin/schema-page.tsx packages/studio/src/lib/runtime-ui/app/admin/schema-page.test.tsx packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts
git commit -m "feat(studio): add read-only schema browser"
```

### Task 4: Wire Guarded Read-Only Editor Recovery

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`
- Modify: `packages/studio/src/lib/document-shell.ts`
- Modify: `packages/studio/src/lib/document-route-api.ts`
- Modify: `packages/studio/src/lib/document-route-api.test.ts`

**Step 1: Write the failing document route tests**

Cover:

- mismatch state disables draft save and publish affordances
- guarded banner renders the server-versus-local schema recovery state
- privileged sync clears the mismatch path after successful reload
- non-privileged users see read-only recovery text without the sync action
- `SCHEMA_HASH_MISMATCH` and `SCHEMA_NOT_SYNCED` failures map into the guarded UI path rather than generic save errors

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/document-route-api.test.ts
```

Expected:

- FAIL because mismatch handling and recovery are not wired yet

**Step 3: Write minimal implementation**

Integrate the shared schema state into the existing document page state machine:

- treat mismatch as guarded read-only
- preserve readable content and version history
- disable draft mutation and publish paths while guarded
- surface sync recovery UI from the shared state

Preserve the existing document route mount contract for save requests so the actual write path still sends `x-mdcms-schema-hash` when writes are allowed.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/document-route-api.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/document-shell.ts packages/studio/src/lib/document-route-api.ts packages/studio/src/lib/document-route-api.test.ts
git commit -m "feat(studio): guard document writes on schema mismatch"
```

### Task 5: Minimal Settings Integration And Documentation

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/app/admin/settings-page.tsx`
- Modify: `packages/studio/README.md`

**Step 1: Write the failing assertions**

Add or extend tests so Settings does one of the following truthfully:

- reuses the shared read-only schema browser content, or
- links users to `/admin/schema` instead of maintaining a separate mock viewer

Also add assertions for the updated README copy:

- schema mismatch recovery is now live
- `/admin/schema` is a live read-only browser

**Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/studio.test.ts
```

Expected:

- FAIL until Settings and docs align with the live behavior

**Step 3: Write minimal implementation**

Keep this change narrow:

- remove the duplicated mock schema viewer from Settings
- replace it with shared schema access or a clear link to the real schema browser
- update `packages/studio/README.md` at the point of use to describe the live schema browser and mismatch recovery workflow

Do not clean up unrelated Settings tabs or post-MVP surfaces here.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/studio.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/app/admin/settings-page.tsx packages/studio/README.md
git commit -m "docs(studio): document schema guard and browser"
```

### Task 6: Full Verification

**Files:**

- Modify only if verification reveals a concrete failure

**Step 1: Run focused Studio and shared tests**

```bash
bun test packages/studio/src packages/shared/src/lib/contracts
```

Expected:

- PASS

**Step 2: Run server schema/content tests that cover guarded-write compatibility**

```bash
bun test apps/server/src/lib/schema-api.test.ts apps/server/src/lib/content-api.integration.test.ts apps/server/src/lib/auth.test.ts
```

Expected:

- PASS

**Step 3: Run repository-required checks**

```bash
bun run format:check
bun run check
```

Expected:

- PASS

**Step 4: Confirm local-only files stay unstaged**

```bash
git status --short
```

Expected:

- `docs/plans/` may exist locally but is not staged for commit
- local-only paths from `AGENTS.md` remain unstaged

**Step 5: Final commit if any verification fixes were needed**

```bash
git add <only task-scoped source files>
git commit -m "test(studio): verify schema guard and browser"
```
