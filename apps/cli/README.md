# @mdcms/cli

CLI package boundary for MDCMS operator workflows.

## CLI Runtime Framework (CMS-77)

- Executable entrypoint:
  - `apps/cli/src/bin/mdcms.ts` (Bun shebang, compiled to `dist/bin/mdcms.js`)
- Runtime command runner:
  - `runMdcmsCli(argv, options?)` in `src/lib/framework.ts`
  - deterministic parsing for global flags and command dispatch
- Global target/auth flags:
  - `--project`
  - `--environment`
  - `--api-key`
  - `--config` (default `mdcms.config.ts`)
  - `--server-url`
  - `--help`
- Target resolution precedence:
  - CLI flags -> env (`MDCMS_PROJECT`, `MDCMS_ENVIRONMENT`) -> config defaults
- Server URL resolution precedence:
  - CLI flag (`--server-url`) -> env (`MDCMS_SERVER_URL`) -> config (`serverUrl`)
- API key resolution precedence (headless/CI compatible):
  - CLI flag (`--api-key`) -> env (`MDCMS_API_KEY`) -> stored profile hook (reserved for CMS-79)
- Usage errors are deterministic and include stable error codes/messages.

## Action Catalog Adapter (CMS-5)

- `createCliActionCatalogAdapter(baseUrl, options?)` provides a typed Eden/Treaty client for:
  - `list()` -> `GET /api/v1/actions`
  - `getById(actionId)` -> `GET /api/v1/actions/:id`
- Treaty typing is sourced from `@mdcms/server` (`ActionCatalogContractApp`) so backend routes remain the contract source of truth.
- Adapter responses are validated against shared action catalog contracts from `@mdcms/shared`.
- Authorization remains server-authoritative; adapter metadata is only for client behavior.

## Module Topology Integration

- CLI module loading lives in `src/lib/module-loader.ts`.
- `@mdcms/cli` consumes `@mdcms/modules` compile-time registry and mounts only bundled local module CLI surfaces.
- Loader output is deterministic and reports:
  - `loadedModuleIds`
  - `skippedModuleIds`
  - structured skip reasons (`missing-surface`, `incompatible`, `invalid-package`)
- `createCliRuntimeContextWithModules(...)` applies local aliases, output formatters, and preflight hooks from loaded modules.
- Runtime logs emit module load summary lines for loaded and skipped modules.

## Build

- `bun nx build cli`
- `bun nx typecheck cli`
