# CMS-131 Content Overview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish CMS-131 by adding a metadata-only content overview endpoint, wiring `/admin/content` to it, and persisting the Studio theme.

**Architecture:** Extend the content API with a dedicated overview-count contract that exposes per-type metadata without document rows, then update the Studio overview loader to consume that contract while keeping list/detail permissions unchanged. Persist the Studio theme inside the existing runtime theme adapter with local browser storage and deterministic precedence.

**Tech Stack:** Bun, Nx, TypeScript, React, Zod, custom server content API, GitHub CLI.

---

### Task 1: Spec delta

**Files:**

- Modify: `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- Modify: `docs/specs/SPEC-006-studio-runtime-and-ui.md`

**Step 1: Write the spec delta**

- Add `GET /api/v1/content/overview` as a metadata-only endpoint in `SPEC-003`
- Update `/admin/content` count and theme persistence behavior in `SPEC-006`

**Step 2: Verify wording against current code**

Run: `rg -n "content/overview|theme persistence|/admin/content" docs/specs/SPEC-003-content-storage-versioning-and-migrations.md docs/specs/SPEC-006-studio-runtime-and-ui.md`

Expected: the new contract text is present exactly once in each spec.

### Task 2: Server contract and store

**Files:**

- Modify: `apps/server/src/lib/content-api/types.ts`
- Modify: `apps/server/src/lib/content-api/routes.ts`
- Modify: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `apps/server/src/lib/content-api/database-store.ts`
- Test: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/server/src/lib/content-api.integration.test.ts`

**Step 1: Write the failing tests**

- Add route tests for `GET /api/v1/content/overview`
- Cover auth scope, explicit zero rows, and `drafts` semantics

**Step 2: Run the focused server tests to verify failure**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/content-api.integration.test.ts`

Expected: failures mentioning missing `/api/v1/content/overview` behavior.

**Step 3: Write minimal implementation**

- Add overview types
- Add route handler
- Add store method in both store implementations

**Step 4: Re-run focused server tests**

Run: `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/content-api.integration.test.ts`

Expected: the new tests pass.

### Task 3: Studio overview consumer

**Files:**

- Modify: `packages/studio/src/lib/content-overview-state.ts`
- Create or modify: `packages/studio/src/lib/content-overview-api.ts`
- Test: `packages/studio/src/lib/content-overview-state.test.ts`
- Test: `packages/studio/src/lib/runtime-ui/pages/content-page.test.tsx`

**Step 1: Write the failing tests**

- Assert `/admin/content` uses overview counts for `total`, `published`, and
  `drafts` even without draft-read
- Keep permission-constrained behavior for callers with no content-read access

**Step 2: Run focused Studio tests to verify failure**

Run: `bun test packages/studio/src/lib/content-overview-state.test.ts packages/studio/src/lib/runtime-ui/pages/content-page.test.tsx`

Expected: failures showing missing count behavior.

**Step 3: Write minimal implementation**

- Add Studio API client for `/api/v1/content/overview`
- Switch count loading to the new metadata endpoint

**Step 4: Re-run focused Studio tests**

Run: `bun test packages/studio/src/lib/content-overview-state.test.ts packages/studio/src/lib/runtime-ui/pages/content-page.test.tsx`

Expected: the new tests pass.

### Task 4: Theme persistence

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/adapters/next-themes.tsx`
- Add test: `packages/studio/src/lib/runtime-ui/adapters/next-themes.test.tsx`

**Step 1: Write the failing tests**

- Assert the provider reads an existing stored preference
- Assert `setTheme()` persists updates
- Assert fallback precedence honors `defaultTheme` and `enableSystem`

**Step 2: Run the focused theme test to verify failure**

Run: `bun test packages/studio/src/lib/runtime-ui/adapters/next-themes.test.tsx`

Expected: failures showing missing storage behavior.

**Step 3: Write minimal implementation**

- Read/write a dedicated localStorage key
- Apply effective dark/light class for `system`

**Step 4: Re-run the focused theme test**

Run: `bun test packages/studio/src/lib/runtime-ui/adapters/next-themes.test.tsx`

Expected: the new tests pass.

### Task 5: Verification and PR

**Files:**

- Modify: `apps/server/README.md` if endpoint list changes need operator docs

**Step 1: Run task-focused validation**

Run:

- `bun test apps/server/src/lib/content-api.test.ts apps/server/src/lib/content-api.integration.test.ts`
- `bun test packages/studio/src/lib/content-overview-state.test.ts packages/studio/src/lib/runtime-ui/pages/content-page.test.tsx packages/studio/src/lib/runtime-ui/adapters/next-themes.test.tsx packages/studio/src/lib/studio-loader.test.ts packages/shared/src/lib/contracts/extensibility.test.ts`

**Step 2: Run workspace validation**

Run:

- `bun run format:check`
- `bun run check`

**Step 3: Open PR**

Run:

- `git status --short`
- `git add <task files only>`
- `git commit -m "feat: finish CMS-131 content overview integration"`
- `gh pr create --fill`

Expected: a GitHub PR URL is returned.
