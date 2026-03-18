# MDCMS ADR Catalog

This directory holds the accepted architectural decisions for MDCMS. ADRs capture rationale and consequences; the normative behavior remains in the owning spec under `docs/specs/`.

## ADR Index

| ID      | Title                                                                                 | Legacy Source   |
| ------- | ------------------------------------------------------------------------------------- | --------------- |
| ADR-001 | [Backend Framework: Bun + Elysia](./ADR-001-backend-framework-bun-elysia.md)          | 23.1            |
| ADR-002 | [Database as Source of Truth](./ADR-002-database-as-source-of-truth.md)               | 1, 2            |
| ADR-003 | [Studio Delivery: Approach C](./ADR-003-studio-delivery-approach-c.md)                | 2.1, 2.5, 9.6   |
| ADR-004 | [Project and Environment Hierarchy](./ADR-004-project-environment-hierarchy.md)       | 23.2            |
| ADR-005 | [Eden-First Action Catalog Contract](./ADR-005-eden-first-action-catalog-contract.md) | 2.8, 6.11, 6.12 |

## Relationship to Specs

- ADR-001 supports the backend/runtime decisions described in `docs/specs/SPEC-002-system-architecture-and-extensibility.md` and `docs/specs/SPEC-011-local-development-and-operations.md`.
- ADR-002 explains the database-first decision that underpins `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` and `docs/specs/SPEC-008-cli-and-sdk.md`.
- ADR-003 explains the Studio delivery model used by `docs/specs/SPEC-006-studio-runtime-and-ui.md`.
- ADR-004 explains the hierarchy assumptions used by `docs/specs/SPEC-005-auth-authorization-and-request-routing.md` and `docs/specs/SPEC-009-i18n-and-environments.md`.
- ADR-005 explains the typed action catalog contract owned by `docs/specs/SPEC-002-system-architecture-and-extensibility.md`.
