# @mdcms/studio

Host-embedded Studio package boundary for MDCMS.

## Current Status

This package is intentionally scaffolded in CMS-1 to reserve the public `@mdcms/studio` namespace and establish build/typecheck targets. Runtime loader implementation is handled by later Studio tasks.

## Action Catalog Adapter (CMS-5)

- `createStudioActionCatalogAdapter(baseUrl, options?)` provides a typed Eden/Treaty client for:
  - `list()` -> `GET /api/v1/actions`
  - `getById(actionId)` -> `GET /api/v1/actions/:id`
- Treaty typing is sourced from `@mdcms/server` (`ActionCatalogContractApp`) so backend routes remain the contract source of truth.
- Adapter payloads are validated with shared runtime contract validators from `@mdcms/shared`.
- The adapter is metadata-only and does not bypass backend authorization rules.

## Build

- `bun nx build studio`
- `bun nx typecheck studio`
