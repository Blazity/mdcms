# Mintlify Documentation Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a comprehensive Mintlify documentation site for MDCMS as `apps/docs` in the monorepo, with ~50 pages of thorough, component-rich documentation.

**Architecture:** Standalone Mintlify app in the monorepo's `apps/` directory. Fresh rewrite using the existing MVP at `~/dev/mintlify-docs/` as topic reference, enriched with data from SPEC-001 through SPEC-012 and the actual codebase. Design system from `/Users/blazity/dev/mdcms-web/DESIGN_SYSTEM.md` applied to docs.json config.

**Tech Stack:** Mintlify, MDX

**Source Material Locations:**
- Specs: `/docs/specs/SPEC-001` through `SPEC-012`
- MVP reference: `/Users/blazity/dev/mintlify-docs/`
- Design system: `/Users/blazity/dev/mdcms-web/DESIGN_SYSTEM.md`
- Server routes: `apps/server/src/lib/content-api/routes.ts`, `apps/server/src/lib/auth.ts`
- Shared types: `packages/shared/src/lib/contracts/`
- SDK source: `packages/sdk/src/lib/sdk.ts`
- CLI source: `apps/cli/src/`

**Content Quality Bar:** Each page must be thorough enough that a developer can accomplish the described task without consulting any other resource. No thin placeholder pages. Every API endpoint needs full request/response examples. Every guide needs step-by-step instructions with real commands. Every architecture page needs diagrams and rationale.

---

## Task 1: Scaffold Project Structure & Config

**Files:**
- Create: `apps/docs/docs.json`
- Create: `apps/docs/.mintignore`
- Create: `apps/docs/favicon.svg`
- Create: `apps/docs/logo/light.svg`
- Create: `apps/docs/logo/dark.svg`

- [ ] **Step 1: Create apps/docs directory structure**

Create all directories needed:

```
apps/docs/
├── logo/
├── images/
├── guide/
│   ├── studio/
│   ├── cli/
│   └── schema/
├── architecture/
├── api-reference/
│   ├── content/
│   ├── schema/
│   ├── media/
│   ├── webhooks/
│   └── sdk/
└── development/
    └── packages/
```

- [ ] **Step 2: Create docs.json**

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "maple",
  "name": "MDCMS",
  "description": "Open-source headless CMS for Markdown and MDX content",
  "colors": {
    "primary": "#2F49E5",
    "light": "#4D65FF",
    "dark": "#1C1B1B"
  },
  "background": {
    "color": {
      "light": "#FCF9F8",
      "dark": "#1C1B1B"
    }
  },
  "fonts": {
    "heading": {
      "family": "Space Grotesk",
      "weight": 700
    },
    "body": {
      "family": "Inter",
      "weight": 400
    }
  },
  "appearance": {
    "default": "system"
  },
  "icons": {
    "library": "lucide"
  },
  "favicon": "/favicon.svg",
  "logo": {
    "light": "/logo/light.svg",
    "dark": "/logo/dark.svg",
    "href": "https://github.com/Blazity/mdcms"
  },
  "navbar": {
    "primary": {
      "type": "button",
      "label": "Get Started",
      "href": "/development/local-setup"
    }
  },
  "footer": {
    "socials": {
      "github": "https://github.com/Blazity/mdcms"
    }
  },
  "navigation": {
    "tabs": [
      {
        "tab": "Guide",
        "groups": [
          {
            "group": "Introduction",
            "pages": ["index", "guide/concepts"]
          },
          {
            "group": "Studio",
            "pages": [
              "guide/studio/dashboard",
              "guide/studio/content-editor",
              "guide/studio/publishing",
              "guide/studio/version-history",
              "guide/studio/localization",
              "guide/studio/settings"
            ]
          },
          {
            "group": "CLI",
            "pages": [
              "guide/cli/installation",
              "guide/cli/commands",
              "guide/cli/configuration",
              "guide/cli/ci-cd"
            ]
          },
          {
            "group": "Schema",
            "pages": [
              "guide/schema/defining-types",
              "guide/schema/field-types",
              "guide/schema/modifiers-and-validation",
              "guide/schema/references",
              "guide/schema/environment-overlays",
              "guide/schema/mdx-components"
            ]
          }
        ]
      },
      {
        "tab": "Architecture",
        "groups": [
          {
            "group": "System Design",
            "pages": [
              "architecture/overview",
              "architecture/technology-stack",
              "architecture/module-system",
              "architecture/multi-tenancy"
            ]
          },
          {
            "group": "Data Layer",
            "pages": [
              "architecture/data-model",
              "architecture/content-lifecycle",
              "architecture/localization-model",
              "architecture/migrations"
            ]
          },
          {
            "group": "API Layer",
            "pages": [
              "architecture/request-flow",
              "architecture/auth",
              "architecture/scopes-and-permissions"
            ]
          }
        ]
      },
      {
        "tab": "API Reference",
        "groups": [
          {
            "group": "Getting Started",
            "pages": [
              "api-reference/overview",
              "api-reference/authentication",
              "api-reference/errors"
            ]
          },
          {
            "group": "Content API",
            "pages": [
              "api-reference/content/list",
              "api-reference/content/get",
              "api-reference/content/create",
              "api-reference/content/update",
              "api-reference/content/publish",
              "api-reference/content/versions",
              "api-reference/content/delete",
              "api-reference/content/overview-stats"
            ]
          },
          {
            "group": "Schema API",
            "pages": [
              "api-reference/schema/list",
              "api-reference/schema/get",
              "api-reference/schema/sync"
            ]
          },
          {
            "group": "Media API",
            "pages": [
              "api-reference/media/upload",
              "api-reference/media/delete"
            ]
          },
          {
            "group": "Webhooks API",
            "pages": [
              "api-reference/webhooks/list",
              "api-reference/webhooks/create",
              "api-reference/webhooks/update",
              "api-reference/webhooks/delete"
            ]
          },
          {
            "group": "SDK",
            "pages": [
              "api-reference/sdk/installation",
              "api-reference/sdk/client-setup",
              "api-reference/sdk/querying",
              "api-reference/sdk/error-handling",
              "api-reference/sdk/nextjs"
            ]
          }
        ]
      },
      {
        "tab": "Development",
        "groups": [
          {
            "group": "Getting Started",
            "pages": [
              "development/prerequisites",
              "development/local-setup",
              "development/environment-variables"
            ]
          },
          {
            "group": "Monorepo",
            "pages": [
              "development/packages/overview",
              "development/packages/server",
              "development/packages/cli",
              "development/packages/studio",
              "development/packages/sdk",
              "development/packages/shared",
              "development/packages/modules"
            ]
          },
          {
            "group": "Contributing",
            "pages": [
              "development/workflow",
              "development/code-conventions",
              "development/testing",
              "development/database-migrations"
            ]
          }
        ]
      }
    ],
    "global": {
      "anchors": [
        {
          "anchor": "GitHub",
          "href": "https://github.com/Blazity/mdcms",
          "icon": "github"
        }
      ]
    }
  }
}
```

- [ ] **Step 3: Copy assets from MVP**

Copy these SVG files from `/Users/blazity/dev/mintlify-docs/`:
- `favicon.svg` → `apps/docs/favicon.svg`
- `logo/light.svg` → `apps/docs/logo/light.svg`
- `logo/dark.svg` → `apps/docs/logo/dark.svg`

- [ ] **Step 4: Create .mintignore**

```
.git
.github
.claude
.agents
.idea
node_modules
README.md
LICENSE.md
CHANGELOG.md
CONTRIBUTING.md
drafts/
*.draft.mdx
```

- [ ] **Step 5: Commit scaffold**

```bash
git add apps/docs/
git commit -m "docs(docs): scaffold mintlify documentation app"
```

---

## Task 2: Guide — Introduction Pages

**Files:**
- Create: `apps/docs/index.mdx`
- Create: `apps/docs/guide/concepts.mdx`

**Source references:** SPEC-001 (platform overview), SPEC-004 (schema), SPEC-005 (auth/RBAC), SPEC-009 (i18n/environments), MVP `index.mdx` and `guide/concepts.mdx`

- [ ] **Step 1: Write index.mdx (Welcome page)**

The welcome page is the first thing users see. It should:

**Frontmatter:**
```yaml
title: "MDCMS"
description: "Open-source headless CMS for Markdown and MDX content"
```

**Content structure:**
1. Opening paragraph: MDCMS is an open-source, headless CMS for teams managing structured Markdown and MDX content. Database is the source of truth — content files are synced via CLI, not committed to git.
2. Key differentiators (use `<Card>` grid in `<Columns cols={3}>`):
   - **Schema-First** — Content types defined in TypeScript with Zod validation. Schema drives the entire editing experience.
   - **Visual Studio** — Embeddable React component (`<Studio />`) with TipTap-based MDX editor, frontmatter editing, and version history.
   - **CLI-Powered Sync** — `mdcms push`/`mdcms pull` sync content between local filesystem and CMS. CI/CD friendly.
   - **Multi-Environment** — Isolated content per environment (development, staging, production). Clone and promote between environments.
   - **Localization** — Built-in i18n with translation groups linking locale variants. Per-type localization control.
   - **Extensible** — Module system for custom server actions, CLI commands, and Studio UI surfaces.
3. "Get Started" section with three path cards:
   - **I want to use MDCMS** → guide/concepts (learn core concepts first)
   - **I want to integrate the API** → api-reference/overview
   - **I want to contribute** → development/local-setup
4. Quick start code example showing `mdcms.config.ts` with `defineConfig` and a simple `BlogPost` type

- [ ] **Step 2: Write guide/concepts.mdx (Key Concepts)**

This is the foundational concepts page. Must be thorough — a reader should understand all MDCMS terminology after this page.

**Frontmatter:**
```yaml
title: "Key Concepts"
description: "Core terminology and mental model for MDCMS"
```

**Content structure:**

1. **Projects** — Top-level tenant. Each project has its own content, schema, environments, users. Slugified identifier (e.g., `marketing-site`). MDCMS supports multiple projects in a single instance.

2. **Environments** — Isolated content spaces within a project. Examples: development, staging, production. Each environment has its own documents, can have schema overlays. `production` is created automatically. Documents and versions are fully isolated per environment.

3. **Content Types (Schema)** — Defined in `mdcms.config.ts` using `defineType()` with Zod validation. Include a real example:
   ```typescript
   import { defineType, reference } from "@mdcms/shared";
   import { z } from "zod";
   
   export const BlogPost = defineType("BlogPost", {
     directory: "blog",
     localized: true,
     fields: {
       title: z.string().min(1).max(200),
       slug: z.string().regex(/^[a-z0-9-]+$/),
       author: reference("Author"),
       publishedAt: z.coerce.date(),
       tags: z.array(z.string()).default([]),
       excerpt: z.string().max(300).optional(),
     },
   });
   ```
   Schema is synced to the server via `mdcms schema sync`. The Studio UI generates editing forms from the schema. The server validates all writes against it.

4. **Documents** — An instance of a content type. Key properties (use a table):
   - `documentId` — Stable UUID (true identity, survives renames/moves)
   - `translationGroupId` — Links locale variants of the same logical document
   - `path` — Mutable filesystem-like path (e.g., `blog/hello-world`)
   - `locale` — BCP 47 tag (e.g., `en-US`, `fr`) or `__mdcms_default__` for non-localized
   - `format` — `md` or `mdx`
   - `frontmatter` — Structured data matching the schema fields
   - `body` — Markdown/MDX content

5. **Draft/Publish Workflow** — Use `<Steps>`:
   1. **Create** — New document starts as a draft
   2. **Edit** — Auto-saved changes update the mutable head. `draftRevision` increments on each save. No version history for drafts.
   3. **Publish** — Creates an immutable `documentVersions` row with version number and optional change summary
   4. **Continue Editing** — Published document can be edited further. Creates new drafts on top of the published version.
   5. **Re-publish** — New publish creates a new version snapshot. Full version history preserved.

6. **Localization** — Documents with `localized: true` types have independent locale variants linked by `translationGroupId`. Each variant has its own path, body, frontmatter, version history. The Studio shows a locale switcher for localized types. The SDK accepts a `locale` parameter for queries. If `locales` config is omitted, MDCMS operates in implicit single-locale mode.

7. **References** — Fields can reference other content types using `reference("TypeName")`. Stored as `documentId` UUIDs in frontmatter. Resolved at query time via the `resolve` parameter (shallow — one level deep). Unresolved references return `null` with error details in `resolveErrors`.

8. **API Keys** — Scoped access tokens for programmatic use. Properties: label, scopes (e.g., `content:read`, `content:publish`), contextAllowlist (restrict to specific project/environment pairs), expiration. Prefix: `mdcms_key_`. Use table for the 17 available scopes.

9. **RBAC Roles** — Four roles with escalating permissions. Use a matrix table:
   - **viewer** — content:read, schema:read, projects:read
   - **editor** — viewer + draft read, content write/publish/delete
   - **admin** — editor + schema:write, projects:write, user:manage, settings:manage
   - **owner** — admin at global scope

10. **Architecture at a Glance** — Mermaid diagram:
    ```
    Your Application (Next.js, Remix, etc.)
      ├── @mdcms/sdk (API client)
      └── @mdcms/studio (<Studio /> component)
              ↓
    MDCMS Server (Elysia/Bun)
      ├── PostgreSQL (content, schema, auth)
      ├── Redis (sessions, cache)
      └── S3 (media files)
    ```

- [ ] **Step 3: Commit**

```bash
git add apps/docs/index.mdx apps/docs/guide/concepts.mdx
git commit -m "docs(docs): add introduction and key concepts pages"
```

---

## Task 3: Guide — Studio Pages

**Files:**
- Create: `apps/docs/guide/studio/dashboard.mdx`
- Create: `apps/docs/guide/studio/content-editor.mdx`
- Create: `apps/docs/guide/studio/publishing.mdx`
- Create: `apps/docs/guide/studio/version-history.mdx`
- Create: `apps/docs/guide/studio/localization.mdx`
- Create: `apps/docs/guide/studio/settings.mdx`

**Source references:** SPEC-006 (Studio runtime and UI), SPEC-007 (editor/MDX), MVP `guide/studio.mdx`

- [ ] **Step 1: Write guide/studio/dashboard.mdx**

**Frontmatter:** `title: "Dashboard"`, `description: "Studio dashboard overview, stats, and navigation"`

**Content:**
1. How to embed Studio — `<Studio />` React component in a Next.js catch-all route (`app/admin/[[...path]]/page.tsx`). Include complete code example.
2. Dashboard features at `/admin`:
   - Stats cards: total documents, published, drafts, content types
   - Content type summary cards (gated by read permissions)
   - Recently updated documents list
   - Quick action buttons (Create, Schema Browser)
3. Navigation structure: sidebar with schema-first content browsing (by type), secondary folder-path view
4. Environment awareness: current environment shown in UI, environment-specific field badges
5. `<Note>`: Studio fetches a bootstrap manifest from the server on load. If the server is unreachable, Studio shows an actionable error.

- [ ] **Step 2: Write guide/studio/content-editor.mdx**

**Frontmatter:** `title: "Content Editor"`, `description: "Creating and editing documents in the Studio"`

**Content:**
1. **Browsing content** — Paginated table per content type at `/admin/content/:type`. Columns: Path/Title, Status (draft/published/deleted), Author, Last Updated. Sortable, filterable, server-side search.
2. **Creating a document** — Use `<Steps>`:
   1. Navigate to content type
   2. Click Create
   3. Fill frontmatter fields (auto-generated from schema)
   4. Write body content in the TipTap editor
   5. Save (auto-saves after ~5s or on blur)
3. **Editor layout** — Two-panel interface:
   - Left: Body editor (TipTap-based Markdown/MDX)
   - Right sidebar with tabs: Info (read-only metadata), Properties (schema-driven frontmatter form), History
4. **Frontmatter editing** — Schema fields mapped to form controls:
   - `string` → text input
   - `number` → number input
   - `boolean` → toggle
   - `enum` → dropdown
   - `date` → date picker
   - `string[]` → tag input
   - `reference()` → document picker
   - Unsupported types show "Not editable yet" (data preserved)
5. **MDX components** — Slash command (`/`) or toolbar button to insert registered components. Component catalog shows available components. Props form (auto-generated or custom editor) appears on insertion.
6. **Auto-save** — Debounced ~5s after change or on blur. Status indicator: unsaved/saving/saved. Increments `draftRevision`. No version history for auto-saves.
7. `<Warning>`: Environment-specific fields are shown with badges. These fields only exist in certain environments due to schema overlays.

- [ ] **Step 3: Write guide/studio/publishing.mdx**

**Frontmatter:** `title: "Publishing"`, `description: "Draft/publish workflow and version management"`

**Content:**
1. **Publishing a document** — Use `<Steps>`:
   1. Edit document until ready
   2. Click Publish button
   3. Optionally add a change summary
   4. Confirm publish
   5. An immutable version snapshot is created
2. **What happens on publish** — Creates a row in `documentVersions` with: version number, published content snapshot, timestamp, publisher, change summary. The `publishedVersion` field on the document head updates.
3. **Unpublishing** — Removes the published version reference. Document reverts to draft-only state. Version history is preserved.
4. **Restore** — Soft-deleted documents can be restored. Previous versions can be restored (creates a new draft from the version snapshot).
5. **Duplicate** — Creates a copy with auto-generated path suffix.
6. `<Tip>`: Change summaries are optional but highly recommended — they make version history much more useful for teams.

- [ ] **Step 4: Write guide/studio/version-history.mdx**

**Frontmatter:** `title: "Version History"`, `description: "Viewing and restoring published versions"`

**Content:**
1. Where to find version history — Right sidebar History tab in the document editor
2. Version list — Each published version shows: version number, timestamp, publisher, change summary
3. Diff viewer — Compare any two versions to see what changed
4. Restoring a version — Select a version and click Restore. This creates a new draft from that version's snapshot. The original version remains intact.
5. `<Note>`: Version history only tracks published snapshots, not every auto-save. To preserve a state, publish it.

- [ ] **Step 5: Write guide/studio/localization.mdx**

**Frontmatter:** `title: "Localization"`, `description: "Managing multilingual content in the Studio"`

**Content:**
1. **When localization applies** — Only for content types with `localized: true` in their schema definition
2. **Locale switcher** — Dropdown in the document editor showing:
   - Existing locale variants (with links)
   - Supported locales without variants (with "Create" option)
3. **Creating a translation** — Click on an untranslated locale to create a new variant. Option to prefill from the default locale's content.
4. **Translation independence** — Each locale variant is an independent document with its own path, body, frontmatter, and version history. Changes to one locale don't affect others.
5. **Content list view** — Shows translation status (e.g., "2/4 locales translated") for localized types
6. **Locale configuration** — Controlled by `locales` config in `mdcms.config.ts`:
   ```typescript
   locales: {
     default: "en",
     supported: ["en", "fr", "de", "ja"],
     aliases: { "en-US": "en" }
   }
   ```
7. `<Note>`: Non-localized types use an internal `__mdcms_default__` locale. The locale switcher doesn't appear for these types.

- [ ] **Step 6: Write guide/studio/settings.mdx**

**Frontmatter:** `title: "Settings"`, `description: "Managing API keys, webhooks, users, and Studio configuration"`

**Content:**
1. **API Keys** — Create, list, revoke API keys. Each key has: label, scopes (multi-select from 17 available scopes), context allowlist (project/environment restrictions), expiration date. Key prefix: `mdcms_key_`. Full key shown only once on creation.
2. **Users & Roles** — List users, invite new users (by email), update RBAC grants, remove users. Roles: viewer, editor, admin, owner. Include capability matrix table.
3. **Webhooks** (post-MVP) — Configure webhook endpoints for events like `content.published`, `content.updated`. Each webhook has: URL, event filter, secret (for HMAC signing), active toggle.
4. **Media** (post-MVP) — Media library for uploaded files.
5. **Schema Browser** — Read-only view of synced content types. Navigate to `/admin/schema` to see all types with their field definitions, validation rules, and reference relationships.
6. `<Warning>`: Settings access requires admin or owner role. The Settings menu item is hidden for viewers and editors.

- [ ] **Step 7: Commit**

```bash
git add apps/docs/guide/studio/
git commit -m "docs(docs): add studio guide pages"
```

---

## Task 4: Guide — CLI Pages

**Files:**
- Create: `apps/docs/guide/cli/installation.mdx`
- Create: `apps/docs/guide/cli/commands.mdx`
- Create: `apps/docs/guide/cli/configuration.mdx`
- Create: `apps/docs/guide/cli/ci-cd.mdx`

**Source references:** SPEC-008 (CLI and SDK), MVP `guide/cli.mdx`, CLI source at `apps/cli/src/`

- [ ] **Step 1: Write guide/cli/installation.mdx**

**Frontmatter:** `title: "Installation"`, `description: "Installing and setting up the MDCMS CLI"`

**Content:**
1. **Install** — Use `<CodeGroup>` with bun/npm/pnpm tabs:
   ```bash
   bun add -D @mdcms/cli
   npm install --save-dev @mdcms/cli
   ```
2. **Binary name** — `mdcms` (available via `npx mdcms` or `bunx mdcms`)
3. **Prerequisites** — Bun 1.3.11+ or Node.js 20+
4. **First-time setup** — Use `<Steps>`:
   1. `mdcms init` — Interactive wizard walks through setup
   2. Enter server URL (health check validates it)
   3. Choose project and environment
   4. Authenticate via browser (device flow)
   5. Auto-detect content directories and locale hints
   6. Generate `mdcms.config.ts`
   7. Run initial schema sync and content push
5. **Global options** — Table with all 5 global flags: `--project`, `--environment`, `--api-key`, `--server-url`, `--config`
6. **Resolution order** — CLI flags → environment variables → `mdcms.config.ts` → stored credentials

- [ ] **Step 2: Write guide/cli/commands.mdx**

**Frontmatter:** `title: "Commands"`, `description: "Complete reference for all MDCMS CLI commands"`

**Content — each command gets its own section with examples:**

1. **`mdcms init`** — Interactive setup wizard. Detailed 13-step flow from SPEC-008:
   - Server URL → Project selection → OAuth login → Environment → Directory scanning → Schema inference → Config generation → Schema sync → Initial push → .gitignore update

2. **`mdcms login`** — Browser-based device flow. Use `<Steps>`:
   1. CLI sends challenge to server
   2. Opens browser for user to authenticate
   3. Exchanges authorization code for API key
   4. Stores credentials locally
   - Credential store: OS keychain or `~/.mdcms/credentials.json` (0600 permissions)
   - Auth precedence: `--api-key` flag → `MDCMS_API_KEY` env var → stored profile

3. **`mdcms logout`** — Revokes stored API key on server, clears local credentials

4. **`mdcms push`** — Upload local changes to CMS
   - Flags: `--force` (skip confirmation), `--dry-run` (preview only), `--published` (include published state)
   - Change detection: hash-based comparison against manifest
   - Plan-first: prints summary before writing. Confirmation required for destructive changes.
   - New file detection: scans `contentDirectories` for untracked files
   - Requires schema hash from last `mdcms schema sync`
   - Optimistic concurrency: rejects if server `draftRevision` differs from manifest

5. **`mdcms pull`** — Download content from server
   - Flags: `--published`, `--force`, `--dry-run`
   - Change categories (use table): Both Modified (confirm), Server Modified, Locally Modified (skip), New, Moved/Renamed, Server Deleted (confirm), Unknown Type (skip), Unchanged

6. **`mdcms schema sync`** — Sync schema definitions to server
   - Parses `mdcms.config.ts`, resolves per-environment overlays
   - Uploads raw snapshot + resolved schema
   - Persists `schemaHash` to `.mdcms/schema/<project>.<environment>.json`
   - Supports `--project`/`--environment` overrides

7. **`mdcms status`** — Compare local vs server state
   - Reports content drift categories and schema drift
   - Exit code 1 if drift detected, 0 if in sync (useful for CI)

8. **`mdcms migrate`** — Generate and apply schema migrations (with `--apply` flag)

- [ ] **Step 3: Write guide/cli/configuration.mdx**

**Frontmatter:** `title: "Configuration"`, `description: "mdcms.config.ts and manifest file reference"`

**Content:**
1. **Config file** — `mdcms.config.ts` at project root. Complete example with all options:
   ```typescript
   import { defineConfig, defineType, reference } from "@mdcms/shared";
   import { z } from "zod";

   const Author = defineType("Author", {
     directory: "authors",
     fields: {
       name: z.string().min(1),
       bio: z.string().optional(),
       avatar: z.string().url().optional(),
     },
   });

   const BlogPost = defineType("BlogPost", {
     directory: "blog",
     localized: true,
     fields: {
       title: z.string().min(1).max(200),
       slug: z.string().regex(/^[a-z0-9-]+$/),
       author: reference("Author"),
       publishedAt: z.coerce.date(),
       tags: z.array(z.string()).default([]),
       excerpt: z.string().max(300).optional(),
       featured: z.boolean().default(false),
     },
   });

   export default defineConfig({
     project: "marketing-site",
     serverUrl: "http://localhost:4000",
     environment: "production",
     contentDirectories: ["content"],
     locales: {
       default: "en",
       supported: ["en", "fr", "de"],
       aliases: { "en-US": "en" },
     },
     types: [Author, BlogPost],
     environments: {
       staging: {
         extends: "production",
         types: {
           BlogPost: {
             add: { previewToken: z.string().optional() },
           },
         },
       },
     },
   });
   ```
2. **Config options** — Table with every `defineConfig` property: project, serverUrl, environment, contentDirectories, locales, types, environments, components
3. **Manifest file** — `.mdcms.manifest.json` tracks sync state. Structure:
   ```json
   {
     "documents": {
       "<documentId>": {
         "path": "blog/hello-world",
         "format": "mdx",
         "draftRevision": 3,
         "publishedVersion": 1,
         "hash": "<sha256>"
       }
     }
   }
   ```
   `.gitignore`d — local to each developer.
4. **Local schema state** — `.mdcms/schema/<project>.<environment>.json` stores the schema hash from last sync. Required for write operations.
5. **Local file mapping** — How documents map to local files:
   - Localized: `<directory>/<document.path>.<locale>.<ext>` (e.g., `content/blog/hello-world.fr.mdx`)
   - Non-localized: `<directory>/<document.path>.<ext>` (e.g., `content/authors/john-doe.md`)

- [ ] **Step 4: Write guide/cli/ci-cd.mdx**

**Frontmatter:** `title: "CI/CD Integration"`, `description: "Automating content sync and schema deployment in CI/CD pipelines"`

**Content:**
1. **Environment variables for headless auth** — Table:
   - `MDCMS_API_KEY` — API key with required scopes
   - `MDCMS_PROJECT` — Project slug
   - `MDCMS_ENVIRONMENT` — Environment name
   - `MDCMS_SERVER_URL` — Server URL
2. **GitHub Actions example** — Complete workflow file using `<CodeGroup>`:
   ```yaml
   # Schema sync on push to main
   name: Sync Schema
   on:
     push:
       branches: [main]
       paths: ['mdcms.config.ts']
   jobs:
     sync:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: oven-sh/setup-bun@v2
         - run: bun install
         - run: bunx mdcms schema sync
           env:
             MDCMS_API_KEY: ${{ secrets.MDCMS_API_KEY }}
             MDCMS_PROJECT: marketing-site
             MDCMS_ENVIRONMENT: production
             MDCMS_SERVER_URL: ${{ secrets.MDCMS_SERVER_URL }}
   ```
3. **Content push workflow** — Similar example for `mdcms push --force`
4. **Status check** — Using `mdcms status` exit code for CI gates
5. **Schema drift detection** — Preventing deploys when schema is out of sync
6. `<Tip>`: Create a dedicated API key with minimal scopes for CI/CD. For schema sync, you need `schema:read` + `schema:write`. For content push, you need `content:write` + `content:write:draft`.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/guide/cli/
git commit -m "docs(docs): add CLI guide pages"
```

---

## Task 5: Guide — Schema Pages

**Files:**
- Create: `apps/docs/guide/schema/defining-types.mdx`
- Create: `apps/docs/guide/schema/field-types.mdx`
- Create: `apps/docs/guide/schema/modifiers-and-validation.mdx`
- Create: `apps/docs/guide/schema/references.mdx`
- Create: `apps/docs/guide/schema/environment-overlays.mdx`
- Create: `apps/docs/guide/schema/mdx-components.mdx`

**Source references:** SPEC-004 (schema system), MVP `guide/schema.mdx`, `packages/shared/src/lib/contracts/config.ts`

- [ ] **Step 1: Write guide/schema/defining-types.mdx**

**Frontmatter:** `title: "Defining Content Types"`, `description: "How to define content types using defineType and Zod schemas"`

**Content:**
1. **Schema philosophy** — Code-first. Developers define types in `mdcms.config.ts`. No manual schema editor in Studio. Schema drives form generation, validation, and API behavior.
2. **Basic syntax** — `defineType(name, definition)`:
   ```typescript
   import { defineType } from "@mdcms/shared";
   import { z } from "zod";

   export const Page = defineType("Page", {
     directory: "pages",
     fields: {
       title: z.string().min(1),
       description: z.string().optional(),
     },
   });
   ```
3. **Type options** — Table:
   - `directory` (string) — Filesystem directory for this type's content files. Required.
   - `localized` (boolean) — Enable per-locale variants. Default: `false`.
   - `fields` (Record<string, ZodSchema>) — Field definitions using Zod schemas.
4. **Registering types** — Add to the `types` array in `defineConfig()`. Then sync: `mdcms schema sync`.
5. **Schema sync flow** — What happens when you sync: CLI parses config → resolves environment overlays → uploads to server → server validates → stores in schema registry → returns hash.
6. **Schema hash** — Write operations require `x-mdcms-schema-hash` header. The CLI and SDK handle this automatically. Mismatched hash → `SCHEMA_HASH_MISMATCH` error (forces re-sync).
7. `<Warning>`: Changing a type name or removing a type after content exists requires a migration. Use `mdcms migrate` to handle schema evolution.

- [ ] **Step 2: Write guide/schema/field-types.mdx**

**Frontmatter:** `title: "Field Types"`, `description: "Primitive and complex field types available in content schemas"`

**Content — each type gets its own subsection with code example and Studio form mapping:**

1. **Primitive types:**
   - `z.string()` → text input
   - `z.number()` → number input
   - `z.boolean()` → toggle switch
   - `z.coerce.date()` → date picker

2. **Complex types:**
   - `z.array(z.string())` → tag input
   - `z.array(z.number())` → repeatable number inputs
   - `z.object({ ... })` → nested fieldset
   - `z.enum(["draft", "published", "archived"])` → dropdown select
   - `z.literal("fixed-value")` → hidden/read-only field

3. **Each type entry should include:**
   - TypeScript definition
   - What it looks like in the Studio editor
   - Example frontmatter value
   - Validation behavior

4. Use `<AccordionGroup>` for detailed notes on each type.

- [ ] **Step 3: Write guide/schema/modifiers-and-validation.mdx**

**Frontmatter:** `title: "Modifiers & Validation"`, `description: "Optional fields, defaults, nullable, and Zod validation chains"`

**Content:**
1. **Optional** — `z.string().optional()` — field can be omitted. Schema registry marks `required: false`.
2. **Nullable** — `z.string().nullable()` — field can be explicitly `null`.
3. **Default** — `z.boolean().default(false)` — default value when field is not provided. Schema registry stores `default` value.
4. **Validation chains** — Zod methods work:
   ```typescript
   title: z.string().min(1).max(200),
   slug: z.string().regex(/^[a-z0-9-]+$/),
   email: z.string().email(),
   rating: z.number().int().min(1).max(5),
   url: z.string().url(),
   ```
5. **How validation works** — Server validates frontmatter against schema on every write. Studio validates in real-time during editing. CLI validates before push.
6. **Schema registry representation** — How modifiers appear in the registry: `required`, `nullable`, `default`, `checks` array.
7. `<Tip>`: Use `.describe("Human-readable label")` on fields to customize the label shown in Studio forms.

- [ ] **Step 4: Write guide/schema/references.mdx**

**Frontmatter:** `title: "References"`, `description: "Cross-type field references and resolution"`

**Content:**
1. **Defining a reference** — `reference("TypeName")`:
   ```typescript
   const BlogPost = defineType("BlogPost", {
     fields: {
       author: reference("Author"),
       relatedPosts: z.array(reference("BlogPost")).optional(),
     },
   });
   ```
2. **What's stored** — The referenced document's `documentId` (UUID) is stored in frontmatter. Not the path or slug.
3. **Resolution** — Use the `resolve` query parameter to expand references at read time:
   ```typescript
   const post = await client.get("BlogPost", {
     slug: "hello-world",
     resolve: ["author"],
   });
   // post.frontmatter.author is now the full Author document, not just an ID
   ```
4. **Shallow resolution** — References are resolved one level deep only. Nested references within resolved documents are not expanded.
5. **Resolve errors** — If a reference can't be resolved, it returns `null` with an error in `resolveErrors`:
   - `REFERENCE_NOT_FOUND` — Target document doesn't exist
   - `REFERENCE_DELETED` — Target document was soft-deleted
   - `REFERENCE_TYPE_MISMATCH` — Target document's type doesn't match the reference definition
   - `REFERENCE_FORBIDDEN` — Caller lacks permission to read the referenced document
6. **Studio editing** — Reference fields show a document picker in the form editor. Filter by target type.
7. `<Warning>`: Deleting a document that is referenced by other documents does not cascade. The referencing documents will have resolve errors until the references are updated.

- [ ] **Step 5: Write guide/schema/environment-overlays.mdx**

**Frontmatter:** `title: "Environment Overlays"`, `description: "Per-environment schema customization with add, modify, omit, and extends"`

**Content:**
1. **Why overlays** — Different environments may need different fields. E.g., staging needs a `previewToken` field, production doesn't.
2. **Defining overlays** — In the `environments` section of `defineConfig()`:
   ```typescript
   environments: {
     staging: {
       extends: "production",
       types: {
         BlogPost: {
           add: {
             previewToken: z.string().optional(),
             debugMode: z.boolean().default(false),
           },
           modify: {
             title: z.string().min(1).max(500), // Relaxed max length
           },
           omit: ["seoScore"],
         },
       },
     },
   }
   ```
3. **Operations** — Table:
   - `add` — Add new fields that don't exist in the base type
   - `modify` — Replace a field's schema definition
   - `omit` — Remove fields (array of field names)
   - `extends` — Inherit from another environment's overlay
4. **Inheritance chain** — Overlays can extend other environments. Resolution: base type → extends chain → own overlay. Conflicts: later overlay wins.
5. **Runtime behavior** — Server validates content against the target environment's resolved schema. The Studio shows environment-specific fields with visual badges.
6. `<Note>`: Environment overlays are resolved during `mdcms schema sync`. The server stores the fully resolved schema per environment.

- [ ] **Step 6: Write guide/schema/mdx-components.mdx**

**Frontmatter:** `title: "MDX Components"`, `description: "Registering custom MDX components for use in the Studio editor"`

**Content:**
1. **What MDX components are** — Custom React components that can be inserted into MDX content. The Studio provides a visual editor for component props.
2. **Registration** — In `mdcms.config.ts`:
   ```typescript
   components: [
     {
       name: "Callout",
       description: "A styled callout box",
       props: {
         type: z.enum(["info", "warning", "error"]),
         title: z.string(),
       },
     },
     {
       name: "VideoEmbed",
       description: "Embed a video player",
       props: {
         url: z.string().url(),
         autoplay: z.boolean().default(false),
       },
     },
   ]
   ```
3. **Prop type → form control mapping** — Table mapping Zod types to Studio form controls (same as field types).
4. **Prop hints** — Override auto-detection for specialized controls: `color-picker`, `textarea`, `slider`, `image`, `select`, `hidden`, `json`.
5. **Inserting in editor** — Slash command (`/`) or toolbar button. Component catalog shows all registered components with descriptions.
6. **How components render** — In the editor: component nodes with live preview using the host app's React components. In output: standard MDX syntax (`<Callout type="info" title="Note">...</Callout>`).
7. **Wrapper components** — Components with `children` support nested rich-text editing via content hole.

- [ ] **Step 7: Commit**

```bash
git add apps/docs/guide/schema/
git commit -m "docs(docs): add schema guide pages"
```

---

## Task 6: Architecture Pages

**Files:**
- Create: `apps/docs/architecture/overview.mdx`
- Create: `apps/docs/architecture/technology-stack.mdx`
- Create: `apps/docs/architecture/module-system.mdx`
- Create: `apps/docs/architecture/multi-tenancy.mdx`
- Create: `apps/docs/architecture/data-model.mdx`
- Create: `apps/docs/architecture/content-lifecycle.mdx`
- Create: `apps/docs/architecture/localization-model.mdx`
- Create: `apps/docs/architecture/migrations.mdx`
- Create: `apps/docs/architecture/request-flow.mdx`
- Create: `apps/docs/architecture/auth.mdx`
- Create: `apps/docs/architecture/scopes-and-permissions.mdx`

**Source references:** SPEC-001 through SPEC-005, SPEC-009, MVP architecture pages, actual codebase

- [ ] **Step 1: Write architecture/overview.mdx**

**Frontmatter:** `title: "System Overview"`, `description: "High-level architecture, deployment topology, and design principles"`

**Content:**
1. **Design principles** — Database is source of truth (not filesystem), schema-driven UI, explicit target routing (project + environment on every request), code-first configuration, CQRS-lite pattern.
2. **Deployment topology** — Mermaid diagram showing: Browser/App → MDCMS Server (Elysia/Bun) → PostgreSQL + Redis + S3. Studio UI delivered as backend-served runtime bundle.
3. **Monorepo structure** — Directory tree of apps/ and packages/ with one-line descriptions.
4. **Package dependency graph** — Mermaid diagram showing: all packages depend on `shared`, apps depend on `modules`, `studio` depends on `sdk`.
5. **Key architectural decisions** — Brief list linking to technology-stack page for rationale.

- [ ] **Step 2: Write architecture/technology-stack.mdx**

**Frontmatter:** `title: "Technology Stack"`, `description: "Technologies used in MDCMS and the rationale behind each choice"`

**Content:**
Technology table with rationale for each choice:
- **Bun 1.3+** — Runtime. Fast startup, built-in test runner, native TypeScript support.
- **TypeScript 5.9** — Type safety across the entire stack.
- **Nx 22.5** — Monorepo orchestration. Task caching, dependency graph, parallel execution.
- **Elysia 1.4** — HTTP framework. End-to-end type safety, fast on Bun, plugin system.
- **PostgreSQL 15+** — Primary database. Append-only content versioning, JSONB for frontmatter, full-text search.
- **Drizzle ORM 0.45** — Type-safe SQL. Schema-as-code, migration generation.
- **better-auth 1.5** — Authentication. Session management, OIDC/SAML support, CSRF protection.
- **Redis 7** — Session cache, rate limiting, ephemeral state.
- **S3 (MinIO for dev)** — Media file storage. Any S3-compatible provider.
- **React 19** — Studio UI framework.
- **Next.js 15.2** — Studio host app framework. App Router.
- **TailwindCSS 4.2** — Styling. Utility-first, consistent with design system.
- **TipTap 3.7** — Editor engine. Extensible, ProseMirror-based, custom node types.
- **Radix UI** — Accessible component primitives.
- **Zod 4.3** — Schema validation. Standard Schema interface for interoperability.

- [ ] **Step 3: Write architecture/module-system.mdx**

**Frontmatter:** `title: "Module System"`, `description: "How MDCMS modules extend server, CLI, and Studio functionality"`

**Content:**
1. **Module concept** — Modules extend all three surfaces: server (routes + actions), CLI (commands), Studio (UI surfaces).
2. **Module package structure** — `MdcmsModulePackage` type:
   ```typescript
   type MdcmsModulePackage = {
     server?: {
       mount(app: ElysiaApp, deps: ServerModuleAppDeps): void;
       actions?: ActionCatalogItem[];
     };
     studio?: {
       mount(app: ElysiaApp, deps: unknown): void;
     };
     cli?: {
       commands?: CliCommand[];
     };
   };
   ```
3. **Loading** — Modules registered in `packages/modules/`. Compile-time loading via `buildServerModuleLoadReport()` → `loadServerModules()` → `mountLoadedServerModules()`.
4. **Core modules** — `core.system` (healthz, bootstrap, auth) and `domain.content` (content CRUD, schema, media, webhooks).
5. **Action catalog** — Modules register actions discoverable via `GET /api/v1/actions`. Actions have visibility policies, permission requirements, and request/response schemas.
6. **v1 limitation** — First-party modules only. No third-party plugin marketplace yet.

- [ ] **Step 4: Write architecture/multi-tenancy.mdx**

**Frontmatter:** `title: "Multi-Tenancy"`, `description: "Project and environment isolation model"`

**Content:**
1. **Hierarchy** — Project → Environment. Future: Organization → Project → Environment.
2. **Project isolation** — Each project owns: content types (schema), documents + versions, environments, media files, webhooks, users/RBAC grants. No cross-project content sharing.
3. **Environment isolation** — Within a project, environments have independent: documents, document versions, schema overlays. Schema base is shared at the project level.
4. **Target routing** — Every API request requires `X-MDCMS-Project` and `X-MDCMS-Environment` headers. These are validated by the target routing middleware before any handler runs.
5. **API key restrictions** — Keys can be scoped to specific project/environment pairs via `contextAllowlist`.
6. **Clone and promote** (post-MVP) — Clone creates a copy of an environment's content. Promote pushes documents from one environment to another (full overwrite, matched by translationGroupId + locale).

- [ ] **Step 5: Write architecture/data-model.mdx**

**Frontmatter:** `title: "Data Model"`, `description: "Database schema, entity relationships, and table structures"`

**Content:**
1. **ER diagram** — Mermaid diagram showing all tables and relationships:
   - `authUsers` → `authSessions`, `authAccounts`, `apiKeys`, `rbacGrants`, `invites`
   - `projects` → `environments`, `documents`, `schemaRegistryEntries`
   - `documents` → `documentVersions`
2. **Authentication tables** — `authUsers`, `authSessions`, `authAccounts`, `authVerifications`, `authLoginBackoffs`, `cliLoginChallenges`. Brief description of each.
3. **Authorization** — `rbacGrants` table with role + scope. `apiKeys` with scopes + contextAllowlist.
4. **Project/Environment** — `projects` (slug, name, organization), `environments` (name, projectId).
5. **Schema** — `schemaRegistryEntries` (type, resolvedSchema, schemaHash per project/environment).
6. **Content** — `documents` table (detailed column table with types) and `documentVersions` (immutable publish history).
7. **Key design decisions** — Mutable head + append-only versions (two-table hybrid). JSONB for frontmatter. Soft-delete pattern.

- [ ] **Step 6: Write architecture/content-lifecycle.mdx**

**Frontmatter:** `title: "Content Lifecycle"`, `description: "Document states, transitions, and versioning model"`

**Content:**
1. **Lifecycle diagram** — Mermaid state diagram: Created → Draft → Published → Editing (published) → Re-published → Soft-deleted → Restored
2. **Two-table model** — `documents` (mutable head) and `documentVersions` (immutable snapshots). Only publish creates version rows.
3. **State transitions** — Table showing each transition, what changes, and which table is affected:
   - Create → INSERT documents
   - Auto-save → UPDATE documents (draftRevision++)
   - Publish → INSERT documentVersions, UPDATE documents (publishedVersion)
   - Unpublish → UPDATE documents (publishedVersion = null)
   - Delete → UPDATE documents (isDeleted = true)
   - Restore → UPDATE documents (isDeleted = false)
   - Restore version → UPDATE documents body/frontmatter from version snapshot
4. **Concurrency** — `draftRevision` field used for optimistic concurrency. Server rejects writes with stale revision.
5. **Duplication** — Creates a new document with auto-generated path suffix and new documentId/translationGroupId.

- [ ] **Step 7: Write architecture/localization-model.mdx**

**Frontmatter:** `title: "Localization Model"`, `description: "Translation groups, locale handling, and i18n architecture"`

**Content:**
1. **Core concept** — Localized types have independent document rows per locale, linked by `translationGroupId`.
2. **Locale handling** — BCP 47 tags normalized canonically. `__mdcms_default__` reserved for non-localized types.
3. **Translation groups** — Same logical content across locales shares a `translationGroupId` but has independent: path, body, frontmatter, version history, lifecycle state.
4. **Query patterns** — SDK/API accepts `locale` parameter. Non-localized types ignore locale parameter (use `__mdcms_default__` internally).
5. **CLI file mapping** — Localized: `<path>.<locale>.<ext>`, Non-localized: `<path>.<ext>`.
6. **Brownfield detection** — During `mdcms init`, CLI detects existing locale patterns: frontmatter hints → filename suffix → folder segment. Normalizes and persists to `locales.aliases`.

- [ ] **Step 8: Write architecture/migrations.mdx**

**Frontmatter:** `title: "Migrations"`, `description: "Schema evolution and content migration strategy"`

**Content:**
1. **When migrations are needed** — Renaming types, removing types with existing content, changing field types, restructuring fields.
2. **Database migrations** — Drizzle ORM for schema.ts changes. `drizzle-kit generate` + `drizzle-kit push`.
3. **Content migrations** — `mdcms migrate` generates per-document transformation logic. `mdcms migrate --apply` executes transformations, updates drafts, auto-publishes new versions.
4. **Non-breaking changes** — Adding optional fields, adding new types — no migration needed. Schema sync handles these automatically.
5. **Breaking changes** — Type renames, field type changes, field removal — require explicit migration.
6. `<Warning>`: Always back up your database before running content migrations in production.

- [ ] **Step 9: Write architecture/request-flow.mdx**

**Frontmatter:** `title: "Request Flow"`, `description: "HTTP middleware chain from request to response"`

**Content:**
1. **8-step middleware chain** — Mermaid sequence diagram:
   1. CORS — Origin validation, preflight handling
   2. Request Logging — Incoming request metadata
   3. CSRF — Cookie-based token validation for state-changing requests
   4. Authentication — Identify principal (API key or session)
   5. Target Routing — Validate `X-MDCMS-Project` + `X-MDCMS-Environment`, resolve to internal IDs
   6. Authorization — Check principal has required permissions for the route
   7. Route Handler — Business logic execution
   8. Response Envelope — Wrap result in standard `{ data }` or `{ data, pagination }` envelope
2. **Error handling** — Any step can short-circuit with an error envelope. Error format: `{ status: "error", code, message, statusCode, details, requestId, timestamp }`.
3. **CORS details** — Allowed headers list. Origins configurable via `MDCMS_STUDIO_ALLOWED_ORIGINS`.
4. **Response envelopes** — Three formats: single resource `{ data: T }`, paginated `{ data: T[], pagination: { total, limit, offset, hasMore } }`, error.

- [ ] **Step 10: Write architecture/auth.mdx**

**Frontmatter:** `title: "Authentication & Authorization"`, `description: "Auth flows, session management, and RBAC enforcement"`

**Content:**
1. **Principal types** — Two: `api_key` (programmatic) and `session` (browser/Studio).
2. **API Key auth** — Bearer token with `mdcms_key_` prefix. Keys stored as hash (never plaintext). Scoped to operations + project/environment pairs.
3. **Session auth** — Cookie-based via better-auth. 2-hour inactivity timeout, 12-hour absolute max. CSRF protection (cookie + header). Supports password, OIDC, and SAML providers.
4. **CLI device flow** — 3-step: Challenge (10-min TTL) → Browser authorization → Code exchange for API key.
5. **RBAC model** — Roles (viewer/editor/admin/owner) with scopes (global/project/folder-prefix). Grants stored in `rbacGrants` table.
6. **Authorization check** — Per-route. `authorizeRequest()` validates principal has required capability for the action.
7. **Invite flow** — Admin creates invite (email + grants). Token sent via email. User accepts to create account with assigned grants.

- [ ] **Step 11: Write architecture/scopes-and-permissions.mdx**

**Frontmatter:** `title: "Scopes & Permissions"`, `description: "API key scopes, RBAC capabilities, and permission matrix"`

**Content:**
1. **API key scopes** — Full table of 17 scopes with descriptions:
   - `content:read`, `content:read:draft`, `content:write`, `content:write:draft`, `content:publish`, `content:delete`
   - `schema:read`, `schema:write`
   - `media:upload`, `media:delete`
   - `webhooks:read`, `webhooks:write`
   - `environments:clone`, `environments:promote`
   - `migrations:run`
   - `projects:read`, `projects:write`
2. **RBAC capability matrix** — Table mapping roles to capabilities:
   - viewer: content:read, schema:read, projects:read
   - editor: + content:read:draft, content:write, content:publish, content:delete
   - admin: + schema:write, projects:write, users:manage, settings:manage
   - owner: admin at global scope
3. **Scope types** — Global (instance-wide), Project (per-project), Folder Prefix (path-based restriction within environment).
4. **Enforcement** — Backend is authoritative. Studio hides UI elements based on capabilities (advisory), but server enforces on every request.

- [ ] **Step 12: Commit**

```bash
git add apps/docs/architecture/
git commit -m "docs(docs): add architecture pages"
```

---

## Task 7: API Reference — Getting Started Pages

**Files:**
- Create: `apps/docs/api-reference/overview.mdx`
- Create: `apps/docs/api-reference/authentication.mdx`
- Create: `apps/docs/api-reference/errors.mdx`

**Source references:** SPEC-005, MVP api-reference pages, server routes

- [ ] **Step 1: Write api-reference/overview.mdx**

**Frontmatter:** `title: "API Overview"`, `description: "Base URL, required headers, response format, and pagination"`

**Content:**
1. **Base URL** — `/api/v1`
2. **Required headers** — Table:
   - `X-MDCMS-Project` (required) — Project slug
   - `X-MDCMS-Environment` (required) — Environment name
   - `Authorization` (required) — `Bearer mdcms_key_<key>` or session cookie
   - `X-MDCMS-CSRF-Token` (required for mutations) — CSRF token from auth
   - `X-MDCMS-Schema-Hash` (required for content writes) — Schema hash from sync
   - `X-MDCMS-Locale` (optional) — Locale override
3. **Response format** — Three envelopes with JSON examples:
   - Single resource: `{ "data": { ... } }`
   - Paginated list: `{ "data": [...], "pagination": { "total": 42, "limit": 20, "offset": 0, "hasMore": true } }`
   - Error: `{ "status": "error", "code": "NOT_FOUND", "message": "...", "statusCode": 404, "requestId": "...", "timestamp": "..." }`
4. **Pagination** — Parameters: `limit` (default 20, max 100), `offset`, `sort` (createdAt/updatedAt/path), `order` (asc/desc)
5. **Content-Type** — `application/json` for all requests and responses
6. `<Tip>`: Use the `@mdcms/sdk` package instead of raw HTTP for type-safe API access.

- [ ] **Step 2: Write api-reference/authentication.mdx**

**Frontmatter:** `title: "Authentication"`, `description: "API key and session authentication endpoints"`

**Content — each endpoint as its own section with `<ParamField>` for params:**

1. **`POST /api/v1/auth/login`** — Password login
   - Body: `email` (string, required), `password` (string, required)
   - Response: session object with `id`, `userId`, `email`, `issuedAt`, `expiresAt` + CSRF token in cookie
   - Example request/response in `<CodeGroup>` (cURL + SDK)

2. **`POST /api/v1/auth/logout`** — End session
   - Requires: session cookie + CSRF token
   - Response: `{ "data": { "success": true } }`

3. **`POST /api/v1/auth/sso/{provider}`** — Initiate OIDC sign-in
   - Path param: provider name
   - Response: redirect URL

4. **`POST /api/v1/auth/saml/acs`** — SAML assertion consumer service
5. **`GET /api/v1/auth/saml/metadata`** — SAML metadata

6. **`POST /api/v1/auth/cli/start`** — Start CLI device flow
   - Body: `project`, `environment`
   - Response: `challengeId`, `authorizeUrl`, `expiresAt`

7. **`POST /api/v1/auth/cli/authorize`** — Authorize CLI challenge
8. **`POST /api/v1/auth/cli/exchange`** — Exchange code for API key

9. **`GET /api/v1/me`** — Get current principal capabilities
   - Response: `capabilities` object with `schema`, `content`, `users`, `settings` permission flags

10. **`GET /api/v1/environments`** — List project environments

- [ ] **Step 3: Write api-reference/errors.mdx**

**Frontmatter:** `title: "Error Handling"`, `description: "Error response format, error codes, and resolve errors"`

**Content:**
1. **Error format** — JSON envelope:
   ```json
   {
     "status": "error",
     "code": "DOCUMENT_NOT_FOUND",
     "message": "Document with ID abc123 not found",
     "statusCode": 404,
     "details": {},
     "requestId": "req_xyz",
     "timestamp": "2026-04-13T12:00:00Z"
   }
   ```
2. **Error codes table** — Table with code, HTTP status, description, common cause:
   - `UNAUTHORIZED` (401) — Missing or invalid credentials
   - `FORBIDDEN` (403) — Insufficient permissions
   - `NOT_FOUND` (404) — Resource doesn't exist
   - `INVALID_INPUT` (400) — Request body validation failed
   - `INVALID_QUERY_PARAM` (400) — Query parameter validation failed
   - `INVALID_CONTENT_SCOPE` (400) — Invalid project/environment combination
   - `SCHEMA_NOT_FOUND` (404) — Content type not in registry
   - `SCHEMA_HASH_REQUIRED` (400) — Missing schema hash header
   - `SCHEMA_HASH_MISMATCH` (409) — Schema out of sync
   - `SCHEMA_NOT_SYNCED` (409) — Schema never synced
   - `CONTENT_PATH_CONFLICT` (409) — Duplicate path in same environment
   - `CONFLICT` (409) — Draft revision mismatch (stale write)
   - `RATE_LIMITED` (429) — Too many requests
   - `INTERNAL_ERROR` (500) — Server error
3. **Resolve errors** — Returned in `resolveErrors` field on document responses. Table:
   - `REFERENCE_NOT_FOUND` — Referenced document doesn't exist
   - `REFERENCE_DELETED` — Referenced document was soft-deleted
   - `REFERENCE_TYPE_MISMATCH` — Reference target type doesn't match
   - `REFERENCE_FORBIDDEN` — Caller lacks permission to read reference
4. `<Note>`: Every error response includes a `requestId` for debugging. Include it when reporting issues.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/api-reference/overview.mdx apps/docs/api-reference/authentication.mdx apps/docs/api-reference/errors.mdx
git commit -m "docs(docs): add API reference getting started pages"
```

---

## Task 8: API Reference — Content API Pages

**Files:**
- Create: `apps/docs/api-reference/content/list.mdx`
- Create: `apps/docs/api-reference/content/get.mdx`
- Create: `apps/docs/api-reference/content/create.mdx`
- Create: `apps/docs/api-reference/content/update.mdx`
- Create: `apps/docs/api-reference/content/publish.mdx`
- Create: `apps/docs/api-reference/content/versions.mdx`
- Create: `apps/docs/api-reference/content/delete.mdx`
- Create: `apps/docs/api-reference/content/overview-stats.mdx`

**Source references:** Server routes at `apps/server/src/lib/content-api/routes.ts`, SPEC-003, MVP `api-reference/content.mdx`

**Pattern for every endpoint page:**
- Frontmatter with title and description
- HTTP method + path as heading
- Required headers reminder (link to overview)
- Required scopes (e.g., `content:read`)
- `<ParamField>` for every path param, query param, and body field
- Full request example in `<CodeGroup>` (cURL + SDK)
- Full response example with all fields
- Error cases specific to this endpoint
- Related endpoints at bottom

- [ ] **Step 1: Write api-reference/content/list.mdx**

`GET /api/v1/content` — List documents

**Query params (all with `<ParamField>`):**
- `type` (required) — Content type name
- `locale` — Filter by locale
- `path` — Filter by path prefix
- `slug` — Filter by slug
- `published` — Filter by published state (boolean)
- `isDeleted` — Include deleted documents (boolean)
- `hasUnpublishedChanges` — Filter by unpublished changes (boolean)
- `draft` — Return draft content instead of published (boolean)
- `resolve` — Reference fields to expand (repeatable)
- `limit`, `offset`, `sort`, `order` — Pagination

**Required scope:** `content:read` (+ `content:read:draft` if `draft=true`)

Full cURL + SDK examples with paginated response.

- [ ] **Step 2: Write api-reference/content/get.mdx**

`GET /api/v1/content/{documentId}` — Get single document

**Path params:** `documentId` (UUID)
**Query params:** `locale`, `resolve`, `draft`
**Required scope:** `content:read`

Full response example showing all document fields.

- [ ] **Step 3: Write api-reference/content/create.mdx**

`POST /api/v1/content` — Create document

**Required headers:** `X-MDCMS-Schema-Hash`, `X-MDCMS-CSRF-Token`
**Required scope:** `content:write`
**Body fields:** `type`, `path`, `locale`, `format`, `frontmatter`, `body`

Full request/response. Error cases: `SCHEMA_HASH_MISMATCH`, `CONTENT_PATH_CONFLICT`, `VALIDATION_ERROR`.

- [ ] **Step 4: Write api-reference/content/update.mdx**

`PUT /api/v1/content/{documentId}` — Update document

**Required headers:** `X-MDCMS-Schema-Hash`, `X-MDCMS-CSRF-Token`
**Required scope:** `content:write`
**Body fields:** `frontmatter`, `body`, `draftRevision` (optimistic concurrency)
**Error cases:** `CONFLICT` (stale draftRevision), `SCHEMA_HASH_MISMATCH`

- [ ] **Step 5: Write api-reference/content/publish.mdx**

`POST /api/v1/content/{documentId}/publish` — Publish document

**Required scope:** `content:publish`
**Body fields:** `changeSummary` (optional string)

Also document `POST /api/v1/content/{documentId}/unpublish` on same page.

- [ ] **Step 6: Write api-reference/content/versions.mdx**

Two endpoints on one page:
- `GET /api/v1/content/{documentId}/versions` — List versions (paginated)
- `GET /api/v1/content/{documentId}/versions/{version}` — Get specific version

Also: `POST /api/v1/content/{documentId}/versions/{version}/restore` — Restore version

- [ ] **Step 7: Write api-reference/content/delete.mdx**

`DELETE /api/v1/content/{documentId}` — Soft-delete document
**Required scope:** `content:delete`

Also: `POST /api/v1/content/{documentId}/restore` — Restore deleted document
And: `POST /api/v1/content/{documentId}/duplicate` — Duplicate document

- [ ] **Step 8: Write api-reference/content/overview-stats.mdx**

`GET /api/v1/content/overview` — Document counts by type

**Query params:** `type` (repeatable — filter to specific types)
Response: count breakdown per type.

- [ ] **Step 9: Commit**

```bash
git add apps/docs/api-reference/content/
git commit -m "docs(docs): add content API reference pages"
```

---

## Task 9: API Reference — Schema, Media, Webhooks Pages

**Files:**
- Create: `apps/docs/api-reference/schema/list.mdx`
- Create: `apps/docs/api-reference/schema/get.mdx`
- Create: `apps/docs/api-reference/schema/sync.mdx`
- Create: `apps/docs/api-reference/media/upload.mdx`
- Create: `apps/docs/api-reference/media/delete.mdx`
- Create: `apps/docs/api-reference/webhooks/list.mdx`
- Create: `apps/docs/api-reference/webhooks/create.mdx`
- Create: `apps/docs/api-reference/webhooks/update.mdx`
- Create: `apps/docs/api-reference/webhooks/delete.mdx`

**Source references:** Server routes, SPEC-004 (schema), SPEC-010 (media/webhooks)

Same pattern as Task 8 — full endpoint documentation per page with `<ParamField>`, examples, error cases.

- [ ] **Step 1: Write schema API pages (list.mdx, get.mdx, sync.mdx)**

- `GET /api/v1/schema` — List all schema types. Scope: `schema:read`. Response includes resolved field metadata.
- `GET /api/v1/schema/{type}` — Get single schema type. Shows full field definitions with types, required, nullable, defaults, checks, reference targets.
- `PUT /api/v1/schema/sync` — Sync schema from CLI. Scope: `schema:write`. Body: `rawConfigSnapshot`, `resolvedSchema`, `schemaHash`. Idempotent — re-sync with same hash is a no-op. Returns updated registry.

- [ ] **Step 2: Write media API pages (upload.mdx, delete.mdx)**

- `POST /api/v1/media` — Upload file. Scope: `media:upload`. Multipart form data. Response: `id`, `filename`, `mimeType`, `sizeBytes`, `url`, `uploadedBy`, `uploadedAt`.
- `DELETE /api/v1/media/{id}` — Delete media file. Scope: `media:delete`.
- `<Note>`: Media is project-scoped and reusable across environments.
- `<Note>`: Media API is post-MVP. These endpoints may not be available in all deployments.

- [ ] **Step 3: Write webhooks API pages (list.mdx, create.mdx, update.mdx, delete.mdx)**

- `GET /api/v1/webhooks` — List webhooks. Scope: `webhooks:read`.
- `POST /api/v1/webhooks` — Create webhook. Scope: `webhooks:write`. Body: `url`, `events` (array of event types), `secret`, `active`.
- `PUT /api/v1/webhooks/{id}` — Update webhook. Same body as create.
- `DELETE /api/v1/webhooks/{id}` — Delete webhook. Scope: `webhooks:write`.

Include webhook event types table: `content.created`, `content.updated`, `content.published`, `content.unpublished`, `content.deleted`, `content.restored`, `media.uploaded`.

Include webhook signature format: `X-MDCMS-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256(secret, t + "." + raw_body)>`.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/api-reference/schema/ apps/docs/api-reference/media/ apps/docs/api-reference/webhooks/
git commit -m "docs(docs): add schema, media, and webhooks API reference pages"
```

---

## Task 10: API Reference — SDK Pages

**Files:**
- Create: `apps/docs/api-reference/sdk/installation.mdx`
- Create: `apps/docs/api-reference/sdk/client-setup.mdx`
- Create: `apps/docs/api-reference/sdk/querying.mdx`
- Create: `apps/docs/api-reference/sdk/error-handling.mdx`
- Create: `apps/docs/api-reference/sdk/nextjs.mdx`

**Source references:** `packages/sdk/src/lib/sdk.ts`, SPEC-008, MVP `api-reference/sdk.mdx`

- [ ] **Step 1: Write api-reference/sdk/installation.mdx**

**Content:**
1. Install command in `<CodeGroup>` (bun/npm/pnpm)
2. Package: `@mdcms/sdk`
3. Peer dependencies (if any)
4. Minimum runtime requirements

- [ ] **Step 2: Write api-reference/sdk/client-setup.mdx**

**Content:**
1. `createClient()` function:
   ```typescript
   import { createClient } from "@mdcms/sdk";

   const client = createClient({
     serverUrl: "https://cms.example.com",
     apiKey: process.env.MDCMS_API_KEY!,
     project: "marketing-site",
     environment: "production",
   });
   ```
2. Configuration options table with `<ParamField>`:
   - `serverUrl` (string, required) — MDCMS server URL
   - `apiKey` (string, required) — API key with `mdcms_key_` prefix
   - `project` (string, required) — Project slug
   - `environment` (string, required) — Environment name
   - `fetch` (typeof fetch, optional) — Custom fetch implementation
3. Headers sent automatically: `Authorization`, `X-MDCMS-Project`, `X-MDCMS-Environment`

- [ ] **Step 3: Write api-reference/sdk/querying.mdx**

**Content:**
1. **`client.get(type, input)`** — Fetch single document:
   ```typescript
   // By ID
   const post = await client.get("BlogPost", { id: "uuid-here" });
   
   // By slug
   const post = await client.get("BlogPost", { slug: "hello-world" });
   
   // With locale and reference resolution
   const post = await client.get("BlogPost", {
     slug: "hello-world",
     locale: "fr",
     resolve: ["author"],
     draft: false,
   });
   ```
   - `id` or `slug` — mutually exclusive (show both patterns)
   - `locale` — BCP 47 tag
   - `resolve` — array of reference field names to expand
   - `draft` — read draft instead of published (requires `content:read:draft` scope)
   - Returns: `ContentDocumentResponse`

2. **`client.list(type, input?)`** — List documents:
   ```typescript
   const posts = await client.list("BlogPost", {
     locale: "en",
     published: true,
     sort: "updatedAt",
     order: "desc",
     limit: 10,
     offset: 0,
   });
   
   console.log(posts.data); // ContentDocumentResponse[]
   console.log(posts.pagination); // { total, limit, offset, hasMore }
   ```
   - All query parameters from the Content API `GET /api/v1/content` are available
   - Returns: `ApiPaginatedEnvelope<ContentDocumentResponse>`

3. **Response types** — Document all fields of `ContentDocumentResponse`:
   `documentId`, `translationGroupId`, `project`, `environment`, `path`, `type`, `locale`, `format`, `isDeleted`, `hasUnpublishedChanges`, `version`, `publishedVersion`, `draftRevision`, `frontmatter`, `body`, `resolveErrors`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`

- [ ] **Step 4: Write api-reference/sdk/error-handling.mdx**

**Content:**
1. **`MdcmsApiError`** — Server-side errors:
   ```typescript
   try {
     const post = await client.get("BlogPost", { slug: "missing" });
   } catch (error) {
     if (error instanceof MdcmsApiError) {
       console.log(error.statusCode); // 404
       console.log(error.code);       // "NOT_FOUND"
       console.log(error.message);    // "Document not found"
       console.log(error.requestId);  // "req_xyz"
     }
   }
   ```
   Properties: `statusCode`, `code`, `message`, `details`, `requestId`, `timestamp`

2. **`MdcmsClientError`** — Client-side errors:
   Codes: `INVALID_RESPONSE`, `NETWORK_ERROR`, `NOT_FOUND`, `AMBIGUOUS_RESULT`
   ```typescript
   if (error instanceof MdcmsClientError) {
     console.log(error.code); // "NETWORK_ERROR"
     console.log(error.cause); // original error
   }
   ```

3. **Best practices** — Check error type, handle gracefully, log `requestId` for debugging.

- [ ] **Step 5: Write api-reference/sdk/nextjs.mdx**

**Content:**
1. **Setup** — Create SDK client in a shared module:
   ```typescript
   // lib/mdcms.ts
   import { createClient } from "@mdcms/sdk";

   export const cms = createClient({
     serverUrl: process.env.MDCMS_SERVER_URL!,
     apiKey: process.env.MDCMS_API_KEY!,
     project: process.env.MDCMS_PROJECT!,
     environment: process.env.MDCMS_ENVIRONMENT!,
   });
   ```

2. **Dynamic routes** — Full App Router example:
   ```typescript
   // app/blog/[slug]/page.tsx
   import { cms } from "@/lib/mdcms";
   import { notFound } from "next/navigation";
   import { MdcmsApiError } from "@mdcms/sdk";

   export async function generateStaticParams() {
     const posts = await cms.list("BlogPost", { published: true });
     return posts.data.map((post) => ({
       slug: post.frontmatter.slug as string,
     }));
   }

   export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
     const { slug } = await params;
     try {
       const post = await cms.get("BlogPost", {
         slug,
         resolve: ["author"],
       });
       return (
         <article>
           <h1>{post.frontmatter.title as string}</h1>
           <div>{post.body}</div>
         </article>
       );
     } catch (error) {
       if (error instanceof MdcmsApiError && error.statusCode === 404) {
         notFound();
       }
       throw error;
     }
   }
   ```

3. **ISR / Revalidation** — Using Next.js `revalidatePath` or `revalidateTag` with webhooks.

4. **Localized routes** — Example with `[locale]/[slug]` pattern.

5. **Draft preview** — Using `draft: true` with a preview route protected by a secret.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/api-reference/sdk/
git commit -m "docs(docs): add SDK reference pages"
```

---

## Task 11: Development Pages

**Files:**
- Create: `apps/docs/development/prerequisites.mdx`
- Create: `apps/docs/development/local-setup.mdx`
- Create: `apps/docs/development/environment-variables.mdx`
- Create: `apps/docs/development/packages/overview.mdx`
- Create: `apps/docs/development/packages/server.mdx`
- Create: `apps/docs/development/packages/cli.mdx`
- Create: `apps/docs/development/packages/studio.mdx`
- Create: `apps/docs/development/packages/sdk.mdx`
- Create: `apps/docs/development/packages/shared.mdx`
- Create: `apps/docs/development/packages/modules.mdx`
- Create: `apps/docs/development/workflow.mdx`
- Create: `apps/docs/development/code-conventions.mdx`
- Create: `apps/docs/development/testing.mdx`
- Create: `apps/docs/development/database-migrations.mdx`

**Source references:** SPEC-011, MVP development pages, docker-compose files, root package.json

- [ ] **Step 1: Write development/prerequisites.mdx**

**Content:** Required tools (Bun 1.3.11+, Docker, Node.js 20+), OS-specific notes in `<Tabs>` (macOS / Linux), recommended IDE extensions.

- [ ] **Step 2: Write development/local-setup.mdx**

**Content:** Full local setup in `<Steps>`:
1. Clone repo
2. `bun install`
3. Copy `.env.example` to `.env`
4. Start Docker Compose (`docker compose -f docker-compose.dev.yml up -d`)
5. Wait for services (health checks)
6. Open Studio at localhost:4173/admin
7. Demo credentials: `demo@mdcms.local` / `Demo12345!`

Include manual setup alternative in `<Tabs>`. Service endpoints table (8 services with ports).

- [ ] **Step 3: Write development/environment-variables.mdx**

**Content:** Complete table of all env vars organized by category:
- Required: DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET
- Server: PORT, NODE_ENV, LOG_LEVEL
- Studio: MDCMS_STUDIO_ALLOWED_ORIGINS, MDCMS_AUTH_INSECURE_COOKIES
- Auth Providers: MDCMS_AUTH_OIDC_PROVIDERS, MDCMS_AUTH_SAML_PROVIDERS
- Demo: MDCMS_DEMO_API_KEY, MDCMS_DEMO_PROJECT, MDCMS_DEMO_ENVIRONMENT

Each with description, type, default value, and example.

- [ ] **Step 4: Write development/packages/overview.mdx**

**Content:** Workspace layout, Mermaid dependency graph, table of all 8 packages with name/type/purpose. Bun workspaces config. Nx configuration highlights.

- [ ] **Step 5: Write package detail pages (server.mdx, cli.mdx, studio.mdx, sdk.mdx, shared.mdx, modules.mdx)**

Each page follows the same pattern:
- Package name and description
- Directory structure
- Key dependencies
- Main exports/entry points
- How to run (dev command, port)
- How to add new features (e.g., "adding a new endpoint" for server, "adding a new command" for CLI)
- Testing approach

Use source data from SPEC-002 (architecture), SPEC-006 (Studio), SPEC-008 (CLI/SDK), actual package.json files.

- [ ] **Step 6: Write development/workflow.mdx**

**Content:** Branch naming conventions (feat/, fix/, chore/, refactor/), commit conventions (conventional commits), PR process, pre-push CI gate.

- [ ] **Step 7: Write development/code-conventions.mdx**

**Content:** TypeScript strict mode, Prettier formatting, naming rules (kebab-case files, PascalCase types, camelCase functions, SCREAMING_SNAKE_CASE constants).

- [ ] **Step 8: Write development/testing.mdx**

**Content:**
- Unit tests: `*.test.ts` alongside source, Bun test runner, coverage targets
- Integration tests: Docker Compose required, API/auth/database coverage
- CI gates: quality (format + typecheck) → unit → integration
- Commands: `bun run unit`, `bun run integration`, `bun run ci:required`

- [ ] **Step 9: Write development/database-migrations.mdx**

**Content:** Drizzle ORM migration workflow in `<Steps>`:
1. Modify `schema.ts`
2. Generate migration: `drizzle-kit generate`
3. Review generated SQL
4. Apply: `drizzle-kit push`
5. Test locally before committing

Migration files stored in `drizzle/` directory.

- [ ] **Step 10: Commit**

```bash
git add apps/docs/development/
git commit -m "docs(docs): add development guide pages"
```

---

## Task 12: Final Verification & Cleanup

- [ ] **Step 1: Verify all files exist**

Run `find apps/docs -name "*.mdx" | wc -l` — should be ~50 files.

- [ ] **Step 2: Verify docs.json navigation matches files**

Check that every page listed in `docs.json` navigation has a corresponding `.mdx` file, and vice versa.

- [ ] **Step 3: Validate docs.json is valid JSON**

Run `cat apps/docs/docs.json | python3 -m json.tool > /dev/null`

- [ ] **Step 4: Check frontmatter consistency**

Verify every `.mdx` file has `title` and `description` in frontmatter.

- [ ] **Step 5: Commit any fixes**

```bash
git add apps/docs/
git commit -m "docs(docs): fix verification issues"
```

- [ ] **Step 6: Push and create PR**

```bash
git push origin feat/mintlify-docs
gh pr create --base docs --title "Add Mintlify documentation site" --body "..."
```
