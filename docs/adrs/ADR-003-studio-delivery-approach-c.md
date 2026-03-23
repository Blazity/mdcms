---
status: accepted
canonical: true
created: 2026-03-11
last_updated: 2026-03-23
---

# ADR-003 Studio Delivery: Approach C

This is the live canonical document under `docs/`.

## Context

The Studio cannot rely on consumers rebuilding the Studio codebase from source every time they need customization. At the same time, MDCMS must support host-app MDX component preview, runtime customization, and a predictable npm integration surface.

## Decision

Publish `@mdcms/studio` as the host-facing Studio package, but load the actual Studio runtime from the backend at runtime. The package acts as the stable integration surface, while the backend serves the signed runtime bundle and bootstrap manifest.

## Security and Delivery Model

- The backend publishes `/studio/bootstrap` and versioned immutable runtime assets.
- The Studio package validates integrity and compatibility before executing the runtime.
- MVP execution mode is `module`. The runtime executes in the host JavaScript context through a capability-limited host bridge so MDX custom component preview can resolve against host-app components without a separate iframe bridge layer.

## Rationale

- This preserves a simple npm embedding story while still letting the backend own the runtime that users customize.
- It avoids forcing users to fork and republish the Studio package for every customization.
- It keeps backend-first defaults and Studio runtime composition aligned around the same server-controlled delivery path.

## Consequences

- The runtime loader, signature checks, and compatibility checks are part of the core Studio contract.
- Studio customization remains first-party and trusted in v1, not an untrusted plugin marketplace.
- `iframe` is not part of the MVP Studio delivery contract, so the bootstrap/runtime contract, package docs, and implementation verification should stay aligned on `module` only.

## Related Specs

- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`
