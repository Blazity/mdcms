# CMS-60 Studio Runtime Loader Design

Date: 2026-03-21
Task: CMS-60

## Goal

Specify a concrete MVP architecture for `@mdcms/studio` where the package acts as a thin runtime shell that loads a backend-served remote Studio application in `module` mode and hands off all in-app behavior to that remote runtime.

## Canonical Inputs

- `ROADMAP_TASKS.md` CMS-60
- `docs/specs/README.md`
- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `packages/shared/src/lib/contracts/extensibility.ts`
- `packages/studio/src/lib/studio-component.tsx`
- `packages/studio/src/lib/remote-module.ts`
- `apps/server/src/lib/studio-bootstrap.ts`

## Spec Delta

`SPEC-006` and `SPEC-002` need a normative runtime-model update that:

- makes `module` the only supported Studio execution mode for MVP
- removes `iframe` from the MVP decision surface instead of deferring that decision to a later spike
- clarifies that the shell only owns bootstrap-time loading and fatal startup failure UI
- clarifies that the remote runtime is the full Studio application after `mount(...)` succeeds
- adds `basePath` to the shell-to-remote runtime contract so deep links resolve correctly without framework-specific router adapters
- defines the runtime-internal composition registry contract and deterministic collision rules

`ROADMAP_TASKS.md` also needs follow-up cleanup because CMS-61 currently reserves the execution-mode decision for later, which conflicts with the approved CMS-60 design direction.

## Scope

### In Scope

- Thin `@mdcms/studio` shell loader behavior
- Bootstrap fetch, manifest compatibility checks, runtime integrity checks, and remote module loading
- `module`-only runtime execution
- `basePath` handoff from shell to remote app
- Remote-owned Studio app routing and UI state after successful mount
- Runtime-internal composition surfaces for:
  - `routes`
  - `navItems`
  - `slotWidgets`
  - `fieldKinds`
  - `editorNodes`
  - `actionOverrides`
  - `settingsPanels`
- Deterministic collision and fallback behavior for those surfaces

### Out of Scope

- `iframe` execution mode
- Host-managed Studio routing
- SSR for the remote Studio application
- Third-party plugin marketplace semantics
- Dynamic per-request surface registration through the shell
- Kill-switch and rollback hardening beyond what CMS-60 needs for startup validation

## Design Decisions

### 1. The Shell Is Only a Loader Host

`@mdcms/studio` should only:

- fetch `/api/v1/studio/bootstrap`
- validate manifest shape, compatibility, and runtime integrity
- load the remote runtime entry
- construct the host bridge
- provide `apiBaseUrl`, auth context, and `basePath`
- call `mount(container, ctx)`

The shell should not own Studio navigation, editor flows, route-level loading, or normal application rendering once the remote runtime mounts.

### 2. The Remote Runtime Is the Whole Studio App

The remote bundle should be treated as the full Studio application, not as a set of shell-registered fragments.

Internally, the remote module can render a top-level `StudioApp` component, own its own router, and build its own composition registry, but the public boundary remains:

```ts
type RemoteStudioModule = {
  mount: (container: HTMLElement, ctx: StudioMountContext) => () => void;
};
```

This keeps the shell contract minimal while still allowing the remote app to be React-driven internally.

### 3. `module` Is the Only MVP Execution Mode

The approved direction is to remove `iframe` from MVP rather than keeping a dual-mode abstraction.

The bootstrap manifest can still include a `mode` field for explicitness and compatibility, but MVP should require `mode: "module"` and reject any other value deterministically.

### 4. Remote App Owns Routing After Startup

The remote Studio app should own browser-path syncing with the History API:

- read `window.location`
- call `history.pushState` / `history.replaceState`
- listen to `popstate`

No framework-specific router adapter should be required beyond the host app exposing a catch-all route that renders the shell.

Because deep links do not reveal the Studio subtree root reliably, the shell must provide an explicit `basePath`.

### 5. `basePath` Must Be Explicit

The remote runtime cannot infer whether a deep link such as `/admin/content/posts` is rooted at `/admin`, `/cms/admin`, or another embedding prefix.

`StudioMountContext` should therefore gain:

```ts
type StudioMountContext = {
  apiBaseUrl: string;
  basePath: string;
  auth: { mode: "cookie" | "token"; token?: string };
  hostBridge: HostBridgeV1;
};
```

This is the only routing input the shell needs to provide.

### 6. Composition Surfaces Stay Inside the Remote Runtime

The shell should not expose host-side `registerX(...)` APIs.

Instead, the remote Studio app should compose its own declarative registry for:

- `routes`
- `navItems`
- `slotWidgets`
- `fieldKinds`
- `editorNodes`
- `actionOverrides`
- `settingsPanels`

This keeps CMS-60 within the first-party runtime model already described in the specs and avoids inventing a broader plugin host API prematurely.

### 7. Collisions Must Be Deterministic and Fail Fast

The remote runtime should validate its registry before first real render.

Rules:

- `routes` use normalized path matching; `/settings` and `/settings/` conflict
- route parameter aliases that normalize to the same shape also conflict
- duplicate `fieldKinds`, `editorNodes`, `actionOverrides`, or `settingsPanels` fail startup
- `slotWidgets` require explicit numeric `priority`
- `slotWidgets` sort by `priority` descending, then `id` ascending
- `navItems` sort deterministically by explicit order, then `id`
- `settings.sidebar` entries must reference registered `settingsPanels`

### 8. Unknown Field Kinds Fallback Safely

Unknown or unregistered Studio field kinds should not crash the remote app.

The remote runtime should:

- render a safe JSON editor fallback
- emit a structured warning log with the missing field kind id
- continue rendering the rest of the editor

## Failure Model

### Shell-Owned Fatal Startup Failures

The shell is responsible only for fatal startup errors:

- bootstrap fetch failed
- bootstrap manifest invalid or incompatible
- runtime asset load/import failed
- remote `mount(...)` threw during startup

### Remote-Owned Application Failures

After `mount(...)` succeeds, the remote app owns all user-visible Studio states, including:

- normal loading states
- empty states
- forbidden states
- route-level errors
- editor failures
- application navigation

## Verification

Completion should be backed by:

- shell loader tests for bootstrap fetch, compatibility/integrity verification, remote import, and `mount(...)` context handoff
- shell fatal-startup tests for invalid manifest, integrity mismatch, incompatible versions, and mount failure
- remote runtime registry tests for normalized route conflicts, duplicate surface failures, deterministic slot ordering, and unknown field-kind fallback
- a deep-link integration test proving `basePath` handoff works under a non-root embed path
- `bun run format:check`
- `bun run check`

## Notes

- `docs/plans/` is local-only in this repository, so this design doc should remain untracked.
- The current package layout uses `packages/studio`, even though parts of the live spec still refer to `apps/studio`; implementation planning should follow the actual repository layout.
