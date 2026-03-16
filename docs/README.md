# MDCMS Documentation

This directory is the live documentation entrypoint for MDCMS. It replaces the old single-file workflow with a domain-first catalog under `docs/specs/` and `docs/adrs/`.

## Canonical Sources

- Live product and architecture specs: `/Users/karol/Desktop/mdcms/docs/specs/README.md`
- Architecture decision records: `/Users/karol/Desktop/mdcms/docs/adrs/README.md`
- Execution roadmap and task tracking: `/Users/karol/Desktop/mdcms/ROADMAP_TASKS.md`

## Directory Layout

- `/Users/karol/Desktop/mdcms/docs/specs/` contains the live domain specs. Contracts stay inside the owning spec.
- `/Users/karol/Desktop/mdcms/docs/adrs/` contains the accepted architectural decisions and trade-offs.
- `/Users/karol/Desktop/mdcms/docs/plans/` remains a workspace for temporary implementation/design plans and is not canonical product documentation.

## Working Rules

- Update the owning spec when behavior, public contracts, or operator workflows change.
- Update or add an ADR when a meaningful architecture decision is made or reversed.
- The legacy monolithic spec has been retired; update the owning spec or ADR directly in `docs/`.

## Quick Navigation

- Specs index: `/Users/karol/Desktop/mdcms/docs/specs/README.md`
- ADR index: `/Users/karol/Desktop/mdcms/docs/adrs/README.md`
