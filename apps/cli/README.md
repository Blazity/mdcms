# @mdcms/cli

CLI package boundary for MDCMS operator workflows.

## CLI Runtime Framework (CMS-77)

- Executable entrypoint:
  - `apps/cli/src/bin/mdcms.ts` (Bun shebang, compiled to `dist/bin/mdcms.js`)
- Runtime command runner:
  - `runMdcmsCli(argv, options?)` in `src/lib/framework.ts`
  - deterministic parsing for global flags and command dispatch
  - module preflight hooks execute before the command handler
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

## Pull Command (CMS-80)

- Command:
  - `mdcms pull`
- Flags:
  - `--published` -> fetch published snapshots (`draft=false`)
  - `--dry-run` -> compute/print plan only, no file writes
  - `--force` -> skip overwrite prompt for locally modified files
- Default mode:
  - prompt-and-apply (not dry-run)
  - fetches draft heads (`draft=true`)
- Deterministic mapping:
  - localized types: `<path>.<locale>.<ext>`
  - non-localized types: `<path>.<ext>`
  - extension is sourced from server content format (`md`/`mdx`)
  - pulled type must exist in config `types` mapping; missing type mapping fails fast
- Plan output status groups:
  - `Modified`
  - `Locally modified`
  - `New`
  - `Moved/Renamed`
  - `Deleted on server`
  - `Unchanged`
- Transport metadata remains in local manifest only and is not written into frontmatter/body files.

## Scoped Manifest Contract (CMS-81)

- Manifest path is scope-specific:
  - `.mdcms/manifests/<project>.<environment>.json`
- Manifest shape:
  - `document_id -> { path, format, draftRevision, publishedVersion, hash }`
- The manifest is the sole local transport metadata source for pull logic.
- Validation is strict on read:
  - top-level must be an object map
  - each entry must contain only required keys
  - invalid types, unknown keys, or drifted shape fail with deterministic `INVALID_MANIFEST` errors
- Writes are atomic:
  - data is written to a temp file and moved into place via rename to avoid partial/corrupt manifests
- Manifest files are local-only artifacts (`.gitignore` includes `.mdcms/manifests/`).

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
- CLI entrypoint (`src/bin/mdcms.ts`) boots runtime through `createCliRuntimeContextWithModules(...)` and injects it into `runMdcmsCli(...)`.
- Preflight hooks are now part of real command execution flow and fail deterministically with `CLI_PREFLIGHT_FAILED`.
- Runtime logs emit module load summary lines for loaded and skipped modules.

## Build

- `bun nx build cli`
- `bun nx typecheck cli`
