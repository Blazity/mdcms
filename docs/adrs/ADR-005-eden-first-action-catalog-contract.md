---
status: accepted
canonical: true
created: 2026-03-11
last_updated: 2026-03-11
legacy_sections:
  - 2.8
  - 6.11
  - 6.12
---

# ADR-005 Eden-First Action Catalog Contract

This is the live canonical document under `docs/`.

## Context

Studio and CLI both need a stable backend-driven contract for generated defaults, action discovery, and permission-aware behavior. The contract also needs to remain type-safe and aligned with the server codebase without reviving an OpenAPI-centric workflow.

## Decision

Use a typed action registry exposed through `/api/v1/actions` and `/api/v1/actions/:id` as the canonical runtime contract for Studio and CLI. Metadata remains flattened, data-only, and auth-filtered. The surrounding implementation stays Eden/Treaty-first rather than OpenAPI-first.

## Rationale

- The action catalog keeps the generation contract explicit without adding a separate OpenAPI authoring/codegen path.
- Flattened metadata is easier to consume across Studio and CLI than nested vendor-extension conventions.
- Auth-filtered responses keep visibility aligned with the caller while preserving backend authority over execution.

## Consequences

- Backend action definitions become the single contract source for generated Studio and CLI behavior.
- Inline JSON Schema stays part of the catalog payload for request/response description, but metadata is non-executable.
- Compatibility and collision rules must be validated at startup and in CI.

## Related Specs

- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/specs/SPEC-008-cli-and-sdk.md`
