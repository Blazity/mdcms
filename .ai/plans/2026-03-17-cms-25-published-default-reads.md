# CMS-25 Published-Default Reads Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce the CMS-25 visibility contract so content reads default to published snapshots, draft reads require `draft=true`, and draft list reads do not leak deleted documents unless explicitly requested.

**Architecture:** Keep the existing route-level `draft=true` scope selection and published-vs-draft read split, but centralize list-visibility rules so the in-memory and database stores apply the same behavior. Drive the change with server contract tests first, then refactor the shared filtering logic with the narrowest production diff needed to satisfy the spec.

**Tech Stack:** Bun, TypeScript, Node test runner, Elysia route handlers, Drizzle ORM, postgres.js

---

### Task 1: Lock the visibility contract with failing tests

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`
- Modify: `apps/server/src/lib/auth.test.ts`

**Step 1: Write the failing test**

Add focused tests that prove:

- `GET /api/v1/content` returns only published snapshots by default.
- `GET /api/v1/content?draft=true` returns mutable heads for published and unpublished docs.
- `GET /api/v1/content?draft=true` excludes deleted docs unless `isDeleted=true` is explicitly requested.
- API-key list reads require `content:read:draft` when `draft=true`.

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts`
Expected: FAIL because draft list reads currently include deleted rows and/or missing list-level auth coverage is not enforced by tests yet.

**Step 3: Write minimal implementation**

Do not change production code in this task.

**Step 4: Run test to verify it still fails for the intended reason**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts`
Expected: FAIL with the new visibility-contract assertion, not with a malformed test.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts
git commit -m "test(server): add CMS-25 visibility contract coverage"
```

### Task 2: Refactor read visibility across both stores

**Files:**

- Modify: `apps/server/src/lib/content-api/database-store.ts`
- Modify: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `apps/server/src/lib/content-api/types.ts`

**Step 1: Write the failing test**

Use the failing tests from Task 1 as the active red state. Do not add more production assumptions than those tests require.

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts`
Expected: FAIL on the CMS-25 visibility assertions.

**Step 3: Write minimal implementation**

Add a shared visibility decision for list reads that:

- keeps published-default list behavior unchanged,
- returns draft heads only when `draft=true`,
- excludes deleted docs from draft list reads unless `isDeleted=true`,
- still allows explicit `isDeleted=true/false` filtering for trash and non-trash views.

Keep single-document behavior unchanged except where already covered by the existing spec/tests.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api/database-store.ts apps/server/src/lib/content-api/in-memory-store.ts apps/server/src/lib/content-api/types.ts apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts
git commit -m "feat(server): enforce CMS-25 draft visibility contract"
```

### Task 3: Verify task-scoped behavior and workspace health

**Files:**

- Modify: `apps/cli/src/lib/pull.test.ts` (only if the server contract change requires adjusted CLI assumptions)

**Step 1: Write the failing test**

Only if needed, add a CLI pull regression test showing that default pull still requests `draft=true` and published pull still requests published snapshots.

**Step 2: Run test to verify it fails**

Run: `bun test apps/cli/src/lib/pull.test.ts`
Expected: FAIL only if a CLI regression or expectation mismatch is revealed.

**Step 3: Write minimal implementation**

Adjust CLI expectations only if the server contract refactor changes observable request semantics. Do not widen scope beyond CMS-25.

**Step 4: Run test to verify it passes**

Run: `bun test apps/cli/src/lib/pull.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/lib/pull.test.ts
git commit -m "test(cli): keep pull aligned with CMS-25 visibility rules"
```

### Task 4: Final verification

**Files:**

- No code changes expected

**Step 1: Run targeted verification**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/auth.test.ts apps/cli/src/lib/pull.test.ts`
Expected: PASS

**Step 2: Run workspace checks required by the repo workflow**

Run: `bun run format:check`
Expected: PASS

Run: `bun run check`
Expected: PASS

**Step 3: Confirm local-only paths stay unstaged**

Run: `git status --short`
Expected: `docs/plans/`, `ROADMAP_TASKS.md`, `AGENTS.md`, and other local-only files remain untracked and unstaged.

**Step 4: Commit**

```bash
git add <task-scoped files only>
git commit -m "feat(server): complete CMS-25"
```
