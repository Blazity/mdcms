<p align="center">
  <img src="https://github.com/Blazity/mdcms/assets/logo-horizontal-light.svg" height="60" alt="MDCMS" />
</p>

<p align="center">
  <strong>The open-source AI Content Engine.</strong><br/>
  Markdown-first. Three interfaces, one data layer.
</p>

<p align="center">
  <a href="https://github.com/Blazity/mdcms/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Blazity/mdcms" alt="License" /></a>
  <a href="https://github.com/Blazity/mdcms/stargazers"><img src="https://img.shields.io/github/stars/Blazity/mdcms" alt="Stars" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="https://docs.mdcms.ai">Docs</a> &middot;
  <a href="#coming-soon">Roadmap</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## What is MDCMS?

An open-source CMS that's Markdown-first. Import your existing project in minutes, edit in a collaborative Studio, and let AI agents work with your content at scale.

Developers define schemas in code and sync via CLI. Editors get a visual Studio they never have to leave. AI agents process content through the same API. Nobody waits for someone else.

`mdcms pull` to work on files locally, `mdcms push` to sync them back. Same editing experience as local files, but the content lives outside your repo. Update a typo without triggering a rebuild. Have five editors on the same page without merge conflicts.

## Quick Start

### 1. Start the infrastructure

```bash
git clone https://github.com/Blazity/mdcms.git
cd mdcms
bun install
docker compose up -d --build
```

### 2. Start the dev server

```bash
bun run dev
```

This starts the backend API server, Studio UI build watcher, and the example Next.js host app.

### 3. Open Studio

Visit [http://127.0.0.1:4173/admin](http://127.0.0.1:4173/admin) to open the Studio UI.

Default demo credentials:
- Email: `demo@mdcms.local`
- Password: `Demo12345!`

### 4. Pull and push content with the CLI

```bash
# Authenticate
bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts login --config apps/studio-example/mdcms.config.ts

# Pull content to local files
bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts pull --force

# Edit a .md or .mdx file, then push changes back
bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts push --force
```

## Features

| Feature | Description |
| --- | --- |
| **Markdown/MDX content** | Author content in Markdown or MDX with custom component support |
| **Code-first schema** | Define content types, fields, and references in TypeScript with Zod validation |
| **Studio UI** | Embeddable React admin interface with a rich document editor, schema browser, and environment management |
| **CLI workflows** | Pull content to local files, edit with any tool, push changes back |
| **Client SDK** | Type-safe read API for fetching content in your app |
| **Versioning and publishing** | Full draft/publish lifecycle with immutable version history |
| **Auth and RBAC** | Session auth, OIDC/SAML SSO, API keys, and role-based access control |
| **Environments** | Manage multiple environments (production, staging, preview) with schema overlays |
| **i18n** | Locale-aware content with translation groups |
| **Extensible modules** | First-party module system for extending server and CLI behavior |

## Packages

| Package | npm | Description |
| --- | --- | --- |
| [`@mdcms/cli`](apps/cli) | `npm install @mdcms/cli` | CLI for content workflows (pull, push, login, schema sync) |
| [`@mdcms/studio`](packages/studio) | `npm install @mdcms/studio` | Embeddable Studio UI component for host apps |
| [`@mdcms/sdk`](packages/sdk) | `npm install @mdcms/sdk` | Read-focused client SDK for content APIs |
| [`@mdcms/shared`](packages/shared) | `npm install @mdcms/shared` | Shared contracts, types, and validators |
| [`@mdcms/server`](apps/server) | Private | Backend API server (Elysia + PostgreSQL) |
| [`@mdcms/modules`](packages/modules) | Private | First-party module registry |

## Coming Soon

<p align="center">
  <img src=".github/assets/coming-soon.png" alt="Coming soon" width="600" />
</p>

- **Live preview** - Real-time content preview in your frontend
- **Real-time collaboration** - Live co-editing with conflict resolution
- **Media management** - Upload, organize, and serve media assets via MinIO/S3
- **Webhooks** - Notify external systems on content lifecycle events
- **Full-text search** - Search across content with indexing and ranking
- **Bulk operations** - Batch publish, unpublish, and delete actions

## Documentation

Full documentation is available at [docs.mdcms.ai](https://docs.mdcms.ai/).

For architecture decisions and specs, see the [`docs/`](docs) directory.

## Contributing

We welcome contributions! See the [contributing guide](https://docs.mdcms.ai/development/contributing) for workflow, conventions, and how to get started.

## License

[MIT](LICENSE)
