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

## Config Contract + Normalization (CMS-15)

- Shared config authoring surface:
  - `defineConfig(...)`
  - `defineType(...)`
  - `reference(...)`
  - `parseMdcmsConfig(...)`
- `parseMdcmsConfig(...)` is the canonical validator/normalizer for
  `mdcms.config.ts`.
- Field validators must implement the Standard Schema interface; Zod is the
  primary supported authoring library.
- Locale behavior:
  - localized types require explicit `locales`
  - locale tags are trimmed, `_` is converted to `-`, and casing is canonicalized
  - `__mdcms_default__` is reserved for implicit single-locale mode only
  - if no type is localized and `locales` is omitted, the effective locale
    contract becomes `{ default: "__mdcms_default__", supported: ["__mdcms_default__"] }`
- Managed directory behavior:
  - `contentDirectories` is normalized to unique project-relative paths
  - every configured type directory must be equal to or nested under one
    `contentDirectories` entry
- Reference fields:
  - `reference("TypeName")` returns a string validator with MDCMS reference
    metadata attached for downstream schema sync/registry work.

## Environment Overlay Resolution (CMS-16)

- Shared environment overlay authoring surface:
  - `defineType(...).extend({ add, modify, omit })`
  - field-level `.env("staging", "preview")` sugar on Zod-authored fields
- `parseMdcmsConfig(...)` now parses:
  - `environments`
  - deterministic `resolvedEnvironments`
- Resolver rules:
  - base fields are shared by default
  - `.env(...)` fields are expanded into environment-local `add` overlays
  - `extends` chains resolve parent-first
  - `add` requires a missing field
  - `modify` requires an inherited field
  - `omit` requires an inherited field
- Invalid overlay authoring is rejected with `INVALID_CONFIG`, including:
  - unknown `extends` targets
  - circular inheritance
  - `.env(...)` conflicts with explicit `add`
  - `.env(...)` used inside overlay `add` / `modify` blocks

## Environment Management Contracts (CMS-18)

- Shared environment management surface:
  - `EnvironmentSummary`
  - `EnvironmentCreateInput`
  - `assertEnvironmentSummary(...)`
  - `assertEnvironmentCreateInput(...)`
- `EnvironmentSummary` is the canonical admin-facing environment payload:
  - `id`
  - `project`
  - `name`
  - `extends`
  - `isDefault`
  - `createdAt`
- Environment management remains config-authoritative:
  - valid environment names come from `mdcms.config.ts`
  - `extends` metadata is derived from config, not authored in the database

## Schema Registry Contracts (CMS-17)

- Shared schema registry surface:
  - `assertSchemaRegistryEntry(...)`
  - `assertSchemaRegistrySyncPayload(...)`
  - `serializeResolvedEnvironmentSchema(...)`
- The registry sync model is latest-state only per `(project, environment)`:
  - one environment-level sync payload
  - one derived descriptive entry per schema type
- `serializeResolvedEnvironmentSchema(...)` emits descriptive JSON snapshots, not
  executable validators.
  - supported shapes are the coarse Zod-backed field kinds used by MDCMS
  - unsupported executable features such as custom `.refine(...)`,
    transforms/pipes, and non-JSON payload members fail closed with
    `INVALID_INPUT`
- Error split:
  - `INVALID_INPUT` (`400`) means the payload or serializer output is malformed,
    unsupported, or not JSON-serializable
  - `SCHEMA_INCOMPATIBLE` (`409`) is a server-side compatibility result when an
    otherwise valid sync would conflict with existing content

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
