# MDCMS Workspace

This repository hosts the MDCMS monorepo foundation.

It is initialized as a Bun-based Nx workspace with app/package boundaries and module/runtime topology required by the roadmap:

| Package          | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| `@mdcms/server`  | Backend server package boundary for API/runtime implementation. |
| `@mdcms/studio`  | Host-embedded Studio package boundary for runtime loader work.  |
| `@mdcms/sdk`     | Client SDK package boundary for content API consumption.        |
| `@mdcms/cli`     | CLI package boundary for operator workflows.                    |
| `@mdcms/shared`  | Shared contracts/types/utilities boundary used across packages. |
| `@mdcms/modules` | Deterministic local module registry (`packages/modules`).       |

## Workspace Commands

Run from the workspace root:

- `bun install` - Install workspace dependencies and register the repo-managed Git hooks.
- `bun run build` - Build all projects with Nx.
- `bun run typecheck` - Typecheck all projects with Nx.
- `bun run quality` - Run foundational quality checks (`format:check` + `typecheck`).
- `bun run unit` - Run unit test targets through Nx.
- `bun run integration` - Run integration harness checks (`compose:health` + `migrate:check`).
- `bun run ci:required` - Run all required CI gates locally in sequence.
- `bun run check` - Run `build` and `typecheck` targets across projects.
- `bun run hooks:install` - Re-register the tracked Git hooks if local Git config was reset.
- `bun run dev` - Start Studio watch build, server auto-restart, and the Studio example Next.js dev server in one command.
- `bun run studio:review:runtime` - Build the private Studio review runtime artifacts used by the review app bootstrap route.
- `bun run studio:review:dev` - Build the review runtime artifacts and start the private Studio review app.
- `bun run compose:dev` - Run the full dev loop in Docker Compose (infra + migrations + hot-reload app/server/studio).
- `bun run compose:dev:down` - Stop the Docker Compose dev stack.
- `bun run compose:health` - Run the Docker Compose integration health and persistence checks.
- `bun run migrate:check` - Verify auto-run SQL migrations and server startup in Docker Compose.
- `bun run format` - Format repository files with Prettier.
- `bun run format:check` - Check repository formatting with Prettier.

The repository targets Bun `1.3.11` in CI. Use the version recorded in [`.bun-version`](/Users/karol/Desktop/mdcms/.bun-version) for local parity when possible.

## Git Hooks

`bun install` configures `core.hooksPath` to the tracked [`.githooks`](/Users/karol/Desktop/mdcms/.githooks) directory when the repo is installed inside a Git worktree.

The [`.githooks/pre-push`](/Users/karol/Desktop/mdcms/.githooks/pre-push) hook runs `bun run ci:required` from the workspace root and blocks `git push` when any required gate fails.

## Workspace Layout

- `apps/server`
- `apps/cli`
- `apps/studio-example`
- `apps/studio-review`
- `packages/studio`
- `packages/sdk`
- `packages/shared`
- `packages/modules`

## Local Docker Stack

Run from the workspace root:

```bash
docker compose up -d --build
```

For a full containerized development loop (infra + db migration + `bun run dev` watchers):

```bash
bun run compose:dev
```

Service endpoints:

- Server API: `http://localhost:4000` (`GET /healthz`)
- Postgres: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Mailhog SMTP: `localhost:1025`
- Mailhog UI: `http://localhost:8025`
- Studio example app: `http://127.0.0.1:4173`
- Studio review app: `http://127.0.0.1:3000`

Stop stack:

```bash
docker compose down
```

Stop containerized dev stack:

```bash
bun run compose:dev:down
```

Run integration verification:

```bash
bun run compose:health
```

The verification script boots the stack, waits for healthy services, validates `/healthz`, checks required host port mappings, verifies `pgdata` and `miniodata` persistence across restart, and tears everything down.

## Private Studio Review App

The repository also contains a private review-only Next.js app at
[`apps/studio-review`](/Users/karol/Desktop/mdcms/apps/studio-review). It is
intended for PR visual review of Studio shell and editor changes without
starting the full Compose stack.

The review app keeps production Studio contracts unchanged:

- it mounts the normal `@mdcms/studio` `<Studio />` shell
- it serves a local review-only `/api/v1/studio/bootstrap` and
  `/api/v1/studio/assets/*` subtree from prebuilt runtime artifacts
- it serves deterministic mock API responses under a scenario-scoped
  `serverUrl` subtree

Local run:

```bash
bun run studio:review:dev
```

Useful routes:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/review/editor/admin`
- `http://127.0.0.1:3000/review/editor/admin/content/post/11111111-1111-4111-8111-111111111111`
- `http://127.0.0.1:3000/review/owner/admin/schema`

## Demo Runbook (Pull + Push + Raw Content Page)

1. Start the local stack:
   - local-hosted dev: `bun run dev` (requires local infra dependencies)
   - containerized dev: `bun run compose:dev`
2. Pull content:
   - `bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts pull --force`
3. Edit one pulled `.md`/`.mdx` file.
4. Push content back:
   - `bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts push --force`
5. Open:
   - `http://127.0.0.1:4173/demo/content`
6. Verify the page renders updated raw `frontmatter` and raw `body`.

Current demo limitation:

- collaboration-aware push rejection remains deferred until CMS-53/CMS-82 closure.

## SQL Migrations

The DB adapter baseline uses Drizzle + `postgres.js` in `@mdcms/server`.

SQL migration authoring flow:

```bash
bun run --cwd apps/server db:generate
```

SQL migration apply flow:

```bash
bun run --cwd apps/server db:migrate
```

In local Docker Compose, SQL migrations are applied automatically by the one-shot
`db-migrate` service before `server` starts.

### Environment Defaults

`.env` is optional. If present, Compose reads it automatically. Use `.env.example` as a starting point for overrides.

### Bun and `node-gyp` Workarounds

Some auth tooling (notably `better-auth` via `better-sqlite3`) may require native `node-gyp` compilation that can fail in Bun-focused environments.

- Prefer `npx` over `bunx` for CLI operations that invoke affected tooling (e.g., schema/migration helper commands).
- If Bun-native install fails, run dependency installation/build steps with Node.js in a build stage or local bootstrap step, then run the app with Bun.
