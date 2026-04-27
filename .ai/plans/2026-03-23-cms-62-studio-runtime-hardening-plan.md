# CMS-62 Studio Runtime Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement server-owned Studio runtime rollback/disable behavior for the selected `module` mode and add deterministic regression coverage for bootstrap recovery, authorization-filtered action visibility, and MDX host-bridge preview.

**Architecture:** Keep `module` as the only production runtime mode. The server owns Studio publication state (`active`, optional `lastKnownGood`, kill switch) and returns one bootstrap outcome at a time; the shell validates the served runtime, retries bootstrap once with rejection context on retryable validation failures, and otherwise renders deterministic startup error UI. Selected-mode regression coverage should exercise the real loader, bootstrap route, filtered action catalog, and host bridge path rather than isolated contract stubs only.

**Tech Stack:** Bun, TypeScript, React 19, Elysia, shared Zod runtime contracts, node:test, Nx

---

> Local workflow note: `docs/plans/` is local-only and must remain untracked. Do not include this plan file in commits.

### Task 1: Update the spec-owned runtime recovery contract

**Files:**

- Modify: `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- Modify: `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- Modify: `packages/studio/README.md`
- Modify: `apps/server/README.md`

**Step 1: Patch the owning spec with the new bootstrap startup envelope**

Add the server-owned publication state and bootstrap ready envelope to `SPEC-006`, including the retry query params and the disabled/unavailable error outcomes.

```ts
export type StudioBootstrapRejectionReason =
  | "integrity"
  | "signature"
  | "compatibility";

export type StudioBootstrapReadyResponse = {
  data: {
    status: "ready";
    source: "active" | "lastKnownGood";
    manifest: StudioBootstrapManifest;
    recovery?: {
      rejectedBuildId: string;
      rejectionReason: StudioBootstrapRejectionReason;
    };
  };
};
```

**Step 2: Align the supporting architecture and operator docs**

Update `SPEC-002`, `packages/studio/README.md`, and `apps/server/README.md` so they all describe:

- server-owned `active` vs `lastKnownGood`
- one-shot bootstrap retry with rejection context
- kill-switch via server config/env
- `module` remaining the only production mode

**Step 3: Run a targeted terminology check**

Run:

```bash
rg -n "lastKnownGood|rejectedBuildId|rejectionReason|STUDIO_RUNTIME_DISABLED|STUDIO_RUNTIME_UNAVAILABLE" docs/specs/SPEC-006-studio-runtime-and-ui.md docs/specs/SPEC-002-system-architecture-and-extensibility.md packages/studio/README.md apps/server/README.md
```

Expected: each new runtime-recovery term appears in the updated docs.

**Step 4: Run format verification**

Run:

```bash
bun run format:check
```

Expected: PASS

**Step 5: Commit the spec/docs delta**

```bash
git add docs/specs/SPEC-006-studio-runtime-and-ui.md docs/specs/SPEC-002-system-architecture-and-extensibility.md packages/studio/README.md apps/server/README.md
git commit -m "docs(studio): define runtime recovery contract"
```

### Task 2: Add shared bootstrap startup contracts and validators

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing shared-contract tests**

Add tests for:

- accepting a ready bootstrap envelope with `source: "active"`
- accepting a fallback envelope with `source: "lastKnownGood"` and `recovery`
- rejecting invalid `rejectionReason`
- rejecting malformed `source`

```ts
const ready = {
  data: {
    status: "ready",
    source: "lastKnownGood",
    manifest: validManifest,
    recovery: {
      rejectedBuildId: "bad-build",
      rejectionReason: "integrity",
    },
  },
};

assertStudioBootstrapReadyResponse(ready);
```

**Step 2: Run the targeted shared tests to verify failure**

Run:

```bash
bun --cwd packages/shared test ./src/lib/contracts/extensibility.test.ts
```

Expected: FAIL because the new startup-envelope contract is not implemented yet.

**Step 3: Implement the minimal shared types and runtime assertions**

Add:

- `StudioBootstrapRejectionReason`
- `StudioBootstrapReadyPayload`
- `StudioBootstrapReadyResponse`
- `assertStudioBootstrapReadyResponse(...)`

Export them through `packages/shared/src/index.ts` and document the ready-envelope contract in `packages/shared/README.md`.

**Step 4: Re-run the targeted shared tests**

Run:

```bash
bun --cwd packages/shared test ./src/lib/contracts/extensibility.test.ts
```

Expected: PASS

**Step 5: Commit the shared-contract slice**

```bash
git add packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/index.ts packages/shared/README.md
git commit -m "feat(shared): add studio bootstrap ready contract"
```

### Task 3: Implement server publication state and bootstrap decision flow

**Files:**

- Modify: `apps/server/src/lib/env.ts`
- Modify: `apps/server/src/lib/env.test.ts`
- Modify: `apps/server/src/lib/studio-bootstrap.ts`
- Modify: `apps/server/src/lib/studio-bootstrap.test.ts`
- Modify: `apps/server/src/lib/server.ts`
- Modify: `apps/server/src/lib/health.test.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.test.ts`

**Step 1: Write the failing server tests**

Cover:

- kill-switch env parsing
- bootstrap returns ready envelope for `active`
- bootstrap returns ready envelope for `lastKnownGood` when retry query params reject the active build
- bootstrap returns `503 STUDIO_RUNTIME_DISABLED` when the kill switch is enabled
- bootstrap returns `503 STUDIO_RUNTIME_UNAVAILABLE` when no safe build exists

Example bootstrap assertion:

```ts
assert.deepEqual(body.data, {
  status: "ready",
  source: "lastKnownGood",
  manifest: fallbackManifest,
  recovery: {
    rejectedBuildId: activeManifest.buildId,
    rejectionReason: "integrity",
  },
});
```

**Step 2: Run the targeted server tests to verify failure**

Run:

```bash
bun --cwd apps/server test ./src/lib/env.test.ts ./src/lib/studio-bootstrap.test.ts ./src/lib/health.test.ts ./src/lib/runtime-with-modules.test.ts
```

Expected: FAIL because the server still serves a raw manifest-only bootstrap payload and has no kill-switch/publication fallback logic.

**Step 3: Implement the minimal server publication-state path**

Add:

- a parsed env/config flag for the operator kill switch
- a publication-state shape in `studio-bootstrap.ts` that can hold `active` and optional `lastKnownGood`
- bootstrap route logic in `server.ts` that:
  - returns active ready payload on normal startup
  - returns fallback ready payload when retry query params reject the active build and `lastKnownGood` exists
  - returns deterministic `503` error envelopes when disabled or unavailable

Do not add a new public mutation API for this task.

**Step 4: Re-run the targeted server tests**

Run:

```bash
bun --cwd apps/server test ./src/lib/env.test.ts ./src/lib/studio-bootstrap.test.ts ./src/lib/health.test.ts ./src/lib/runtime-with-modules.test.ts
```

Expected: PASS

**Step 5: Commit the server bootstrap slice**

```bash
git add apps/server/src/lib/env.ts apps/server/src/lib/env.test.ts apps/server/src/lib/studio-bootstrap.ts apps/server/src/lib/studio-bootstrap.test.ts apps/server/src/lib/server.ts apps/server/src/lib/health.test.ts apps/server/src/lib/runtime-with-modules.test.ts
git commit -m "feat(server): add studio runtime recovery bootstrap"
```

### Task 4: Implement shell retry-on-rejection and deterministic disabled-state UI

**Files:**

- Modify: `packages/studio/src/lib/studio-loader.ts`
- Modify: `packages/studio/src/lib/studio-loader.test.ts`
- Modify: `packages/studio/src/lib/studio-component.tsx`
- Modify: `packages/studio/src/lib/studio.test.ts`

**Step 1: Write the failing loader and shell tests**

Add tests for:

- parsing the new ready bootstrap envelope
- retrying bootstrap once with `rejectedBuildId` and `rejectionReason=integrity`
- surfacing `STUDIO_RUNTIME_DISABLED`
- surfacing `STUDIO_RUNTIME_UNAVAILABLE`
- stopping after one retry instead of looping

Example retry expectation:

```ts
assert.deepEqual(fetchLog, [
  "http://localhost:4000/api/v1/studio/bootstrap",
  "http://localhost:4000/api/v1/studio/assets/active-build/runtime.mjs",
  "http://localhost:4000/api/v1/studio/bootstrap?rejectedBuildId=active-build&rejectionReason=integrity",
  "http://localhost:4000/api/v1/studio/assets/fallback-build/runtime.mjs",
]);
```

**Step 2: Run the targeted studio loader tests to verify failure**

Run:

```bash
bun --cwd packages/studio test ./src/lib/studio-loader.test.ts ./src/lib/studio.test.ts
```

Expected: FAIL because the loader still expects `{ data: StudioBootstrapManifest }` and has no retry/disabled logic.

**Step 3: Implement the minimal loader retry path**

Update the loader to:

- parse `StudioBootstrapReadyResponse`
- classify retryable validation failures as `integrity`, `signature`, or `compatibility`
- re-request bootstrap once with rejection query params
- stop on non-retryable failures or after a failed fallback load

**Step 4: Update deterministic startup error descriptions**

Extend `describeStudioStartupError(...)` and the startup shell markup so disabled/unavailable states render explicit operator-facing copy instead of falling through to generic crash text.

**Step 5: Re-run the targeted studio loader tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/studio-loader.test.ts ./src/lib/studio.test.ts
```

Expected: PASS

**Step 6: Commit the shell recovery slice**

```bash
git add packages/studio/src/lib/studio-loader.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/studio-component.tsx packages/studio/src/lib/studio.test.ts
git commit -m "feat(studio): retry bootstrap on runtime rejection"
```

### Task 5: Add selected-mode MDX preview and authorization-filtered action fixtures

**Files:**

- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`
- Modify: `packages/studio/src/lib/action-catalog-adapter.ts`
- Modify: `apps/server/src/lib/health.test.ts`

**Step 1: Write the failing remote-runtime tests**

Add tests that prove:

- document/editor route calls `context.hostBridge.renderMdxPreview(...)`
- preview cleanup runs on route change/unmount
- Studio action rendering uses only the filtered catalog returned by `/api/v1/actions`
- hidden actions do not appear in the rendered action strip

Example host-bridge assertion:

```ts
assert.deepEqual(previewCalls, [
  {
    componentName: "HeroBanner",
    props: { title: "Launch" },
    key: "preview:content.document",
  },
]);
```

**Step 2: Run the targeted remote-runtime tests to verify failure**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: FAIL because the remote runtime does not yet exercise the host bridge or render action UI from the filtered action catalog.

**Step 3: Implement the minimal remote-runtime behavior**

Add:

- a small document-route preview surface that calls `renderMdxPreview(...)`
- a small action strip driven by `createStudioActionCatalogAdapter(...)`
- deterministic loading/error fallbacks that never synthesize hidden actions locally

Keep the implementation minimal and selected-mode only.

**Step 4: Re-run the targeted remote-runtime tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: PASS

**Step 5: Re-run the existing forced-invocation server test**

Run:

```bash
bun --cwd apps/server test ./src/lib/health.test.ts
```

Expected: PASS, including the hidden-action forced-route rejection case.

**Step 6: Commit the selected-mode fixture slice**

```bash
git add packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/action-catalog-adapter.ts apps/server/src/lib/health.test.ts
git commit -m "feat(studio): cover mdx preview and hidden actions"
```

### Task 6: Run full task verification and final hygiene checks

**Files:**

- Verify only

**Step 1: Run the targeted package regression commands**

Run:

```bash
bun --cwd packages/shared test ./src/lib/contracts/extensibility.test.ts
bun --cwd apps/server test ./src/lib/env.test.ts ./src/lib/studio-bootstrap.test.ts ./src/lib/health.test.ts ./src/lib/runtime-with-modules.test.ts
bun --cwd packages/studio test ./src/lib/studio-loader.test.ts ./src/lib/studio.test.ts ./src/lib/remote-studio-app.test.ts
```

Expected: PASS

**Step 2: Run the Studio embed smoke scenario**

Run:

```bash
bun run studio:embed:smoke
```

Expected: PASS

**Step 3: Run formatting and workspace checks**

Run:

```bash
bun run format:check
bun run check
```

Expected: PASS

**Step 4: Verify git hygiene**

Run:

```bash
git status --short
```

Expected:

- only intended tracked files are modified or committed
- local-only paths remain unstaged
- `docs/plans/` remains untracked

**Step 5: Create the final task-scoped commit**

```bash
git add docs/specs/SPEC-006-studio-runtime-and-ui.md docs/specs/SPEC-002-system-architecture-and-extensibility.md apps/server/README.md packages/studio/README.md packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/index.ts packages/shared/README.md apps/server/src/lib/env.ts apps/server/src/lib/env.test.ts apps/server/src/lib/studio-bootstrap.ts apps/server/src/lib/studio-bootstrap.test.ts apps/server/src/lib/server.ts apps/server/src/lib/health.test.ts apps/server/src/lib/runtime-with-modules.test.ts packages/studio/src/lib/studio-loader.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/studio-component.tsx packages/studio/src/lib/studio.test.ts packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/action-catalog-adapter.ts
git commit -m "feat(studio): harden module runtime startup"
```
