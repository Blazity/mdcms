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

## Build

- `bun nx build cli`
- `bun nx typecheck cli`
