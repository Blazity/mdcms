# MDCMS Documentation

This directory is the live documentation entrypoint for MDCMS. It replaces the old single-file workflow with a domain-first catalog under `docs/specs/` and `docs/adrs/`.

## Canonical Sources

- Live product and architecture specs: `specs/README.md`
- Architecture decision records: `adrs/README.md`

## Directory Layout

- `specs/` contains the live domain specs. Contracts stay inside the owning spec.
- `adrs/` contains the accepted architectural decisions and trade-offs.
- `plans/` remains a workspace for temporary implementation/design plans and is not canonical product documentation (local-only, not committed).

## Working Rules

- Update the owning spec when behavior, public contracts, or operator workflows change.
- Update or add an ADR when a meaningful architecture decision is made or reversed.
- The legacy monolithic spec has been retired; update the owning spec or ADR directly in `docs/`.

## Quick Navigation

- Specs index: `specs/README.md`
- ADR index: `adrs/README.md`
