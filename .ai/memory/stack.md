# Stack

Runtime, dependencies, and infrastructure. Update when any of them change.

## Runtime + tooling

- **Bun** is the package manager AND the test runner (`bun test`).
- **Nx 22.5** orchestrates tasks across the monorepo with `@nx/js/typescript` plugin.
- **TypeScript 5.9**, strict mode, `nodenext` module resolution, `composite` projects (project references).

## Backend

- **Elysia** (HTTP framework) running on Bun.
- **Drizzle ORM** with `postgres.js` driver against **PostgreSQL 16**. Sessions, content, auth, and audit logs all live in Postgres.
- **Redis** is provisioned in the dev stack (`REDIS_URL` env var); reserved for future use (caching, queues, rate-limiting). Not currently a session store.
- **MinIO** (S3-compatible) for media.

## Frontend

- **React** for Studio.
- **TanStack Query** for client-side data fetching.
- **TanStack Router** for typed routing in the dashboard.
- **TipTap** for the editor with MDX component support.

## Validation

- **Zod 4** for runtime validation.
- **Standard Schema** for content type definitions (ecosystem interop).

## Infrastructure (dev)

- `docker compose up -d --build` brings up postgres, redis, minio, mailhog.
- Server runs on port 4000.

## Custom export condition

`@mdcms/source` resolves to TypeScript source files during development. Production builds resolve through `import`/`default` to `dist/`. Every package's `package.json` exports must include this condition.

## Constraints worth knowing

- **Bun-only.** Do not introduce Node-only dependencies that don't run on Bun.
- **No runtime ORM relationships across modules.** First-party modules in `packages/modules/<id>/` use foreign-key IDs only — never direct relations between modules. (Hard rule from architecture.)
- **Tenant scoping is mandatory.** Every persistable row carries `project_id` (or equivalent boundary key). Queries must filter on it.
- **Pre-push hook** runs `bun run ci:required` — typecheck + format check + unit tests + integration must all pass.
- **Pre-commit checks:** `bun run format:check` and `bun run check`.

## Things that are NOT in the stack (yet)

- No CRDT library (real-time collab is Post-MVP).
- No MCP server (AI agent integration is upcoming, separate work).
- No live preview pipeline (upcoming).

## Repository services

- Issue tracker: GitHub Issues.
- CI: GitHub Actions (see `.github/workflows/`).
- Docs deploy: `docs.mdcms.ai` (separate pipeline).
