# @mdcms/server

Backend API/runtime package boundary for MDCMS.

## Runtime Contracts (CMS-2)

- `GET /healthz` is the foundational health endpoint for runtime process checks.
- The Docker Compose `server` service uses `GET /healthz` as its container health probe.
- Runtime errors are normalized to the shared `ErrorEnvelope` contract from `@mdcms/shared`.
- Server env parsing extends shared `CoreEnv` with:
  - `PORT` (default `4000`, validated integer in range 1-65535)
  - `SERVICE_NAME` (default `mdcms-server`)

## Typed Action Catalog Endpoints (CMS-5)

- Server exposes canonical action catalog endpoints:
  - `GET /api/v1/actions`
  - `GET /api/v1/actions/:id`
- `createActionCatalogContractApp(...)` in `src/lib/action-catalog-contract.ts` is the server-owned Eden contract source for those routes.
- `ActionCatalogContractApp` is exported so Studio/CLI adapters can use Treaty typing from backend-owned route definitions.
- The catalog response contract uses flattened metadata and optional inline request/response schemas from `@mdcms/shared`.
- `createServerRequestHandler` accepts:
  - `actions?: ActionCatalogItem[]` to register catalog items
  - `isActionVisible?: (context) => boolean | Promise<boolean>` to authorization-filter caller-visible actions
- `isActionVisible` defaults to allow-all and is designed for future auth integration tasks.
- Unprefixed `/actions` paths are rejected to keep `/api/v1` enforcement consistent across server and consumers.

## DB Adapter + SQL Migrations (CMS-4)

- Database adapter baseline is implemented with Drizzle ORM and `postgres.js` in `src/lib/db.ts`.
- SQL migrations are managed via Drizzle Kit and committed in `packages/server/drizzle`.
- Server package scripts:
  - `bun run --cwd packages/server db:generate` (generate SQL migrations from Drizzle schema)
  - `bun run --cwd packages/server db:migrate` (apply pending SQL migrations)
- Docker Compose runs SQL migrations automatically through one-shot `db-migrate` before `server` starts accepting traffic.

### Migration Environment Variables

- `DATABASE_URL` - required Postgres connection string.

### `/healthz` Response

Process-only payload:

```json
{
  "status": "ok",
  "service": "mdcms-server",
  "version": "0.0.0",
  "uptimeSeconds": 12,
  "timestamp": "2026-02-20T00:00:12.000Z"
}
```

### Error Envelope

Error responses follow:

```json
{
  "status": "error",
  "code": "INTERNAL_ERROR",
  "message": "Unexpected runtime error.",
  "details": {},
  "requestId": "optional-request-id",
  "timestamp": "2026-02-20T00:00:12.000Z"
}
```

## Build and Test

- `bun nx build server`
- `bun nx typecheck server`
- `bun nx test server`
- `bun --cwd packages/server run start` (run Bun HTTP server runtime entrypoint for local development)
