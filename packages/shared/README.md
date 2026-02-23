# @mdcms/shared

Shared contracts/types/utilities package boundary for MDCMS.

## Current Status

This package is intentionally scaffolded in CMS-1 to provide a stable import boundary for cross-package contracts. Runtime contracts and validators are introduced in downstream shared-contract tasks.

## Runtime Contracts (CMS-4)

- `parseCoreEnv(rawEnv)` validates shared runtime fields (`NODE_ENV`, `LOG_LEVEL`, `APP_VERSION`).
- `parseDatabaseEnv(rawEnv)` validates baseline DB config:
  - `DATABASE_URL` (required)

## Build

- `bun nx build shared`
- `bun nx typecheck shared`
