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
- Component registrations:
  - authored `components` entries may include runtime-only loader callbacks:
    - `load?: () => Promise<unknown>`
    - `loadPropsEditor?: () => Promise<unknown>`
  - authored `components[*].propHints` is a typed widget-hint map for extracted
    MDX props. Supported entries are:
    - `{ format: "url" }`
    - `{ widget: "color-picker" | "textarea" | "image" | "hidden" | "json" }`
    - `{ widget: "slider", min, max, step? }`
    - `{ widget: "select", options }`
  - `parseMdcmsConfig(...)` keeps only serializable metadata (`name`,
    `importPath`, `description`, `propHints`, `propsEditor`) and strips the
    loader callbacks before the normalized config is consumed elsewhere.

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
  - `EnvironmentDefinitionsMeta`
  - `EnvironmentListResponse`
  - `EnvironmentCreateInput`
  - `assertEnvironmentSummary(...)`
  - `assertEnvironmentDefinitionsMeta(...)`
  - `assertEnvironmentListResponse(...)`
  - `assertEnvironmentCreateInput(...)`
- `EnvironmentSummary` is the canonical admin-facing environment payload:
  - `id`
  - `project`
  - `name`
  - `extends`
  - `isDefault`
  - `createdAt`
- Environment management remains config-authoritative:
  - valid environment names come from the latest synced config snapshot derived
    from `mdcms.config.ts`
  - `GET /api/v1/environments` returns `EnvironmentListResponse` with
    definitions readiness metadata
  - `extends` metadata is derived from the synced topology snapshot, not
    authored in the database

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
  - `StudioBootstrapManifest`, `StudioBootstrapReadyResponse`, `StudioMountContext`, `HostBridgeV1`, `RemoteStudioModule`
  - CLI support surfaces: `CliActionAlias`, `CliOutputFormatter`, `CliPreflightHook`
- Studio runtime contract rules:
  - MVP runtime mode is `module` only.
  - bootstrap success is a ready envelope:
    - `data.status = "ready"`
    - `data.source = "active" | "lastKnownGood"`
    - `data.manifest = StudioBootstrapManifest`
    - optional `data.recovery` with `rejectedBuildId` and `rejectionReason` only when `data.source = "lastKnownGood"`
  - `StudioMountContext` includes `basePath` so deep links can resolve under an embed subtree without framework-specific router adapters.
  - `StudioMountContext.mdx.catalog.components[*].extractedProps` is a strict
    serializable contract for auto-generated MDX props editing metadata.
  - `StudioMountContext.mdx.resolvePropsEditor(name)` is asynchronous and
    resolves to a custom props editor component or `null`.
  - MDX props editing precedence is deterministic:
    - a successfully resolved `propsEditor` replaces per-prop auto-generated
      controls for that component
    - otherwise `propHints` overrides win over the default prop-type mapping
    - otherwise the default mapping applies
  - Supported extracted prop variants are:
    - `string` (optionally `format: "url"` for URL-validated default inputs)
    - `number`
    - `boolean`
    - `date`
    - `enum` with non-empty `values`
    - `array` with `items: "string" | "number"`
    - `json`
    - `rich-text`
  - `format: "url"` is string-format metadata for default auto-form mapping,
    not a widget override.
  - The shell owns startup validation/loading failures plus startup-disabled outcomes such as `STUDIO_RUNTIME_DISABLED` and `STUDIO_RUNTIME_UNAVAILABLE`; after `mount(...)` succeeds, the remote runtime owns Studio UI states and routing.
- Runtime validators:
  - Implemented with strict `zod` schemas (`.strict()` + custom refinements) and normalized `RuntimeError` output.
  - `assertModuleManifest(...)`
  - `assertMdcmsModulePackage(...)`
  - `assertStudioBootstrapManifest(...)`
  - `assertStudioBootstrapReadyResponse(...)`
  - `assertStudioMountContext(...)`
  - `assertHostBridgeV1(...)`
  - `assertRemoteStudioModule(...)`
- Compatibility check helpers:
  - `assertModuleManifestCompatibility(manifest, { coreVersion, supportedApiVersion? })`
  - `assertStudioBootstrapCompatibility(manifest, { studioPackageVersion, hostBridgeVersion, supportedApiVersion? })`
  - Shared MDX helpers:
  - import path: `@mdcms/shared/mdx`
  - `extractMdxComponentProps(...)` reads a local component source file and
    normalizes supported prop shapes into the shared `extractedProps` contract
    while validating any authored `propHints` against the actual extracted prop
    kinds.
  - `extractMdxComponentProps(...)` is intended for local tooling/runtime
    preparation only; never for browser-time use
  - `createMdxAutoFormFields(extractedProps, propHints?)` converts extracted
    props into deterministic auto-form field metadata and is safe to use in
    browser/runtime code:
    - `string` -> `text`
    - `string` with `format: "url"` -> `url`
    - `string` with widget overrides -> `color-picker` | `textarea` | `image`
    - `number` -> `number`
    - `number` with widget override -> `slider`
    - `boolean` -> `boolean`
    - `enum` -> `select`
    - scalar or enum widget override -> `select`
    - `array:string` -> `string-list`
    - `array:number` -> `number-list`
    - `date` -> `date`
    - `json` with widget override -> `json`
    - `rich-text` -> `rich-text`
  - `hidden` omits a prop from the generated control list.
  - `json` extracted props are intentionally omitted from the default mapping;
    the widget override path owns those controls downstream.
- Strict compatibility version policy:
  - `minCoreVersion`, `maxCoreVersion`, `minStudioPackageVersion`, `minHostBridgeVersion`
    must use strict `x.y.z` format.
  - Pre-release/build metadata (for example `1.0.0-beta.1`, `1.0.0+build`) is rejected.

## Strict Module Bootstrap Planner (CMS-33)

- Shared runtime module bootstrap planning now exposes:
  - `buildRuntimeModulePlan(...)`
  - `RuntimeModulePlan`
  - `ModuleBootstrapViolation`
  - `ModuleBootstrapViolationCode`
- The planner enforces deterministic validation + ordering before runtime wiring:
  - validates module package shape and manifest compatibility
  - validates dependency availability (`dependsOn`)
  - detects dependency cycles
  - computes deterministic dependency-aware module order
  - validates duplicate action ids for `server` surface planning
- Planner violations are deterministic and sorted by:
  - violation `code`
  - `moduleId`
  - `details`
- Violation codes emitted by the planner:
  - `INVALID_PACKAGE`
  - `INCOMPATIBLE_MANIFEST`
  - `DUPLICATE_MODULE_ID`
  - `MISSING_DEPENDENCY`
  - `DEPENDENCY_CYCLE`
  - `DUPLICATE_ACTION_ID`
- Runtime loaders can still use `buildModuleLoadReport(...)` as a compatibility wrapper while migrating to strict fail-fast bootstrap semantics.

## Build

- `bun nx build shared`
- `bun nx typecheck shared`
