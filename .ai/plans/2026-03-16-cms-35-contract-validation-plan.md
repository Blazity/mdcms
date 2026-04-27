# CMS-35 Contract Validation Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a CI-gated extensibility contract suite for module manifests, action catalog payloads, Studio bootstrap publications, and deterministic server/CLI registry behavior without implementing the full Studio loader.

**Architecture:** Keep contract ownership where it already lives. `@mdcms/shared` continues to own manifest and action-catalog validators plus runtime module planning. `@mdcms/studio` adds a pure bootstrap publication verifier for build outputs. `@mdcms/server` and `@mdcms/cli` extend tests around authorization-filtering, route collisions, and deterministic registry merging without introducing new runtime/plugin abstractions.

**Tech Stack:** Bun, Nx, TypeScript, Bun test, Elysia, Zod

---

### Task 1: Shared Contract Fixtures And Route Collision Detection

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/shared/src/lib/contracts/action-catalog.test.ts`
- Modify: `packages/shared/src/lib/runtime/module-loader-core.ts`
- Modify: `packages/shared/src/lib/runtime/module-loader-core.test.ts`
- Optional create: `packages/shared/src/lib/contracts/extensibility-test-fixtures.ts`

**Step 1: Add positive and negative manifest fixtures**

Add fixture values that cover:

- valid manifest
- empty `id`
- invalid `apiVersion`
- duplicate `dependsOn`
- invalid semver bounds
- inverted `minCoreVersion` / `maxCoreVersion`

Keep fixtures local to tests unless re-use between multiple test files becomes noisy.

**Step 2: Add positive and negative action catalog fixtures**

Add fixture values that cover:

- valid flattened metadata
- invalid `permissions`
- invalid `studio.form.mode`
- invalid `cli.inputMode`
- non-object `requestSchema`
- non-object `responseSchema`
- invalid list entries in array payloads

**Step 3: Extend runtime module planning to detect route collisions**

Update `buildRuntimeModulePlan(...)` in `packages/shared/src/lib/runtime/module-loader-core.ts` to treat duplicate server action route declarations as bootstrap violations when two server actions share the same:

- `method`
- `path`

Add a new deterministic violation code only if needed; otherwise reuse the existing violation structure with a route-specific details payload.

**Step 4: Add deterministic route-collision tests**

In `packages/shared/src/lib/runtime/module-loader-core.test.ts`, add tests proving:

- duplicate route pairs fail planning
- collisions are reported deterministically across repeated runs
- duplicate action IDs and duplicate route pairs are both preserved in violation output

**Step 5: Run the shared package tests**

Run:

```bash
bun test ./packages/shared/src
```

Expected:

- all existing shared tests pass
- new contract and route-collision tests pass

**Step 6: Commit checkpoint**

```bash
git add packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/contracts/action-catalog.test.ts packages/shared/src/lib/runtime/module-loader-core.ts packages/shared/src/lib/runtime/module-loader-core.test.ts
git commit -m "test(shared): add extensibility contract fixtures"
```

Do not stage `docs/plans/` because repository rules keep those files untracked.

### Task 2: Server And CLI Registry Regression Coverage

**Files:**

- Modify: `apps/server/src/lib/module-loader.test.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.test.ts`
- Modify: `apps/server/src/lib/health.test.ts`
- Modify: `apps/cli/src/lib/module-loader.test.ts`
- Modify: `apps/cli/src/lib/runtime-with-modules.test.ts`

**Step 1: Add server route-collision startup tests**

Extend `apps/server/src/lib/module-loader.test.ts` so server bootstrap fails when two modules expose distinct action IDs but the same `(method, path)` pair.

Cover:

- deterministic violation ordering
- actionable error details containing the route pair and both owners where possible

**Step 2: Add authorization-filter enforcement coverage**

In `apps/server/src/lib/runtime-with-modules.test.ts` or `apps/server/src/lib/health.test.ts`, add a protected route fixture proving:

- an unauthorized action is hidden from `/api/v1/actions`
- the hidden action also returns `404` from `/api/v1/actions/:id`
- forcing the actual route still fails by server authorization, proving visibility metadata is advisory only

Prefer a local test route with an explicit `authorize` gate instead of altering production module behavior.

**Step 3: Expand CLI deterministic merge-order coverage**

In CLI tests, prove merged:

- `actionAliases`
- `outputFormatters`
- `preflightHooks`

stay stable when input modules are shuffled but dependencies require a specific load order.

**Step 4: Run targeted server and CLI tests**

Run:

```bash
bun test ./apps/server/src/lib/module-loader.test.ts
bun test ./apps/server/src/lib/runtime-with-modules.test.ts
bun test ./apps/server/src/lib/health.test.ts
bun test ./apps/cli/src/lib/module-loader.test.ts
bun test ./apps/cli/src/lib/runtime-with-modules.test.ts
```

Expected:

- new route-collision and authorization tests pass
- deterministic ordering assertions stay stable

**Step 5: Commit checkpoint**

```bash
git add apps/server/src/lib/module-loader.test.ts apps/server/src/lib/runtime-with-modules.test.ts apps/server/src/lib/health.test.ts apps/cli/src/lib/module-loader.test.ts apps/cli/src/lib/runtime-with-modules.test.ts
git commit -m "test(server-cli): harden extensibility registry coverage"
```

### Task 3: Studio Bootstrap Publication Verification

**Files:**

- Modify: `packages/studio/src/lib/build-runtime.ts`
- Modify: `packages/studio/src/lib/build-runtime.test.ts`
- Modify: `packages/studio/src/index.ts`
- Modify: `packages/studio/README.md`
- Optional create: `packages/studio/src/lib/bootstrap-verification.ts`

**Step 1: Add a pure bootstrap publication verifier**

Implement a helper that accepts:

- a `StudioBootstrapManifest`
- the built runtime bytes
- expected loader compatibility input

It should validate:

- manifest shape
- compatibility fields
- `integritySha256` matches asset bytes
- placeholder signature/key format remains internally consistent for the current builder

This helper must not fetch URLs or execute runtime code.

**Step 2: Add positive and negative bootstrap fixtures**

Cover:

- valid publication
- incompatible `minStudioPackageVersion`
- incompatible `minHostBridgeVersion`
- integrity mismatch from mutated runtime bytes
- invalid placeholder signature
- invalid placeholder key id
- invalid manifest shape

**Step 3: Export only if genuinely useful**

If later tasks will clearly re-use the helper, export it through `packages/studio/src/index.ts`. Otherwise keep it internal to avoid widening public API unnecessarily.

**Step 4: Document the verification boundary**

Update `packages/studio/README.md` to state:

- build outputs now have contract verification coverage
- loader-side fetch/execution is still deferred to CMS-60+

**Step 5: Run studio tests**

Run:

```bash
bun test ./packages/studio/src
```

Expected:

- existing Studio tests pass
- bootstrap publication verification tests pass

**Step 6: Commit checkpoint**

```bash
git add packages/studio/src/lib/build-runtime.ts packages/studio/src/lib/build-runtime.test.ts packages/studio/src/index.ts packages/studio/README.md
git commit -m "test(studio): verify bootstrap publications"
```

### Task 4: Workspace Verification And Completion

**Files:**

- No new code files expected

**Step 1: Run task-specific verification**

Run:

```bash
bun test ./packages/shared/src
bun test ./apps/server/src
bun test ./apps/cli/src
bun test ./packages/studio/src
```

Expected:

- all touched package tests pass
- no new flaky behavior appears

**Step 2: Run required workspace validation**

Run:

```bash
bun run format:check
bun run check
```

Expected:

- formatting check passes
- build and typecheck pass across the workspace

**Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected:

- only task-scoped source changes are staged or modified
- local-only paths remain unstaged and uncommitted:
  - `.claude/`
  - `.codex/`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `ROADMAP_TASKS.md`
  - `EXTENSIBILITY_APPROACH_COMPARISON.md`
  - `mcp_servers.json`
  - `docs/plans/`

**Step 4: Final commit**

```bash
git add packages/shared/src apps/server/src apps/cli/src packages/studio/src packages/studio/README.md
git commit -m "test: add cms-35 extensibility contract validation suite"
```
