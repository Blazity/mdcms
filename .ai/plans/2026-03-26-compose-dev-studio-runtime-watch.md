# Compose Dev Studio Runtime Watch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `docker-compose.dev.yml` rebuild the Studio runtime bundle automatically when `packages/studio/src/**` changes, without restarting the stack.

**Architecture:** Keep the existing startup-owned Studio runtime publication model on the server. Add a dedicated Studio runtime watch script that rebuilds the published runtime artifacts on source changes and run it alongside the existing Studio TypeScript watcher in `packages/studio` dev mode.

**Tech Stack:** Bun, Nx inferred `dev` targets, Node/Bun filesystem watching, node:test, Prettier

---

### Task 1: Spec And Watcher Contract

**Files:**

- Modify: `docs/specs/SPEC-011-local-development-and-operations.md`
- Create: `docs/plans/2026-03-26-compose-dev-studio-runtime-watch.md`

**Step 1:** Add the explicit `docker-compose.dev.yml` watcher contract to `SPEC-011`.

**Step 2:** Keep the plan local-only and out of the commit.

### Task 2: Regression Test

**Files:**

- Create: `packages/studio/src/lib/dev-runtime-watch.test.ts`
- Modify: `packages/studio/package.json`

**Step 1:** Write a failing test that asserts the Studio `dev` script runs both the existing TypeScript watch and the new runtime artifact watcher.

**Step 2:** Run only that test and confirm it fails because the current script only runs `tsc --watch`.

### Task 3: Runtime Watcher

**Files:**

- Create: `packages/studio/src/lib/dev-runtime-watch.ts`
- Modify: `packages/studio/package.json`

**Step 1:** Implement a small Bun/Node watcher that watches `packages/studio/src/**`, debounces rapid changes, and reruns `buildStudioRuntimeArtifacts()`.

**Step 2:** Keep the watcher log output actionable and non-spammy.

**Step 3:** Update the Studio `dev` script to run both the TypeScript watch and the runtime watcher in one long-lived process.

### Task 4: Documentation And Verification

**Files:**

- Modify: `apps/studio-example/README.md`

**Step 1:** Update the local-dev docs so the watcher behavior matches the spec.

**Step 2:** Run the focused watcher test.

**Step 3:** Run `bun run format:check` and `bun run check`.
