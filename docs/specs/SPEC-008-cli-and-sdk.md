---
status: live
canonical: true
created: 2026-03-11
last_updated: 2026-03-31
---

# SPEC-008 CLI and SDK

This is the live canonical document under `docs/`.

## SDK

### Design Goals

- Thin wrapper around the REST API
- Framework-agnostic (works in any React-based setup)
- Explicit project/environment routing on every request
- Handles pagination, error handling, and response parsing deterministically
- No codegen step required for SDK read operations

### Usage

```typescript
import { createClient } from "@mdcms/sdk";

const cms = createClient({
  serverUrl: "http://localhost:4000",
  apiKey: process.env.MDCMS_API_KEY,
  project: "marketing-site",
  environment: "production",
});

// Fetch by document ID (preferred)
const postById = await cms.get("BlogPost", { id: "uuid", locale: "en" });

// Fetch by slug (legacy-compatible)
const post = await cms.get("BlogPost", { slug: "hello-world", locale: "en" });

// List documents
const posts = await cms.list("BlogPost", {
  locale: "en",
  published: true,
  limit: 10,
  sort: "createdAt",
  order: "desc",
});

// Get with reference resolution
const postWithAuthor = await cms.get("BlogPost", {
  slug: "hello-world",
  resolve: ["author"], // Resolves the Author reference inline
});
```

The SDK follows the same reference-resolution contract documented in SPEC-003. Resolution is shallow-only, unresolved references become `null`, and the response may include a top-level `resolveErrors` map keyed by the full field path (for example `frontmatter.author`) so callers can inspect why a referenced document could not be materialized. The `resolve` query values express field paths relative to `frontmatter` (e.g., `resolve=author` or `resolve=hero.author`), so callers should not prefix them with `frontmatter.`.

### SDK Contract

- `createClient` stores the server URL, API key, and default target routing (`project`, `environment`) for subsequent requests.
- The SDK is read-focused in v1 and exposes `get` and `list`. Reference expansion is configured through the `resolve` option on those methods; it is not a separate SDK method.
- `get(type, input)` accepts either `id` or `slug`. `id` is preferred; `slug` remains available for legacy-compatible lookups.
- `get` and `list` both accept an explicit `locale` parameter, plus optional `project` and `environment` overrides that take precedence over the client defaults for that call only.
- The SDK sends explicit target routing with `X-MDCMS-Project` and `X-MDCMS-Environment` on every request rather than relying on ambient runtime state.
- `list(type, input)` maps to the content list query contract owned by SPEC-003, including pagination (`limit`, `offset`), sorting (`sort`, `order`), draft reads, and the supported filter fields.
- The SDK parses the shared API envelopes directly: single-document reads unwrap `{ data }`, list reads unwrap `{ data, pagination }`, and document payloads preserve any `resolveErrors` map returned by the API.
- API error responses are surfaced through a deterministic SDK error type parsed from the shared error envelope. Transport failures, malformed success payloads, and client misconfiguration use a separate client-side error type so callers can distinguish backend errors from local failures.

### Type Safety and Schema Metadata

- A schema fetched at runtime can support introspection or future runtime validation, but it does not provide compile-time TypeScript inference on its own.
- The read client defined here does not fetch schema during initialization or before content reads.
- Schema-aware write helpers, schema hash pinning, and any automatic schema refresh behavior are deferred until they are specified as a separate contract.

---

## CLI

### Commands

| Command                      | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| `cms init`                   | Interactive wizard to set up MDCMS in an existing project                   |
| `cms login`                  | Authenticate via browser-based OAuth/email login                            |
| `cms logout`                 | Clear stored credentials                                                    |
| `cms pull`                   | Download all content from CMS to local `.md`/`.mdx` files                   |
| `cms push`                   | Upload local `.md`/`.mdx` files to CMS                                      |
| `cms push --validate`        | Validate content against schema before pushing                              |
| `cms schema sync`            | Sync `mdcms.config.ts` schema to the server registry                        |
| `cms migrate`                | Generate and apply content migrations for schema changes                    |
| `cms status`                 | Show sync status (local vs server versions)                                 |
| `cms action list`            | List available backend actions from `/actions` (with permissions metadata). |
| `cms action run <actionId>`  | Execute a command/query action via the generic action runner.               |
| `cms <module-defined alias>` | Optional local alias mapped to `actionId` by bundled module CLI surface.    |

All commands that interact with server content resolve a target `(project, environment)` from config defaults and allow per-run overrides via `--project` and `--environment`.

CLI extensibility in v1 is intentionally action-based: aliases, formatters, and preflight hooks are allowed; arbitrary command-tree injection is out of scope.

### `cms init` — Interactive Wizard

The setup wizard walks through:

1. **Server URL** — Prompt for the MDCMS server URL.
2. **Authentication** — Open browser for login, store credentials.
3. **Directory scanning** — Scan the project for directories containing `.md`/`.mdx` files and collect locale hints from frontmatter, filename suffixes, and locale folder segments.
4. **Directory selection** — Let the developer choose which directories to manage.
5. **Schema inference** — Analyze existing frontmatter across files to suggest schema types/fields and infer per-type localization mode (`localized: false` when no locale evidence exists, `localized: true` when two or more distinct locales are detected).
6. **Schema + locale confirmation** — Present inferred schema and locale mapping plan, let developer adjust. Locale detection precedence is `frontmatter > filename suffix > folder segment`; frontmatter keys checked are `locale`, `lang`, and `language`.
7. **Config generation** — Generate `mdcms.config.ts` with the confirmed schema, server URL, and settings. If localized types are present, generate `locales.default`, `locales.supported`, and persisted remaps in `locales.aliases`. The wizard recommends `locales.default` as the most frequently detected locale and prompts for confirmation/override.
8. **Initial import** — Push all selected content to the CMS server with explicit `locale` and `content_format` per document.
9. **Gitignore + untracking update** — Add managed content directories to `.gitignore` and explicitly remove already tracked managed content files from the Git index (`git rm -r --cached <dir>`), so they are no longer tracked.

If the selected managed directories are inside a Git repository and contain tracked files, the wizard must:

- Detect tracked files under each selected managed directory.
- Prompt before mutating the Git index.
- Run `git rm -r --cached <dir>` (or equivalent per-file commands) so files remain on disk but are no longer tracked.
- Print a clear post-step summary (what was untracked) and the follow-up commit guidance.

#### Brownfield Locale Detection and Remapping Algorithm

For each candidate file discovered during `cms init`:

1. Parse locale candidates from frontmatter keys (`locale`, `lang`, `language`), filename suffix, and folder segment.
2. Apply precedence `frontmatter > filename suffix > folder segment`.
3. Normalize the chosen candidate by trimming whitespace, replacing `_` with `-`, and applying canonical BCP 47 casing.
4. If the normalized locale is valid, use it directly.
5. If unresolved/invalid, prompt for remap: either map to an existing canonical locale or add a new supported locale.
6. Persist successful remaps to `locales.aliases` in generated `mdcms.config.ts`.
7. Infer per-type localization mode:
   - No multi-locale evidence => `localized: false`.
   - Two or more distinct locales => `localized: true`.
8. For localized types, files with no locale marker are imported as default-locale variants and reported as warnings.
9. Build translation groups from normalized base paths (locale markers stripped from suffix/folder forms) before initial import.

#### Brownfield Verification Scenarios

`cms init` behavior must be validated against:

1. Single-locale brownfield with no locale markers (infers non-localized type).
2. Multi-locale suffix patterns such as `about.en.md` + `about.fr.mdx`.
3. Folder locale patterns such as `content/pages/fr/about.md`.
4. Frontmatter locale overriding conflicting suffix/folder hints.
5. Non-canonical tags (`en_us`, `EN-us`, legacy aliases) requiring normalization/remap.
6. Localized types where some files lack locale markers (default-locale assignment + warning).
7. Mixed projects containing both localized and non-localized types.
8. Pull/push roundtrip that preserves `.md` vs `.mdx`.
9. Reserved token collision prevention (`__mdcms_default__` forbidden in explicit supported/alias targets).
10. Clone/promote remap correctness using `translation_group_id + locale` in implicit single-locale mode.

### `cms pull`

- Downloads the latest **draft state** from the CMS as `.md`/`.mdx` files into the filesystem (draft-first default).
- Pull preserves extension from server `content_format` (`md` or `mdx`).
- Always syncs the full content tree (no selective path filtering).
- **Dry-run by default:** Before writing anything, the CLI compares local files against the server state and prints a summary of all changes that will be applied:

```
$ cms pull

Fetching content from http://localhost:4000 (production)...
Project: marketing-site

  Modified (server is newer):
    blog/hello-world.en.md       (local: r12, server: r15)
    blog/getting-started.en.md   (local: r4, server: r5)

  Locally modified (will be overwritten):
    pages/about.en.md            (local file differs from r8)

  New (will be created):
    blog/new-post.en.md          (server: r1)

  Moved/Renamed:
    blog/old-slug.en.md → blog/new-slug.en.md  (server: r9)

  Deleted on server (local file will be removed):
    blog/deprecated-post.en.md

  Unchanged: 42 files

  ⚠  2 local files will be overwritten. Continue? [y/N]
```

- **Locally modified detection:** The CLI hashes each local file and compares it against the content at the draft revision recorded in the manifest. If the local file has been edited since the last pull/push, it is flagged as "locally modified" with a warning that changes will be lost.
- If there are no locally modified files, the pull proceeds without confirmation.
- `cms pull --force` skips the confirmation prompt.
- **Detects moves/renames:** Compares the manifest's `document_id` → `{ path, format }` mapping against the server. If a document's path and/or format changed (renamed slug, moved folder, or `.md`/`.mdx` extension change), the old local file is deleted and the new file is written at the new deterministic path.
- **Detects deletions:** If a document was soft-deleted on the server, the corresponding local file is removed.
- Records draft revision, published version, content format, and content hash for each document in a scoped manifest (`.mdcms/manifests/<project>.<environment>.json`).
- The manifest maps `document_id` → `{ path, format, draftRevision, publishedVersion, hash }` and is used by `cms push` for optimistic concurrency checks and by `cms pull` for local modification detection. The manifest is not committed to git.
- `cms pull --published` is available when developers want published snapshots instead of drafts.

#### Local File Mapping Contract (Strict)

- Localized types use deterministic paths: `<document.path>.<locale>.<ext>` (for example: `blog/hello-world.fr.mdx`).
- Non-localized types use deterministic paths: `<document.path>.<ext>` (for example: `pages/about.md`).
- `<ext>` is always `md` or `mdx` and is sourced from `documents.content_format`.
- The file body stores the mutable head markdown/MDX content from `documents.body`.
- Frontmatter stores schema fields only (no transport metadata such as revision/version tokens).
- Transport metadata (`document_id`, `format`, `draftRevision`, `publishedVersion`, content hash) lives only in `.mdcms/manifests/<project>.<environment>.json`.
- `cms pull` must delete stale local paths when server-side `path`, `locale`, or `content_format` changes (or soft-delete) are detected.

### `cms push`

- Uploads only changed manifest-tracked `.md`/`.mdx` files to the CMS server as draft updates (publish is explicit and separate).
- `cms push` derives `content_format` from file extension (`.md` => `md`, `.mdx` => `mdx`) and rejects unsupported extensions with a deterministic error.
- For known documents, identity is resolved from manifest `document_id`; file path is treated as mutable state that can rename/move without changing document identity.
- Sends the base draft revision token and latest published version (from the manifest) with each document.
- Change detection is hash-based against `.mdcms/manifests/<project>.<environment>.json`; unchanged documents are skipped and not sent.
- If a manifest entry has a missing/empty hash, that document is treated as changed and the hash is repaired on successful push.
- **Schema hash requirement:** Before sending any content write request, `cms push` reads the schema hash from `.mdcms/schema/<project>.<environment>.json` (see SPEC-004 "Local Schema State File"). If the file does not exist, push fails immediately: `"No synced schema found for <project>/<environment>. Run 'cms schema sync' before pushing."` (exit code 1). The hash is sent as `x-mdcms-schema-hash` on every `POST` and `PUT` content request.
- **Schema mismatch handling:** If the server returns `SCHEMA_HASH_MISMATCH` (`409`) for a document, that document is reported as failed with reason code `schema_hash_mismatch`. Other documents in the same push run continue (partial success). The exit summary directs the developer to run `cms schema sync` before retrying.
- **Draft optimistic concurrency:** If the server's current `draft_revision` differs from the base draft revision in the manifest, the push is **rejected** for that document with reason code `stale_draft_revision`. The developer must `cms pull` first, then re-apply their changes.
- On success, the server updates `documents`, increments `draft_revision`, and does not create new `document_versions` rows.
- Optional `--validate` flag runs schema validation locally before pushing.

### `cms schema sync`

`cms schema sync` synchronizes the current `mdcms.config.ts` schema to the server for a specific `(project, environment)` target.

- Parses `mdcms.config.ts` and resolves per-environment overlays.
- Builds schema payload (types + fields, excluding MDX component registrations and prop metadata).
- Uploads raw schema snapshot + resolved environment schema via `PUT /api/v1/schema`.
- Validates schema compatibility at sync time; incompatibilities produce actionable error output.
- Does not mutate content rows.
- On success, persists the server-returned `schemaHash` to `.mdcms/schema/<project>.<environment>.json` using atomic file writes (see SPEC-004 "Local Schema State File"). This file is read by `cms push` and future SDK write methods to satisfy the `x-mdcms-schema-hash` write gate.
- Supports `--project` and `--environment` overrides; defaults from config.

### `cms migrate`

Handles content migrations when the schema changes (e.g., a new required field is added):

1. `cms migrate` — Detects schema differences between the current config and the server's stored schema. Generates a migration file in the project's `migrations/` directory.
2. The migration file contains a function that receives each document individually and returns the migrated version. This allows per-document logic (not just a global default).
3. Developer reviews and optionally edits the migration file.
4. `cms migrate --apply` — Runs the migration, updates drafts, and auto-publishes migrated results (new version rows for affected documents).
5. Migration execution remains self-contained in MVP; external webhook fan-out is deferred to the Post-MVP webhook system.

**Example migration file:**

```typescript
// migrations/20260212_add_author_field.ts
import type { Migration } from "@mdcms/cli";

export const migration: Migration = {
  type: "BlogPost",
  description: "Add required author field to BlogPost",
  up: (document) => ({
    ...document,
    frontmatter: {
      ...document.frontmatter,
      // Custom logic per document — not a single global default
      author: inferAuthorFromContent(document.body) ?? "default-author-id",
    },
  }),
};
```

### Authentication

- `cms login` starts a browser-based authorization code flow via `/api/v1/auth/cli/login/*`.
- CLI starts a local loopback callback listener (`127.0.0.1`) and exchanges a one-time code for an API key scoped to `(serverUrl, project, environment)`.
- The credential store is keyed by server URL, project, and environment and supports one active profile per tuple.
- In interactive mode, credentials are stored in the OS credential store when available (fallback to `~/.mdcms/credentials.json` with `0600` permissions).
- Login-generated API keys default to scopes: `content:read`, `content:read:draft`, `content:write`.
- CLI auth precedence is: `--api-key` > `MDCMS_API_KEY` > stored profile.
- `cms logout` always clears the local profile for the current tuple and performs best-effort remote self-revoke of the active API key.

### Action Runner and Alias Resolution

- `cms action list` reads the backend action catalog and shows only actions visible to the caller.
- `cms action run <actionId>` resolves request/response schema refs, validates input, and executes the backend action endpoint.
- Module-provided aliases are compile-time local mappings (`alias` -> `actionId`), not remotely downloaded code.
- Output formatters are optional and keyed by `actionId` or response schema; formatter failures fall back to raw JSON output.
- Preflight hooks run before execution for local checks (config/target/auth presence) and cannot bypass backend authorization.

---
