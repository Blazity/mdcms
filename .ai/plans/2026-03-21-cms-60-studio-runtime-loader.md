# CMS-60 Studio Runtime Loader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the shell-first `@mdcms/studio` embed with a thin module loader that boots a backend-served remote Studio application and enforces deterministic runtime composition rules.

**Architecture:** The shell remains a small client-side host that fetches `/api/v1/studio/bootstrap`, validates the manifest and runtime bytes, creates the host bridge, passes `basePath`, and calls the remote `mount(...)` contract. The remote bundle becomes the full Studio app: it owns routing, application states, and an internal registry for `routes`, `navItems`, `slotWidgets`, `fieldKinds`, `editorNodes`, `actionOverrides`, and `settingsPanels`.

**Tech Stack:** Bun, Nx, TypeScript, React 19, Node test runner, Elysia, `@mdcms/shared`, `@mdcms/studio`

---

### Task 1: Lock the spec and operator-facing contract

**Files:**

- Modify: `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- Modify: `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- Modify: `packages/shared/README.md`
- Modify: `packages/studio/README.md`
- Test: none

**Step 1: Re-read the approved design and current Studio specs**

Run: `sed -n '1,260p' docs/specs/SPEC-006-studio-runtime-and-ui.md && sed -n '190,360p' docs/specs/SPEC-002-system-architecture-and-extensibility.md`
Expected: current specs still mention `iframe | module`, shell-owned UI behavior, and composition surfaces without concrete collision rules

**Step 2: Update `SPEC-006` with the CMS-60 runtime-model delta**

Add or update normative sections for:

- `module` as the only MVP execution mode
- shell-owned concerns limited to bootstrap, verification, and fatal startup failures
- remote runtime as the full Studio app after `mount(...)`
- `basePath` on `StudioMountContext`
- remote-owned routing under the provided base path
- composition surfaces and deterministic validation rules

**Step 3: Update `SPEC-002` to match the same architecture**

Remove or rewrite the parts that still defer `iframe` vs `module`, and update the runtime data flow and validation bullets so they match the approved CMS-60 design.

**Step 4: Update the package READMEs**

Document:

- the public shell contract in `@mdcms/studio`
- `basePath` as required loader input
- startup-only shell failure states
- composition-surface validation expectations in `@mdcms/shared`

**Step 5: Run formatting check for the touched docs**

Run: `bun run format:check`
Expected: PASS

**Step 6: Commit**

```bash
git add docs/specs/SPEC-002-system-architecture-and-extensibility.md docs/specs/SPEC-006-studio-runtime-and-ui.md packages/shared/README.md packages/studio/README.md
git commit -m "docs(studio): specify module runtime loader contract"
```

### Task 2: Tighten the shared Studio runtime contracts

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/shared/src/index.ts` (only if exports need adjustment)
- Test: `packages/shared/src/lib/contracts/extensibility.test.ts`

**Step 1: Write the failing contract tests**

Add cases covering:

- `StudioMountContext.basePath` required and non-empty
- bootstrap manifests reject non-`module` modes
- compatibility helpers still validate strict version bounds

**Step 2: Run the targeted shared-contract test**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`
Expected: FAIL on missing `basePath` validation and permissive runtime-mode acceptance

**Step 3: Implement the minimal contract changes**

Update `extensibility.ts` so that:

- `StudioExecutionMode` is `"module"`
- `StudioMountContext` includes `basePath: string`
- manifest validation only allows `mode: "module"`
- existing validators and helpers keep their current error-code behavior

Use a concrete contract shape such as:

```ts
export type StudioExecutionMode = "module";

export type StudioMountContext = {
  apiBaseUrl: string;
  basePath: string;
  auth: { mode: "cookie" | "token"; token?: string };
  hostBridge: HostBridgeV1;
};
```

**Step 4: Re-run the targeted shared-contract test**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/index.ts
git commit -m "refactor(shared): lock studio runtime to module mode"
```

### Task 3: Replace the shell-first embed with a loader host

**Files:**

- Modify: `packages/studio/src/lib/studio-component.tsx`
- Create: `packages/studio/src/lib/studio-loader.ts`
- Create: `packages/studio/src/lib/studio-loader.test.ts`
- Modify: `packages/studio/src/index.ts`
- Test: `packages/studio/src/lib/studio-loader.test.ts`

**Step 1: Write the failing loader tests**

Cover:

- fetches `/api/v1/studio/bootstrap`
- validates manifest compatibility and runtime integrity before import
- imports the remote module from the manifest `entryUrl`
- passes `apiBaseUrl`, `basePath`, auth, and host bridge to `mount(...)`
- returns fatal startup state when bootstrap fetch, verification, import, or mount fails

Keep the hard-to-mock logic in pure helper functions so the React component remains thin.

**Step 2: Run the targeted loader test**

Run: `bun test packages/studio/src/lib/studio-loader.test.ts`
Expected: FAIL because the loader host does not exist yet

**Step 3: Implement the minimal loader**

Add a small loader module that:

- resolves `apiBaseUrl` from `config.serverUrl`
- fetches `/api/v1/studio/bootstrap`
- loads runtime bytes for integrity verification
- imports the remote module via `import(/* @vite-ignore */ entryUrl)` or equivalent dynamic ESM path
- validates the remote contract with `assertRemoteStudioModule(...)`
- calls `mount(container, ctx)`

Update `Studio` so it becomes a client component that:

- accepts `config`, `basePath`, and optional auth/host-bridge overrides for tests
- renders only fatal startup UI while the loader is unresolved
- delegates all normal application UI to the remote runtime after `mount(...)`

**Step 4: Re-run the targeted loader test**

Run: `bun test packages/studio/src/lib/studio-loader.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/studio-component.tsx packages/studio/src/lib/studio-loader.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/index.ts
git commit -m "feat(studio): add remote runtime loader host"
```

### Task 4: Build the remote Studio app and runtime registry

**Files:**

- Modify: `packages/studio/src/lib/remote-module.ts`
- Create: `packages/studio/src/lib/remote-studio-app.tsx`
- Create: `packages/studio/src/lib/runtime-registry.ts`
- Create: `packages/studio/src/lib/runtime-registry.test.ts`
- Modify: `packages/studio/src/lib/bootstrap-verification.test.ts` (only if startup-path coverage needs extension)
- Test: `packages/studio/src/lib/runtime-registry.test.ts`

**Step 1: Write the failing runtime-registry tests**

Cover:

- normalized route conflicts such as `/settings` vs `/settings/`
- param-shape conflicts such as duplicate normalized content-detail routes
- duplicate `fieldKinds`, `editorNodes`, `actionOverrides`, and `settingsPanels`
- `slotWidgets` missing explicit `priority`
- deterministic slot ordering by `priority` descending then `id` ascending
- unknown field kind falling back to a JSON editor descriptor and emitting a structured warning

**Step 2: Run the targeted registry test**

Run: `bun test packages/studio/src/lib/runtime-registry.test.ts`
Expected: FAIL because the registry implementation does not exist yet

**Step 3: Implement the minimal remote app and registry**

Create a runtime-owned app that:

- mounts from `remote-module.ts`
- reads `ctx.basePath`
- owns browser history and route parsing inside the remote app
- builds and validates the composition registry before first render
- renders the default Studio surfaces through that registry
- uses a safe JSON editor fallback for unknown field kinds

Keep the route and registry validation logic outside React where possible so tests stay deterministic and do not require a browser-heavy harness.

**Step 4: Re-run the targeted registry test**

Run: `bun test packages/studio/src/lib/runtime-registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/remote-module.ts packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/runtime-registry.ts packages/studio/src/lib/runtime-registry.test.ts packages/studio/src/lib/bootstrap-verification.test.ts
git commit -m "feat(studio): add remote studio runtime registry"
```

### Task 5: Remove shell-managed routing from the example embed and stale shell tests

**Files:**

- Modify: `apps/studio-example/app/admin/[[...path]]/page.tsx`
- Modify: `packages/studio/src/lib/studio.test.ts`
- Test: `packages/studio/src/lib/studio.test.ts`

**Step 1: Write or update the failing embed tests**

Refocus `studio.test.ts` around the new shell boundary:

- fatal startup UI behavior only
- no shell-managed content/document route logic after remote mount
- `basePath` handoff into the loader path

Drop assertions that are now remote-runtime responsibilities, such as shell-level route resolution and document-shell rendering.

**Step 2: Run the targeted shell test**

Run: `bun test packages/studio/src/lib/studio.test.ts`
Expected: FAIL until the old shell assumptions are removed

**Step 3: Update the example embed page**

Change the example so it:

- stops preloading route-specific Studio state in the host page
- renders the shell with an explicit `basePath`
- leaves routing and document loading to the remote runtime

The result should be closer to:

```tsx
export default function AdminCatchAllPage() {
  return <Studio config={config} basePath="/admin" />;
}
```

**Step 4: Re-run the targeted shell test**

Run: `bun test packages/studio/src/lib/studio.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/studio-example/app/admin/[[...path]]/page.tsx packages/studio/src/lib/studio.test.ts
git commit -m "refactor(studio): remove host-managed studio routing"
```

### Task 6: Verify the full CMS-60 slice

**Files:**

- Modify: none unless verification exposes follow-up fixes
- Test: all touched package tests

**Step 1: Run targeted Studio tests**

Run: `bun test packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/runtime-registry.test.ts packages/studio/src/lib/studio.test.ts packages/studio/src/lib/bootstrap-verification.test.ts`
Expected: PASS

**Step 2: Run targeted shared-contract tests**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`
Expected: PASS

**Step 3: Run formatting and workspace checks**

Run: `bun run format:check && bun run check`
Expected: PASS

**Step 4: Inspect git status**

Run: `git status --short`
Expected: task-scoped tracked changes only; local-only paths such as `docs/plans/` remain unstaged

**Step 5: Final commit if verification fixes were required**

```bash
git add <task-scoped-files>
git commit -m "test(studio): finalize cms-60 runtime loader verification"
```
