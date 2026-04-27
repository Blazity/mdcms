# CMS-62 Studio Runtime Hardening Design

Date: 2026-03-23
Task: CMS-62

## Goal

Implement the selected `module` Studio runtime path as the only production mode and add deterministic startup recovery behavior, operator disable behavior, and regression coverage for runtime validation, authorization filtering, and MDX host-bridge preview behavior.

## Canonical Inputs

- `ROADMAP_TASKS.md` CMS-62
- `docs/specs/README.md`
- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`
- `apps/server/README.md`
- `packages/studio/README.md`

## Spec Delta

The execution mode itself does not change. The owning spec already defines MVP Studio runtime execution as `module` only.

The required spec delta is the startup recovery contract:

- `SPEC-006` must define server-owned publication state with `active`, optional `lastKnownGood`, and operator disable state.
- `SPEC-006` must define bootstrap success as a startup envelope, not a raw manifest-only payload.
- `SPEC-006` must define a deterministic recovery retry shape for client-detected runtime rejection:
  - `rejectedBuildId`
  - `rejectionReason` in `integrity | signature | compatibility`
- `SPEC-006` must define deterministic disabled/unavailable outcomes:
  - `STUDIO_RUNTIME_DISABLED`
  - `STUDIO_RUNTIME_UNAVAILABLE`
- `SPEC-002` should align its testing/architecture language to clarify that build selection remains server-owned and the shell only retries bootstrap once with rejection context.

## Scope

### In Scope

- Keep `module` as the only production runtime mode.
- Add server-owned rollback to `lastKnownGood`.
- Add an operator kill-switch path for Studio startup.
- Keep `/api/v1/studio/bootstrap` as the single bootstrap endpoint.
- Add one bootstrap retry from the shell when runtime validation rejects a served build.
- Add regression coverage for integrity/signature/compatibility rejection, fallback selection, disabled/unavailable behavior, unauthorized action visibility, forced server rejection, and MDX host-bridge preview.

### Out of Scope

- Any production `iframe` runtime path.
- Browser-local caching of last-known-good builds.
- A new admin UI or public API for toggling the kill switch.
- A general deployment/promotion system beyond the minimum publication state required for bootstrap decisions.

## Design Decisions

### 1. Server Owns Publication Selection

The server decides which Studio build is safe to serve. The shell never chooses between active and fallback builds on its own and never persists fallback state in the browser.

Server publication state is modeled as:

- `active` build
- optional `lastKnownGood` build
- operator `killSwitch`

This preserves the existing architecture: the server publishes the Studio runtime, and the shell only validates and mounts the returned runtime.

### 2. Keep a Single Bootstrap Endpoint

`GET /api/v1/studio/bootstrap` remains the only startup endpoint.

Initial startup request remains body-less.

If the shell rejects a served build during integrity/signature/compatibility validation, it retries the same endpoint once with rejection context:

- `rejectedBuildId=<buildId>`
- `rejectionReason=integrity|signature|compatibility`

The server uses that context to decide whether to serve `lastKnownGood` or return a deterministic disabled/unavailable response.

### 3. Bootstrap Success Becomes a Startup Envelope

Instead of returning only `{ data: StudioBootstrapManifest }`, bootstrap success returns a startup envelope:

```ts
type StudioBootstrapReadyResponse = {
  data: {
    status: "ready";
    source: "active" | "lastKnownGood";
    manifest: StudioBootstrapManifest;
    recovery?: {
      rejectedBuildId: string;
      rejectionReason: "integrity" | "signature" | "compatibility";
    };
  };
};
```

This keeps the public surface small while making fallback usage explicit and testable.

### 4. Disabled and Unavailable Stay as Error Envelopes

Bootstrap remains deterministic when Studio cannot be started:

- `503 STUDIO_RUNTIME_DISABLED`
  - operator kill switch is enabled
- `503 STUDIO_RUNTIME_UNAVAILABLE`
  - no safe build can be served

The shell renders deterministic startup error UI for those outcomes and does not retry further.

### 5. The Shell Retries Once

The shell startup flow becomes:

1. Fetch bootstrap.
2. Fetch runtime asset.
3. Validate integrity/signature/compatibility.
4. Mount runtime if validation passes.
5. If validation fails and the failure reason is retryable, re-request bootstrap once with rejection context.
6. If the retry returns a ready payload, validate and mount the fallback build.
7. If the retry returns disabled/unavailable, or if the fallback build also fails validation, render deterministic startup failure UI and stop.

There is no infinite retry loop.

### 6. Operator Path Is Config-Driven in MVP

CMS-62 does not add a new mutation API for Studio publication control.

The kill switch is server configuration or environment driven. `lastKnownGood` is the previously promoted verified publication snapshot held by the server runtime/publication layer.

This satisfies the acceptance criterion without widening the operator surface beyond MVP needs.

### 7. Selected-Mode Regression Coverage Must Exercise Real Host-Bridge and Authorization Paths

Regression coverage should prove more than contract parsing:

- the `module` mode loader handles happy-path startup
- invalid runtime bytes/signature/compatibility trigger the one-shot bootstrap retry
- fallback builds are served from `lastKnownGood`
- disabled/unavailable outcomes are deterministic
- Studio-visible actions come only from the authorization-filtered catalog
- forced route invocation is still rejected by the server
- the remote runtime calls `hostBridge.renderMdxPreview(...)` on the document/editor path

## Implementation Notes

- Shared contracts should own the new bootstrap ready envelope types and validators.
- Server code should expose publication-state helpers without introducing circular package dependencies.
- The remote runtime can stay thin, but it should include one minimal document-route preview surface and one minimal action strip driven by the filtered action catalog so the tests cover real selected-mode behavior.

## Verification

The task is complete when the repository can demonstrate:

- module-only runtime behavior remains the only production path
- bootstrap recovery is deterministic and server-owned
- the shell retries bootstrap once on validation rejection and stops cleanly afterward
- unauthorized actions are absent from Studio-visible action rendering and still rejected by the server when forced
- MDX preview host-bridge flow is exercised in selected mode
- `bun run format:check`
- `bun run check`
- targeted runtime regression tests in `shared`, `server`, and `studio`
- `bun run studio:embed:smoke`

## Notes

- `docs/plans/` is local-only in this repository and must remain untracked.
