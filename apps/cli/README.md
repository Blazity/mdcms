# @mdcms/cli

CLI package boundary for MDCMS operator workflows.

## Config Authoring Contract (CMS-15)

- Public authoring helpers are exported from `@mdcms/cli`:
  - `defineConfig(...)`
  - `defineType(...)`
  - `reference(...)`
- `mdcms.config.ts` remains the code-first schema source of truth.
- Minimal example:

```ts
import { defineConfig, defineType, reference } from "@mdcms/cli";
import { z } from "zod";

export default defineConfig({
  project: "marketing-site",
  environment: "staging",
  serverUrl: "http://localhost:4000",
  contentDirectories: ["content"],
  types: [
    defineType("Author", {
      directory: "content/authors",
      fields: {
        name: z.string().min(1),
      },
    }),
    defineType("BlogPost", {
      directory: "content/blog",
      localized: true,
      fields: {
        title: z.string().min(1),
        author: reference("Author"),
      },
    }),
  ],
  locales: {
    default: "en-US",
    supported: ["en-US", "fr"],
    aliases: {
      en_us: "en-US",
    },
  },
});
```

- Validation/normalization rules enforced by the shared parser:
  - `project` and `serverUrl` are required trimmed strings
  - `environment` is an optional default-routing value
  - `contentDirectories` must cover every configured type directory
  - localized types require explicit `locales`
  - if `locales` is omitted and no type is localized, CLI resolves implicit
    single-locale mode with `__mdcms_default__`
  - `environments` overlays support `add`, `modify`, `omit`, `.env(...)`, and
    `extends`
  - loaded config now includes deterministic `resolvedEnvironments` from the
    shared parser for downstream schema-sync consumers

## Schema Registry Sync Model (CMS-17)

- Resolved CLI config is the source for schema registry sync payloads sent to
  `/api/v1/schema`.
- Syncs are latest-state only per `(project, environment)`:
  - the uploaded payload replaces the stored environment sync head
  - the server derives one registry entry per content type from that payload
- The synced schema is descriptive JSON, not an executable validator.
  - supported field shapes are serialized from the resolved Zod-backed config
  - unsupported executable validator features such as `.refine(...)`,
    transforms, and non-JSON values are rejected as `INVALID_INPUT` before the
    registry can be updated
- Server-side compatibility errors stay distinct from malformed payload errors:
  - `INVALID_INPUT` (`400`) => unsupported or malformed sync payload
  - `SCHEMA_INCOMPATIBLE` (`409`) => valid payload would require a content
    migration first, for example removing a type with documents or making a
    field newly required

- Environment overlay example:

```ts
const blogPost = defineType("BlogPost", {
  directory: "content/blog",
  fields: {
    title: z.string(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false).env("staging"),
  },
});

export default defineConfig({
  project: "marketing-site",
  serverUrl: "http://localhost:4000",
  contentDirectories: ["content"],
  types: [blogPost],
  environments: {
    production: {},
    staging: {
      extends: "production",
      types: {
        BlogPost: blogPost.extend({
          modify: {
            tags: z.array(z.string()).min(1),
          },
        }),
      },
    },
  },
});
```

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
  - CLI flag (`--api-key`) -> env (`MDCMS_API_KEY`) -> stored profile (`cms login`)
- Usage errors are deterministic and include stable error codes/messages.

## Login/Logout Credential Lifecycle (CMS-79)

- Commands:
  - `mdcms login`
  - `mdcms logout`
- `login` flow:
  - starts browser-based flow via server endpoints under `/api/v1/auth/cli/login/*`
  - opens default system browser and waits for loopback callback (`127.0.0.1:<port>`)
  - exchanges one-time code for scoped API key
  - default issued scopes: `content:read`, `content:read:draft`, `content:write`
  - stores profile under tuple `(serverUrl, project, environment)`
- `logout` flow:
  - best-effort remote revoke via `POST /api/v1/auth/api-keys/self/revoke`
  - always clears local stored profile deterministically
- Credential storage behavior:
  - OS credential store on macOS when available
  - fallback file store at `~/.mdcms/credentials.json` with `0600` permissions
  - one active profile per `(serverUrl, project, environment)` tuple
- Pull/push automatically consume stored credentials through runtime precedence.
- Scope expectations:
  - `pull` draft mode (`draft=true`) requires `content:read:draft`
  - `push` draft writes require `content:write`

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

## Push Command (Demo Track)

- Command:
  - `mdcms push`
- Flags:
  - `--force` -> skip confirmation prompt and apply immediately
  - `--dry-run` -> print push plan only, no API writes
  - `--published` -> reserved and currently rejected with deterministic `INVALID_INPUT`
- Behavior:
  - reads manifest-tracked files only from `.mdcms/manifests/<project>.<environment>.json`
  - pushes only changed documents (hash mismatch against manifest, or missing/empty manifest hash)
  - unchanged documents are skipped and never sent to API
  - parses local markdown into `{ frontmatter, body }`
  - derives content format from file extension (`.md` / `.mdx`)
  - updates known documents via `PUT /api/v1/content/:documentId`
  - if update target is missing, falls back to `POST /api/v1/content` and rewrites manifest key to the new `documentId`
  - writes updated draft revision/version/hash data back to the scoped manifest
  - plan output includes changed entries and `Unchanged (skipped): <N>` summary
- Current limitation:
  - active collaboration lock rejection semantics are deferred until CMS-53/CMS-82 closure

### Demo E2E Usage

From workspace root:

```bash
bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts pull --force
# edit local content file(s)
bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts push --force
```

Then verify results in the example app at `http://127.0.0.1:4173/demo/content`.

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
