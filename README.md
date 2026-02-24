# MDCMS Workspace

This repository hosts the MDCMS monorepo foundation.

It is initialized as a Bun-based Nx package workspace with the initial package boundaries required by the roadmap:

| Package         | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `@mdcms/server` | Backend server package boundary for API/runtime implementation. |
| `@mdcms/studio` | Host-embedded Studio package boundary for runtime loader work.  |
| `@mdcms/sdk`    | Client SDK package boundary for content API consumption.        |
| `@mdcms/cli`    | CLI package boundary for operator workflows.                    |
| `@mdcms/shared` | Shared contracts/types/utilities boundary used across packages. |

## Workspace Commands

Run from `/Users/karol/Desktop/mdcms`:

- `bun run build` - Build all projects with Nx.
- `bun run typecheck` - Typecheck all projects with Nx.
- `bun run quality` - Run foundational quality checks (`format:check` + `typecheck`).
- `bun run unit` - Run package unit test targets through Nx.
- `bun run integration` - Run integration harness checks (`compose:health` + `migrate:check`).
- `bun run ci:required` - Run all required CI gates locally in sequence.
- `bun run check` - Run `build` and `typecheck` targets across projects.
- `bun run compose:health` - Run the Docker Compose integration health and persistence checks.
- `bun run migrate:check` - Verify auto-run SQL migrations and server startup in Docker Compose.
- `bun run format` - Format repository files with Prettier.
- `bun run format:check` - Check repository formatting with Prettier.

## Package Layout

- `packages/server`
- `packages/studio`
- `packages/sdk`
- `packages/cli`
- `packages/shared`

## Local Docker Stack

Run from `/Users/karol/Desktop/mdcms`:

```bash
docker compose up -d --build
```

Service endpoints:

- Server API: `http://localhost:4000` (`GET /healthz`)
- Postgres: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Mailhog SMTP: `localhost:1025`
- Mailhog UI: `http://localhost:8025`

Stop stack:

```bash
docker compose down
```

Run integration verification:

```bash
bun run compose:health
```

The verification script boots the stack, waits for healthy services, validates `/healthz`, checks required host port mappings, verifies `pgdata` and `miniodata` persistence across restart, and tears everything down.

## SQL Migrations

The DB adapter baseline uses Drizzle + `postgres.js` in `@mdcms/server`.

SQL migration authoring flow:

```bash
bun run --cwd packages/server db:generate
```

SQL migration apply flow:

```bash
bun run --cwd packages/server db:migrate
```

In local Docker Compose, SQL migrations are applied automatically by the one-shot
`db-migrate` service before `server` starts.

### Environment Defaults

`.env` is optional. If present, Compose reads it automatically. Use `.env.example` as a starting point for overrides.

### Bun and `node-gyp` Workarounds

Some auth tooling (notably `better-auth` via `better-sqlite3`) may require native `node-gyp` compilation that can fail in Bun-focused environments.

- Prefer `npx` over `bunx` for CLI operations that invoke affected tooling (e.g., schema/migration helper commands).
- If Bun-native install fails, run dependency installation/build steps with Node.js in a build stage or local bootstrap step, then run the app with Bun.
