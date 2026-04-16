<p align="center">
  <img src=".github/assets/logo-horizontal-dark.svg" height="60" alt="MDCMS" />
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
  <a href="#self-hosting">Self-Hosting</a> &middot;
  <a href="https://docs.mdcms.ai">Docs</a> &middot;
  <a href="#coming-soon">Roadmap</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## What is MDCMS?

An open-source CMS that's Markdown-first. Import your existing project in minutes, edit in a collaborative Studio, and let AI agents work with your content at scale.

Developers define schemas in code and sync via CLI. Editors get a visual Studio they never have to leave. AI agents process content through the same API. Nobody waits for someone else.

`mdcms pull` to work on files locally, `mdcms push` to sync them back. Same editing experience as local files, but the content lives outside your repo. Update a typo without triggering a rebuild. Have five editors on the same page without merge conflicts.

## Demo

https://github.com/user-attachments/assets/b0778e3f-c062-4e66-bd6d-87f1dcb41789

## Quick Start

> **Using an AI coding agent?** Run `npx skills add Blazity/mdcms` to install the [MDCMS Skills Pack](skills/README.md) — your agent will walk through the setup below for you. Supports Claude Code, Cursor, Gemini CLI, Codex, Copilot, and 40+ others via [skills.sh](https://skills.sh).

### 1. Install packages

```bash
npm install @mdcms/cli @mdcms/sdk
```

### 2. Define your content schema

Create a `mdcms.config.ts` in your project root:

```ts
import { defineConfig, defineType } from "@mdcms/cli";
import { z } from "zod";

export default defineConfig({
  project: "my-site",
  environment: "production",
  serverUrl: "https://your-mdcms-server.example.com",
  contentDirectories: ["content"],
  types: [
    defineType("BlogPost", {
      directory: "content/blog",
      fields: {
        title: z.string().min(1),
        summary: z.string().optional(),
      },
    }),
  ],
});
```

### 3. Pull and push content

```bash
# Authenticate with your MDCMS server
npx mdcms login

# Pull content to local Markdown files
npx mdcms pull

# Edit your .md or .mdx files, then push changes back
npx mdcms push
```

### 4. Fetch content in your app

```ts
import { createClient } from "@mdcms/sdk";

const cms = createClient({
  serverUrl: "https://your-mdcms-server.example.com",
  apiKey: process.env.MDCMS_API_KEY!,
  project: "my-site",
  environment: "production",
});

const posts = await cms.list("BlogPost", { locale: "en", published: true });
```

### Embed the Studio UI (optional)

Add a visual editing interface to your app:

```bash
npm install @mdcms/studio
```

See the [`@mdcms/studio` README](packages/studio) for embedding instructions.

## Self-Hosting

Run your own MDCMS server with Docker Compose. The only prerequisites are Docker and Docker Compose.

```bash
git clone https://github.com/Blazity/mdcms.git
cd mdcms
cp .env.example .env
docker compose up -d --build
```

This starts the MDCMS server along with PostgreSQL, Redis, MinIO, and Mailhog. Migrations run automatically on first boot.

Verify the server is running:

```bash
curl http://localhost:4000/healthz
```

Then point your CLI at the server:

```bash
npx mdcms init --server-url http://localhost:4000
```

See the [self-hosting guide](https://docs.mdcms.ai/guide/self-hosting) for environment variable configuration, auth provider setup, and production deployment recommendations.

## Features

| Feature                       | Description                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Markdown/MDX content**      | Author content in Markdown or MDX with custom component support                                          |
| **Code-first schema**         | Define content types, fields, and references in TypeScript with Zod validation                           |
| **Studio UI**                 | Embeddable React admin interface with a rich document editor, schema browser, and environment management |
| **CLI workflows**             | Pull content to local files, edit with any tool, push changes back                                       |
| **Client SDK**                | Type-safe read API for fetching content in your app                                                      |
| **Versioning and publishing** | Full draft/publish lifecycle with immutable version history                                              |
| **Auth and RBAC**             | Session auth, OIDC/SAML SSO, API keys, and role-based access control                                     |
| **Environments**              | Manage multiple environments (production, staging, preview) with schema overlays                         |
| **i18n**                      | Locale-aware content with translation groups                                                             |
| **Extensible modules**        | First-party module system for extending server and CLI behavior                                          |

## Packages

| Package                              | npm                         | Description                                                |
| ------------------------------------ | --------------------------- | ---------------------------------------------------------- |
| [`@mdcms/cli`](apps/cli)             | `npm install @mdcms/cli`    | CLI for content workflows (pull, push, login, schema sync) |
| [`@mdcms/studio`](packages/studio)   | `npm install @mdcms/studio` | Embeddable Studio UI component for host apps               |
| [`@mdcms/sdk`](packages/sdk)         | `npm install @mdcms/sdk`    | Read-focused client SDK for content APIs                   |
| [`@mdcms/shared`](packages/shared)   | `npm install @mdcms/shared` | Shared contracts, types, and validators                    |
| [`@mdcms/server`](apps/server)       | Private                     | Backend API server (Elysia + PostgreSQL)                   |
| [`@mdcms/modules`](packages/modules) | Private                     | First-party module registry                                |

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

## Development

To work on MDCMS itself, clone the repo and use [Bun](https://bun.sh/) as the runtime:

```bash
git clone https://github.com/Blazity/mdcms.git
cd mdcms
bun install
docker compose up -d --build   # Start Postgres, Redis, MinIO, Mailhog
bun run dev                     # Start backend, Studio watcher, and example app
```

Visit [http://127.0.0.1:4173/admin](http://127.0.0.1:4173/admin) to open the Studio UI in the example host app.

Default demo credentials:

- Email: `demo@mdcms.local`
- Password: `Demo12345!`

See the [contributing guide](https://docs.mdcms.ai/development/contributing) for conventions, branch workflow, and how to run the test suite.

## Contributing

We welcome contributions! See the [contributing guide](https://docs.mdcms.ai/development/contributing) for workflow, conventions, and how to get started.

## License

[MIT](LICENSE)
