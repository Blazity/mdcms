# @mdcms/shared

Shared contracts/types/utilities package boundary for MDCMS.

## Current Status

This package is intentionally scaffolded in CMS-1 to provide a stable import boundary for cross-package contracts. Runtime contracts and validators are introduced in downstream shared-contract tasks.

## Runtime Contracts (CMS-4)

- `parseCoreEnv(rawEnv)` validates shared runtime fields (`NODE_ENV`, `LOG_LEVEL`, `APP_VERSION`).
- `parseDatabaseEnv(rawEnv)` validates baseline DB config:
  - `DATABASE_URL` (required)

## Typed Action Catalog Contracts (CMS-5)

- `API_V1_BASE_PATH` defines the canonical REST base path: `/api/v1`.
- `ActionCatalogItem` is the flattened action metadata contract shared by server, Studio, and CLI:
  - `id`, `kind`, `method`, `path`, `permissions`
  - optional `studio`, optional `cli`
  - optional inline `requestSchema` / `responseSchema`
- `assertActionCatalogItem(...)` and `assertActionCatalogList(...)` validate action catalog payload shape and inline schema object shape at runtime.
- Route ownership for Eden/Treaty contract typing lives in `@mdcms/server`, while payload contracts and validators remain in `@mdcms/shared`.

## Explicit Target Routing Contracts (CMS-14)

- Routing constants:
  - `MDCMS_PROJECT_HEADER` (`X-MDCMS-Project`)
  - `MDCMS_ENVIRONMENT_HEADER` (`X-MDCMS-Environment`)
  - `MDCMS_PROJECT_QUERY_PARAM` (`project`)
  - `MDCMS_ENVIRONMENT_QUERY_PARAM` (`environment`)
- `resolveRequestTargetRouting(request)` parses and normalizes explicit target routing from headers/query.
  - Trims input values and treats empty strings as missing.
  - Rejects conflicting header/query values with `TARGET_ROUTING_MISMATCH` (`400`).
- `assertRequestTargetRouting(request, requirement)` enforces route-level requirements:
  - `"project"` => project is required.
  - `"project_environment"` => project + environment are required.
  - Missing fields are rejected with `MISSING_TARGET_ROUTING` (`400`).

## Extensibility Contracts + Studio Runtime Contracts (CMS-9)

- Shared extensibility contracts are framework-agnostic by design and avoid direct Elysia/React/DOM dependencies in `@mdcms/shared`.
- Core exported types:
  - `ModuleManifest`, `MdcmsModulePackage`, `ServerSurface`, `CliSurface`
  - `StudioBootstrapManifest`, `StudioMountContext`, `HostBridgeV1`, `RemoteStudioModule`
  - CLI support surfaces: `CliActionAlias`, `CliOutputFormatter`, `CliPreflightHook`
- Runtime validators:
  - Implemented with strict `zod` schemas (`.strict()` + custom refinements) and normalized `RuntimeError` output.
  - `assertModuleManifest(...)`
  - `assertMdcmsModulePackage(...)`
  - `assertStudioBootstrapManifest(...)`
  - `assertStudioMountContext(...)`
  - `assertHostBridgeV1(...)`
  - `assertRemoteStudioModule(...)`
- Compatibility check helpers:
  - `assertModuleManifestCompatibility(manifest, { coreVersion, supportedApiVersion? })`
  - `assertStudioBootstrapCompatibility(manifest, { studioPackageVersion, hostBridgeVersion, supportedApiVersion? })`
- Strict compatibility version policy:
  - `minCoreVersion`, `maxCoreVersion`, `minStudioPackageVersion`, `minHostBridgeVersion`
    must use strict `x.y.z` format.
  - Pre-release/build metadata (for example `1.0.0-beta.1`, `1.0.0+build`) is rejected.

## Build

- `bun nx build shared`
- `bun nx typecheck shared`
