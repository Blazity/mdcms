# CMS-35 Contract Validation Suite Design

**Task:** CMS-35 - Contract validation suite for extensibility

**Date:** 2026-03-16

## Scope Baseline

Owning specs:

- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/specs/README.md`

Roadmap source:

- `ROADMAP_TASKS.md` (`CMS-35`)

No spec delta is required for this task. CMS-35 hardens existing extensibility
contracts and registry behavior already defined in the owning specs.

## Goal

Add a CI-gated, fixture-driven contract validation suite for extensibility that:

- validates module manifests, action catalog payloads, and Studio bootstrap
  manifests with positive and negative fixtures
- proves deterministic ordering and fail-fast collision behavior for server and
  CLI registries
- covers authorization-filtered action catalog behavior without pulling the full
  Studio loader into scope
- keeps failure output actionable for contributors and operators

## In Scope

- Contract validation for:
  - `ModuleManifest`
  - `ActionCatalogItem[]`
  - `StudioBootstrapManifest`
- Deterministic ordering tests for:
  - server module loading and action collection
  - CLI module loading and merged aliases/formatters/hooks
- Collision tests for:
  - duplicate module IDs
  - duplicate action IDs
  - conflicting server action routes via `(method, path)` collisions
- Studio bootstrap publication verification for:
  - manifest shape
  - compatibility bounds
  - asset-byte integrity against `integritySha256`
  - placeholder signature/key invariants used by the current builder
- Authorization coverage for:
  - hidden actions omitted from `/api/v1/actions`
  - hidden actions omitted from `/api/v1/actions/:id`
  - forced access still rejected by protected server routes

## Out Of Scope

- Full `@mdcms/studio` runtime loader implementation
- Loader-side network fetch and runtime execution
- Runtime fallback / rollback / kill-switch behavior
- Final production integrity/signature enforcement behavior for runtime loading
- New extensibility surface contracts beyond those already owned by `SPEC-002`
  and `SPEC-006`

Those behaviors remain scheduled for later work, especially CMS-60 through
CMS-62.

## Chosen Approach

Use a fixture-driven contract suite with one small pure verification helper for
Studio bootstrap publications.

Why this approach:

- It matches CMS-35 acceptance criteria more directly than scattered ad hoc
  tests.
- It keeps CMS-35 in Phase 2 without dragging in loader/runtime execution.
- It creates reusable validation seams that later Studio loader tasks can call
  instead of re-deriving integrity and compatibility checks.

## Package Responsibilities

### `packages/shared`

- Own manifest and action-catalog contract fixtures/tests.
- Extend module planner collision detection to include duplicate server action
  routes based on `(method, path)`.
- Keep most fixtures local to tests unless a helper must be shared.

### `packages/studio`

- Add a pure bootstrap publication verifier.
- Test valid and invalid bootstrap publications with deterministic fixtures.
- Document that verification coverage exists before loader execution is added.

### `apps/server`

- Add server-facing tests for authorization-filtered action catalog behavior.
- Add startup failure tests for duplicate action routes.

### `apps/cli`

- Prove deterministic merge order for CLI aliases, output formatters, and
  preflight hooks across shuffled module inputs.

### `packages/modules`

- No production changes expected unless a very small test helper becomes
  necessary.

## Route Collision Interpretation

CMS-35 acceptance requires collision coverage for conflicting routes, but the
current extensibility contract does not expose an independent route manifest for
arbitrary `mount()` behavior.

To keep scope aligned with existing contracts, CMS-35 interprets route
collisions as duplicate server action route declarations:

- same HTTP method
- same action `path`

This covers the route metadata the extensibility system already owns without
inventing a broader route-introspection contract.

## Verification Strategy

Planned validation flow:

- `packages/shared` unit tests validate positive and negative contract fixtures.
- `packages/shared` and app-level module-loader tests validate deterministic
  ordering and collision reporting.
- `packages/studio` unit tests validate bootstrap publication verification with
  positive and negative fixtures.
- Existing package `bun test ./src` targets remain the CI entrypoint; no new CI
  orchestration layer is introduced in CMS-35.

## Operator / Contributor Output

Failure output should remain explicit about:

- which manifest/action/bootstrap payload failed
- which module or action caused the collision
- which `(method, path)` route pair is duplicated
- which integrity/signature/compatibility condition failed

The suite should favor deterministic ordering of violations so failures are
stable across repeated runs.
