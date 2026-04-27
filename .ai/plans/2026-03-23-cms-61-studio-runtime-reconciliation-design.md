# CMS-61 Studio Runtime Decision Reconciliation Design

Date: 2026-03-23
Task: CMS-61

## Goal

Reconcile the stale Studio execution-mode decision record with the live module-only Studio runtime contract that is already implemented and specified elsewhere in the repository.

## Canonical Inputs

- `ROADMAP_TASKS.md` CMS-61
- `docs/specs/README.md`
- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/adrs/ADR-003-studio-delivery-approach-c.md`
- `packages/studio/README.md`

## Spec Delta

No owning-spec delta is required for this reconciliation slice.

The authoritative product contract is already module-only in the owning specs:

- `SPEC-002` says Studio runtime execution is `module`-only in MVP.
- `SPEC-006` defines `StudioExecutionMode` as `module` and states that `module` is the only supported Studio execution mode in MVP.

The required delta is in the architectural rationale record:

- `ADR-003` still says the execution-mode choice is open between `iframe` and `module`.
- `ADR-003` must be reconciled so the decision record matches the live spec and current implementation direction.

## Scope

### In Scope

- Update `ADR-003` to state that MVP execution mode is `module`.
- Remove stale wording that leaves the execution mode undecided.
- Keep the ADR rationale aligned with host bridge and MDX preview requirements already reflected in the specs.

### Out of Scope

- Any new runtime implementation work
- Any `iframe` spike or proof-of-concept
- Changes to the owning specs beyond confirming they already contain the final contract
- New test coverage unless verification reveals a docs inconsistency that must be fixed

## Design Decisions

### 1. Treat This as ADR Reconciliation, Not Product Redesign

`CMS-61` is being interpreted here as a documentation reconciliation slice only. The owning specs already carry the normative decision, so the ADR should record the same outcome instead of reopening the choice.

### 2. Keep the Change Focused to `ADR-003`

The smallest correct change is to update the stale ADR language in place:

- replace the open decision wording with a final `module` decision
- explain that the host bridge and MDX preview requirements fit the in-process module model for MVP
- remove the statement that the final mode is still pending future spikes

### 3. Use Existing Repo Evidence Rather Than Inventing New Spike Artifacts

The repository already contains enough internal evidence for a reconciliation-only slice:

- the owning specs are module-only
- the package README is module-only
- the runtime contracts and tests reject non-module manifests

This slice should not manufacture a fake dual-mode evaluation artifact inside the codebase.

## Verification

Completion should be backed by:

- confirming `ADR-003` no longer states the decision is open
- confirming the canonical docs set no longer disagrees about MVP execution mode
- `bun run format:check`

## Notes

- `docs/plans/` is local-only in this repository, so this design doc should remain untracked.
