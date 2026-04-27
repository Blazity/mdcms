# CMS-32 Content Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract a dedicated DB-backed content integration suite, keep fast in-memory route tests, and wire the new suite into the root integration gate and CI path for CMS-32.

**Architecture:** Split content API test ownership into a fast route-contract suite and a canonical DB-backed integration suite. Reuse a shared support module for test harness concerns, then run the DB suite through a dedicated Compose-backed shell script that becomes part of the root `integration` command.

**Tech Stack:** Bun, Nx workspace scripts, Node test runner via `bun test`, Docker Compose, Postgres, Elysia route handler tests, Drizzle-backed content store

---

### Task 1: Inventory and Carve Out Shared Test Support

**Files:**

- Create: `apps/server/src/lib/content-api-test-support.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test or import boundary**

Move no DB-backed assertions yet. First add a support module export surface for existing helpers used by both suites:

- `dbEnv`
- `logger`
- `scopeHeaders`
- `createDatabaseTestContext(...)`
- `seedSchemaRegistryScope(...)`
- request helper utilities needed by extracted tests

Expected first failure: `content-api.test.ts` cannot compile until imports are updated.

**Step 2: Run test/typecheck to verify the extraction breaks before fix**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL or compile error from moved helpers/imports.

**Step 3: Write minimal implementation**

Create `apps/server/src/lib/content-api-test-support.ts` by moving shared DB harness code out of `content-api.test.ts`. Keep helper signatures unchanged where possible to minimize churn.

**Step 4: Run tests to verify the extraction passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS for the remaining suite or only DB-skipped tests remain skipped.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api-test-support.ts apps/server/src/lib/content-api.test.ts
git commit -m "test(server): extract content api test support"
```

### Task 2: Create the Dedicated DB-Backed Integration Suite Skeleton

**Files:**

- Create: `apps/server/src/lib/content-api.integration.test.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/server/src/lib/content-api.integration.test.ts`

**Step 1: Write the failing integration suite skeleton**

Create a new integration file that imports the shared support helpers and defines at least one existing DB-backed test copied from `content-api.test.ts`.

Expected first failure: the new file is not yet covered by a dedicated script and may expose missing imports/helpers.

**Step 2: Run the new test file directly**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: FAIL from missing imports, missing helper exports, or copied code that still references old local helpers.

**Step 3: Write minimal implementation**

Fix imports and shared helper usage so the integration file runs. Keep `testWithDatabase` behavior for now if needed, but make the file structurally independent from `content-api.test.ts`.

**Step 4: Re-run the new test file**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: PASS locally when Postgres is available; otherwise DB tests skip cleanly.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.integration.test.ts apps/server/src/lib/content-api.test.ts
git commit -m "test(server): add content api integration suite skeleton"
```

### Task 3: Move Canonical DB Lifecycle, Restore, and Routing Coverage

**Files:**

- Modify: `apps/server/src/lib/content-api.integration.test.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/server/src/lib/content-api.integration.test.ts`

**Step 1: Move the failing DB-backed scenarios**

Move DB-backed tests for:

- lifecycle and visibility
- restore flows
- routed project isolation

Delete the moved DB-backed copies from `content-api.test.ts`.

Expected first failure: copied tests still depend on old file-local state or helper functions.

**Step 2: Run only the new integration file**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: FAIL on missing helper references or broken setup assumptions after the move.

**Step 3: Write minimal implementation**

Repair imports, helpers, and setup so moved tests run unchanged in behavior.

**Step 4: Run the integration file again**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: PASS with DB available.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.integration.test.ts apps/server/src/lib/content-api.test.ts
git commit -m "test(server): move lifecycle restore and routing integration coverage"
```

### Task 4: Move DB Uniqueness, Conflict Mapping, Schema-Hash, and Resolve Coverage

**Files:**

- Modify: `apps/server/src/lib/content-api.integration.test.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/server/src/lib/content-api.integration.test.ts`

**Step 1: Move the remaining DB-backed regression groups**

Move DB-backed tests for:

- path conflict and translation variant conflict
- soft-deleted or cross-scope source handling
- race/constraint precedence checks
- schema-hash required/mismatch/not-synced/match cases
- DB-backed `resolve` scenarios

Expected first failure: copied tests expose helper duplication or ordering assumptions.

**Step 2: Run the integration file**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: FAIL until moved imports and local helpers are normalized.

**Step 3: Write minimal implementation**

Normalize helper usage and trim `content-api.test.ts` down to fast route tests plus any intentionally retained storage-independent checks.

**Step 4: Re-run the integration file**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: PASS with DB available.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.integration.test.ts apps/server/src/lib/content-api.test.ts
git commit -m "test(server): move db content regressions into integration suite"
```

### Task 5: Add Deterministic Fixture Labels in the Integration Suite

**Files:**

- Modify: `apps/server/src/lib/content-api-test-support.ts`
- Modify: `apps/server/src/lib/content-api.integration.test.ts`
- Test: `apps/server/src/lib/content-api.integration.test.ts`

**Step 1: Write a failing deterministic helper expectation**

Introduce helper usage so tests stop directly assembling names with `Date.now()` / `Math.random()` in moved CMS-32 scenarios.

Expected first failure: compile errors until helper functions exist.

**Step 2: Run the integration suite**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: FAIL on missing helper implementations.

**Step 3: Write minimal implementation**

Add small deterministic namespace helpers, for example:

- `createTestNamespace(testId)`
- `scopedPath(testId, suffix)`
- `scopedEmail(testId)`

Use a simple monotonic or label-driven strategy that is deterministic within the suite and unique per test case.

**Step 4: Re-run the integration suite**

Run: `bun test apps/server/src/lib/content-api.integration.test.ts`
Expected: PASS with cleaner, label-driven fixtures.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api-test-support.ts apps/server/src/lib/content-api.integration.test.ts
git commit -m "test(server): make content integration fixtures deterministic"
```

### Task 6: Add a Dedicated Server Integration Command

**Files:**

- Modify: `apps/server/package.json`
- Test: `apps/server/package.json`

**Step 1: Write the failing command path**

Add a new script entry such as:

- `test:integration:content`

that points at `src/lib/content-api.integration.test.ts`.

Expected first failure: the script may not exist yet when invoked.

**Step 2: Run the new script**

Run: `bun run --cwd apps/server test:integration:content`
Expected: FAIL before the script is added.

**Step 3: Write minimal implementation**

Add the script in `apps/server/package.json` using the same Bun test conventions already used in the package.

**Step 4: Re-run the command**

Run: `bun run --cwd apps/server test:integration:content`
Expected: PASS with DB available, or clean skips when DB is unavailable outside Compose.

**Step 5: Commit**

```bash
git add apps/server/package.json
git commit -m "chore(server): add content integration test command"
```

### Task 7: Add the Compose-Backed Integration Check Script

**Files:**

- Create: `scripts/content-api-integration-check.sh`
- Test: `scripts/content-api-integration-check.sh`

**Step 1: Write the failing shell script skeleton**

Create a script that:

1. starts Docker Compose
2. waits for `postgres`
3. waits for `db-migrate`
4. waits for `server`
5. runs `bun run --cwd apps/server test:integration:content`
6. tears down the stack with volumes on exit

Expected first failure: shell syntax mistakes or missing readiness helpers.

**Step 2: Run the script**

Run: `bash scripts/content-api-integration-check.sh`
Expected: FAIL the first time until readiness and cleanup logic is correct.

**Step 3: Write minimal implementation**

Model the script after the existing Compose health and migration scripts. Reuse the same waiting and cleanup patterns rather than inventing new shell behavior.

**Step 4: Re-run the script**

Run: `bash scripts/content-api-integration-check.sh`
Expected: PASS and execute the DB-backed suite against a fresh Compose stack.

**Step 5: Commit**

```bash
git add scripts/content-api-integration-check.sh
git commit -m "test(ci): add content api integration check"
```

### Task 8: Wire the New Check into the Root Integration Gate

**Files:**

- Modify: `package.json`
- Test: `package.json`

**Step 1: Make the integration command fail until the new script is included**

Update the root `integration` script to append `bash scripts/content-api-integration-check.sh`.

Expected first failure: `bun run integration` now fails until the new script is correct.

**Step 2: Run the root integration command**

Run: `bun run integration`
Expected: FAIL if any of the three checks still break under the new chain.

**Step 3: Write minimal implementation**

Adjust the script ordering or shell command if needed so the root integration flow is:

1. compose health
2. migration startup check
3. content API integration check

**Step 4: Re-run the root integration command**

Run: `bun run integration`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json
git commit -m "ci: gate integration on content api db suite"
```

### Task 9: Document the Local Operator Workflow

**Files:**

- Modify: `apps/server/README.md`
- Test: `apps/server/README.md`

**Step 1: Add the missing docs block**

Document:

- the fast suite command
- the dedicated DB-backed content integration command
- the root integration command that exercises the Compose-backed gate

Expected first failure: no code failure; this is documentation completion tied to roadmap acceptance.

**Step 2: Verify docs reflect real commands**

Run:

- `bun run --cwd apps/server test`
- `bun run --cwd apps/server test:integration:content`
- `bun run integration`

Expected: all commands exist and docs text matches them exactly.

**Step 3: Write minimal implementation**

Add a concise README section under server testing or content API documentation.

**Step 4: Re-check formatting**

Run: `bun x prettier --check apps/server/README.md`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/server/README.md
git commit -m "docs(server): document content integration workflow"
```

### Task 10: Final Verification and Hygiene

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`
- Modify: `apps/server/src/lib/content-api.integration.test.ts`
- Modify: `apps/server/src/lib/content-api-test-support.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json`
- Modify: `apps/server/README.md`
- Create: `scripts/content-api-integration-check.sh`

**Step 1: Run focused fast suite verification**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS.

**Step 2: Run focused DB-backed suite verification**

Run: `bun run --cwd apps/server test:integration:content`
Expected: PASS when Postgres is reachable.

**Step 3: Run repo-level verification**

Run:

- `bun run format:check`
- `bun run check`
- `bun run integration`

Expected: PASS.

**Step 4: Verify change hygiene**

Run: `git status --short`
Expected:

- only task-scoped tracked file changes are present
- local-only paths like `AGENTS.md`, `ROADMAP_TASKS.md`, `.codex/`, `.claude/`, and `docs/plans/` remain unstaged/untracked

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.test.ts apps/server/src/lib/content-api.integration.test.ts apps/server/src/lib/content-api-test-support.ts apps/server/package.json package.json apps/server/README.md scripts/content-api-integration-check.sh
git commit -m "test(server): implement cms-32 content integration gate"
```
