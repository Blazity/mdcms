# Content API Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Break `apps/server/src/lib/content-api.ts` into smaller internal
modules while keeping the same public entrypoint and preserving all current
behavior.

**Architecture:** Keep `apps/server/src/lib/content-api.ts` as the only public
import surface and move its internals into `apps/server/src/lib/content-api/`.
Extract shared pure helpers first, then the in-memory store, DB-backed store,
and route mounting, with the existing content API test suite acting as the
behavioral safety net throughout the refactor.

**Tech Stack:** Bun, TypeScript, Elysia route handlers, Drizzle ORM,
postgres.js, node:test, Nx

---

### Task 1: Extract Shared Types and Helper Modules

**Files:**

- Create: `apps/server/src/lib/content-api/types.ts`
- Create: `apps/server/src/lib/content-api/parsing.ts`
- Create: `apps/server/src/lib/content-api/responses.ts`
- Modify: `apps/server/src/lib/content-api.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

Use the existing regression suite unchanged as the failing test:

```bash
bun test apps/server/src/lib/content-api.test.ts
```

Expected after the extraction starts but before imports are fixed:
FAIL due to missing exports or moved helper references.

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL for import/reference errors caused by the in-progress extraction.

**Step 3: Write minimal implementation**

- move shared types into `types.ts`
- move input/query parsing helpers into `parsing.ts`
- move response serializers and row conversion helpers into `responses.ts`
- update `content-api.ts` to import and re-export the same public API surface

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS with no behavior changes.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api/types.ts apps/server/src/lib/content-api/parsing.ts apps/server/src/lib/content-api/responses.ts
git commit -m "refactor(server): extract shared content api helpers"
```

### Task 2: Extract the In-Memory Content Store

**Files:**

- Create: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `apps/server/src/lib/content-api.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

Use the existing in-memory store coverage in:

- `apps/server/src/lib/content-api.test.ts`

The same test command is the failing test for extraction errors.

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL while `createInMemoryContentStore` is partially moved and imports
are not yet wired correctly.

**Step 3: Write minimal implementation**

- move `createInMemoryContentStore` and its private helper functions into
  `in-memory-store.ts`
- keep helper ownership local to the in-memory store module
- keep `content-api.ts` re-exporting `createInMemoryContentStore`

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS, including all in-memory route/store behavior.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api/in-memory-store.ts
git commit -m "refactor(server): extract in-memory content store"
```

### Task 3: Extract the Database Content Store

**Files:**

- Create: `apps/server/src/lib/content-api/database-store.ts`
- Modify: `apps/server/src/lib/content-api.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

Use the existing DB-backed content API coverage in:

- `apps/server/src/lib/content-api.test.ts`

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL while the DB store is partially moved and helper imports are not
fully wired.

**Step 3: Write minimal implementation**

- move `createDatabaseContentStore` and DB-only helpers into
  `database-store.ts`
- keep DB helper ownership local to the DB store module
- keep `content-api.ts` re-exporting `createDatabaseContentStore`

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS, including DB-backed create/update/publish/restore/history
behavior.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api/database-store.ts
git commit -m "refactor(server): extract database content store"
```

### Task 4: Extract Route Mounting and Reduce the Entry Point to a Facade

**Files:**

- Create: `apps/server/src/lib/content-api/routes.ts`
- Modify: `apps/server/src/lib/content-api.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

Use the existing HTTP-level content API tests in:

- `apps/server/src/lib/content-api.test.ts`

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL while route mounting is partially moved and imports are in flux.

**Step 3: Write minimal implementation**

- move `mountContentApiRoutes` into `routes.ts`
- import shared parsing/response helpers from the internal modules
- reduce `content-api.ts` to a thin facade that re-exports:
  - `createInMemoryContentStore`
  - `createDatabaseContentStore`
  - `mountContentApiRoutes`

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS with the same route behavior as before.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api/routes.ts
git commit -m "refactor(server): split content api entrypoint"
```

### Task 5: Final Verification

**Files:**

- Modify: `apps/server/src/lib/content-api.ts`
- Create: `apps/server/src/lib/content-api/*.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Run targeted regression suite**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS

**Step 2: Run format verification**

Run: `bun run format:check`
Expected: PASS

**Step 3: Run workspace verification**

Run: `bun run check`
Expected: PASS

**Step 4: Review staged diff**

Run: `git diff -- apps/server/src/lib/content-api.ts apps/server/src/lib/content-api/`
Expected: Only file decomposition and import rewiring; no contract drift.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api
git commit -m "refactor(server): decompose content api module"
```

## Repo Policy Note

This plan file is intentionally stored in `docs/plans/` as a local planning
artifact and should remain untracked per `AGENTS.md`.
