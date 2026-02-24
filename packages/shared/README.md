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

## Build

- `bun nx build shared`
- `bun nx typecheck shared`
