# @mdcms/cli

CLI package boundary for MDCMS operator workflows.

## Current Status

This package is intentionally scaffolded in CMS-1 to reserve the `@mdcms/cli` namespace and establish build/typecheck targets. Command implementation (`init`, `pull`, `push`, auth flows, migrations) follows in later tasks.

## Action Catalog Adapter (CMS-5)

- `createCliActionCatalogAdapter(baseUrl, options?)` provides a typed Eden/Treaty client for:
  - `list()` -> `GET /api/v1/actions`
  - `getById(actionId)` -> `GET /api/v1/actions/:id`
- Treaty typing is sourced from `@mdcms/server` (`ActionCatalogContractApp`) so backend routes remain the contract source of truth.
- Adapter responses are validated against shared action catalog contracts from `@mdcms/shared`.
- Authorization remains server-authoritative; adapter metadata is only for client behavior.

## Module Topology Integration

- App-level CLI module loading lives in `apps/cli/src/modules.ts`.
- `apps/cli` consumes `@mdcms/modules` compile-time registry and mounts only bundled local module CLI surfaces.
- Loader output is deterministic and reports:
  - `loadedModuleIds`
  - `skippedModuleIds`
  - structured skip reasons (`missing-surface`, `incompatible`, `invalid-package`)
- Runtime logs emit module load summary lines for loaded and skipped modules.

## Build

- `bun nx build cli`
- `bun nx typecheck cli`
