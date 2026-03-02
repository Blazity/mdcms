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
  - `configureApp?: (app) => void` for composition-root route/module mounting before request handling
- `isActionVisible` defaults to allow-all and is designed for future auth integration tasks.
- Unprefixed `/actions` paths are rejected to keep `/api/v1` enforcement consistent across server and consumers.

## Explicit Target Routing Guard (CMS-14)

- The server enforces explicit request routing for scoped API prefixes before handler execution.
- Supported routing forms on incoming requests:
  - Headers:
    - `X-MDCMS-Project`
    - `X-MDCMS-Environment`
  - Query params:
    - `project`
    - `environment`
- Header/query parity is required. If both forms are provided for the same field and differ, request fails with `TARGET_ROUTING_MISMATCH` (`400`).
- Missing required target values fail with `MISSING_TARGET_ROUTING` (`400`).
- Default scoped route policies:
  - Require `project + environment`:
    - `/api/v1/content`
    - `/api/v1/schema`
    - `/api/v1/webhooks`
    - `/api/v1/search`
    - `/api/v1/collaboration`
    - `/api/v1/media`
  - Require `project`:
    - `/api/v1/environments`
- Endpoints outside scoped policy (for example `/healthz`, `/api/v1/actions`, and module paths under `/api/v1/modules/*`) are not guarded by CMS-14 routing enforcement.

## Module Topology Integration

- Server module loading lives in `src/lib/module-loader.ts`.
- `@mdcms/server` consumes `@mdcms/modules` compile-time registry and mounts only bundled local module server surfaces.
- Loader output is deterministic and reports:
  - `loadedModuleIds`
  - `skippedModuleIds`
  - structured skip reasons (`missing-surface`, `incompatible`, `invalid-package`)
- `createServerRequestHandlerWithModules(...)` composes module load report + mounts + action catalog into the server runtime.
- Runtime logs emit module load summary lines for loaded and skipped modules.

## Content API Endpoints (CMS-21)

- Content routes are mounted under `/api/v1/content` in the server runtime.
- Implemented endpoints:
  - `GET /api/v1/content`
  - `GET /api/v1/content/:documentId`
  - `POST /api/v1/content`
  - `PUT /api/v1/content/:documentId`
  - `DELETE /api/v1/content/:documentId`
- List endpoint query contract supports:
  - `type`, `path`, `locale`, `slug`, `published`, `isDeleted`, `hasUnpublishedChanges`, `draft`, `resolve`, `project`, `environment`, `limit`, `offset`, `sort`, `order`, `q`
- Pagination defaults:
  - `limit` defaults to `20`
  - `limit` max is `100`

## DB Adapter + SQL Migrations (CMS-4)

- Database adapter baseline is implemented with Drizzle ORM and `postgres.js` in `src/lib/db.ts`.
- SQL migrations are managed via Drizzle Kit and committed in `apps/server/drizzle`.
- Server package scripts:
  - `bun run --cwd apps/server db:generate` (generate SQL migrations from Drizzle schema)
  - `bun run --cwd apps/server db:migrate` (apply pending SQL migrations)
- Docker Compose runs SQL migrations automatically through one-shot `db-migrate` before `server` starts accepting traffic.

### Core Schema Baseline (CMS-11 + CMS-12)

- Core tables created in `src/lib/db/schema.ts`:
  - `projects`
  - `environments`
  - `documents`
  - `document_versions`
  - `media`
  - `migrations`
- Named integrity constraints used by downstream tasks:
  - `unique_environment_id_project`
  - `unique_environment_per_project`
  - `fk_documents_env_project`
  - `fk_document_versions_env_project`
  - `fk_documents_published_version` (`ON DELETE RESTRICT`)
  - `unique_document_version`
- Required content indexes and partial unique indexes:
  - `idx_versions_document`
  - `idx_versions_scope`
  - `idx_documents_active_scope_type_locale_path`
  - `idx_documents_active_scope_updated_at`
  - `idx_documents_active_scope_unpublished_updated_at`
  - `idx_documents_scope_translation_group`
  - `uniq_documents_active_path`
  - `uniq_documents_active_translation_locale`
- UUID defaults use built-in `gen_random_uuid()` behavior from PostgreSQL 16; migrations intentionally do not create `pgcrypto` or `uuid-ossp` extensions.

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
- `bun --cwd apps/server run start` (run Bun HTTP server runtime entrypoint for local development)
