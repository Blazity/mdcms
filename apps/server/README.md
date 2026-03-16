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

## Studio Runtime Publication (CMS-34)

- Server exposes the canonical public Studio runtime publication endpoints:
  - `GET /api/v1/studio/bootstrap`
  - `GET /api/v1/studio/assets/:buildId/*`
- `prepareServerRequestHandlerWithModules(...)` prepares one startup-owned Studio runtime publication snapshot and injects it into the shared request handler.
- The bootstrap payload is served as `{ data: StudioBootstrapManifest }`.
- MVP bootstrap execution mode is fixed to `module`.
- `buildId` identifies an immutable asset snapshot. Asset URLs under `/api/v1/studio/assets/:buildId/*` are content-addressed and only serve files from the active published build root.
- Missing publications, unknown `buildId` values, and missing asset paths normalize to the standard `NOT_FOUND` error envelope.

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
- Server bootstrap uses the shared strict planner and fails fast on deterministic module bootstrap violations before route registration.
- Fail-fast startup violations are reported under `INVALID_MODULE_BOOTSTRAP` with deterministic `details.violations` entries.
- Startup is blocked on:
  - duplicate module ids
  - missing dependencies
  - dependency cycles
  - incompatible module manifests
  - duplicate server action ids
- `createServerRequestHandlerWithModules(...)` composes module load report + mounts + action catalog into the server runtime.
- Server module planning/routing still follows explicit composition-root dependency wiring (`module.mount(app, deps)`), without DI container/service-locator runtime patterns.

## Environment API Endpoints (CMS-18)

- Environment routes are mounted under `/api/v1/environments`.
- Implemented endpoints:
  - `GET /api/v1/environments`
  - `POST /api/v1/environments`
  - `DELETE /api/v1/environments/:id`
- Environment management rules:
  - explicit `project` routing is required
  - authenticated Studio session required
  - global `owner` or `admin` only
  - valid environment names and `extends` chains are derived from
    `mdcms.config.ts`
  - project provisioning guarantees a default `production` environment
  - deleting `production` or any environment with content/schema state returns
    deterministic `CONFLICT` (`409`)

## Content API Endpoints (CMS-21)

- Content routes are mounted under `/api/v1/content` in the server runtime.
- Implemented endpoints:
  - `GET /api/v1/content`
  - `GET /api/v1/content/:documentId`
  - `GET /api/v1/content/:documentId/versions`
  - `GET /api/v1/content/:documentId/versions/:version`
  - `POST /api/v1/content`
  - `PUT /api/v1/content/:documentId`
  - `DELETE /api/v1/content/:documentId`
  - `POST /api/v1/content/:documentId/restore`
  - `POST /api/v1/content/:documentId/versions/:version/restore`
  - `POST /api/v1/content/:documentId/publish`
  - `POST /api/v1/content/:documentId/unpublish`
- List endpoint query contract supports:
  - `type`, `path`, `locale`, `slug`, `published`, `isDeleted`, `hasUnpublishedChanges`, `draft`, `resolve`, `project`, `environment`, `limit`, `offset`, `sort`, `order`, `q`
- Version-history list query contract supports:
  - `limit`, `offset`
- Pagination defaults:
  - `limit` defaults to `20`
  - `limit` max is `100`
- Read semantics:
  - default (`draft` omitted or `draft=false`) returns only published snapshots from `document_versions` for non-deleted documents.
  - `draft=true` returns mutable head rows from `documents`.
- Publish lifecycle semantics:
  - publish appends immutable row to `document_versions`, updates `documents.published_version`, and sets `documents.has_unpublished_changes = FALSE`.
  - unpublish clears `documents.published_version` and sets `documents.has_unpublished_changes = TRUE`.
  - publish accepts optional `change_summary` (or `changeSummary`) request field and stores it in `document_versions.change_summary`.
- Restore/version-history semantics:
  - `POST /api/v1/content/:documentId/restore` is exact undelete of the current head row. It clears `documents.is_deleted`, preserves the current head content and `published_version`, and does not append a new immutable version row.
  - `GET /api/v1/content/:documentId/versions` returns immutable publish history for the routed document in descending version order.
  - `GET /api/v1/content/:documentId/versions` uses the standard list envelope `{ data, pagination }`.
  - `GET /api/v1/content/:documentId/versions/:version` returns one immutable publish snapshot.
  - `POST /api/v1/content/:documentId/versions/:version/restore` restores a historical snapshot back into the mutable head.
  - version restore defaults to `targetStatus=draft`, which updates only the mutable head row, keeps existing `published_version`, and marks `documents.has_unpublished_changes = TRUE`.
  - `targetStatus=published` appends a fresh immutable version row at HEAD, updates `documents.published_version`, and leaves history strictly linear and append-only.
  - restore flows return deterministic `CONTENT_PATH_CONFLICT` (`409`) when reactivating a head row or restoring a version would collide with an active `(project, environment, locale, path)` tuple.
- Content storage is DB-backed (`documents` table), not process memory.
- List/integer query parsing is strict (`limit=1abc` is rejected with `INVALID_QUERY_PARAM`).
- Content endpoints are deny-by-default and require either:
  - valid Studio session cookie, or
  - valid API key with required operation scope + allowed `(project, environment)` tuple.
- `POST /api/v1/content` also supports locale-variant creation for CMS-20:
  - omit `sourceDocumentId` to create a brand new logical document with a fresh
    `translationGroupId`
  - provide `sourceDocumentId` to create a new locale variant in the source
    document's translation group
  - missing, out-of-scope, or soft-deleted sources return `NOT_FOUND` (`404`)
  - duplicate active locales inside one translation group return
    `TRANSLATION_VARIANT_CONFLICT` (`409`)
  - when synced schema registry data is present for the source type, variant
    creation is limited to localized types and supported locales

## Session Auth Endpoints (CMS-36)

- Server-side Studio session auth is implemented with `better-auth` + Drizzle adapter.
- Session routes are mounted under `/api/v1/auth`.
- Implemented endpoints:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/session`
  - `POST /api/v1/auth/logout`
- Login issues an HttpOnly session cookie (Better Auth `session_token`).
- Session validation is deny-by-default: requests without a valid session token receive `401 UNAUTHORIZED`.
- Better Auth native endpoints are also available under `/api/v1/auth/*` (for example `POST /api/v1/auth/sign-up/email`).

## Session Security Policy (CMS-37)

- Session cookie policy:
  - `HttpOnly`
  - `SameSite=Strict`
  - `Path=/`
  - `Secure` by default (including local/dev), with explicit local override via `MDCMS_AUTH_INSECURE_COOKIES=true`.
- Session lifetime policy:
  - inactivity timeout: `2h` rolling (`expiresIn=7200`).
  - absolute max age: `12h` from initial issue time (enforced server-side on each session check).
- Session ID rotation:
  - on successful sign-in, older sessions for the same user are revoked.
- Admin session revocation endpoint:
  - `POST /api/v1/auth/users/:userId/sessions/revoke-all`
  - requires authenticated admin session.
  - default admin identities are sourced from env allowlists:
    - `MDCMS_AUTH_ADMIN_USER_IDS` (comma-separated user IDs)
    - `MDCMS_AUTH_ADMIN_EMAILS` (comma-separated emails)
  - `createAuthService(...)` accepts `isAdminSession(session)` to plug a role
    source (for example CMS-44 RBAC) without changing this endpoint contract.
  - deterministic semantics: `401` unauthenticated, `403` non-admin, `404` unknown user.

## Password Login Backoff (CMS-39)

- MDCMS owns password failed-attempt throttling for the password-entry routes:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/cli/login/authorize` when credentials are submitted
- Backoff is keyed by normalized email for MVP scope.
- Invalid credentials outside active lockout remain `401 AUTH_INVALID_CREDENTIALS`.
- Active lockout returns `429 AUTH_BACKOFF_ACTIVE` and emits `Retry-After`.
- Successful password sign-in resets stored backoff state.
- A quiet window of 15 minutes without failed attempts resets backoff state.
- The MVP schedule is capped exponential delay: `1s`, `2s`, `4s`, `8s`, `16s`, `32s`.
- Better Auth's built-in rate limiting is not the source of truth for this contract because MDCMS performs password verification through server-side `auth.api` calls inside its own auth wrapper.

## RBAC Engine + Runtime Enforcement (CMS-44)

- RBAC grants are persisted in `rbac_grants` and evaluated with most-permissive
  precedence across:
  - global scope
  - project scope
  - folder-prefix scope (`documents.path` prefix)
- Role capabilities:
  - `owner` and `admin`: instance-wide only (global scope)
  - `editor`: read/write draft, publish/unpublish, delete
  - `viewer`: read-only
- Owner invariants:
  - exactly one active Owner must exist at all times
  - remove/demote-last-owner operations must fail deterministically with
    `OWNER_INVARIANT_VIOLATION` (`409`)
- Session-authenticated content authorization now applies RBAC checks in
  addition to auth/session validity:
  - list/get/create/update/delete routes evaluate role permissions using
    request target scope and document path context where available
- Admin session-revocation endpoint accepts:
  - global `owner`/`admin` RBAC grants, or
  - fallback env allowlists (`MDCMS_AUTH_ADMIN_USER_IDS`,
    `MDCMS_AUTH_ADMIN_EMAILS`) for bootstrap compatibility.

## Collaboration Handshake Authorization (CMS-45)

- Collaboration handshake guard is mounted at `GET /api/v1/collaboration`.
- Required query tuple:
  - `project`
  - `environment`
  - `documentId` (UUID)
- Required security checks:
  - `Origin` must match `MDCMS_COLLAB_ALLOWED_ORIGINS` (comma-separated allowlist)
  - API keys are explicitly rejected for collaboration
  - only session auth is accepted
  - document must exist in requested `(project, environment)` scope
  - RBAC must allow both draft read (`content:read:draft`) and write (`content:write`) on `documents.path`
- Deterministic collaboration close semantics for socket adapters:
  - `4401` for revoked/expired/missing session
  - `4403` for origin/scope/document/RBAC or API-key-forbidden conditions
- Current endpoint acts as handshake authorization boundary and returns `426`
  after successful auth checks, ready for WS transport adapters in downstream
  collaboration tasks.

## API Key Lifecycle + Authorization (CMS-42 + CMS-43)

- API key management endpoints:
  - `GET /api/v1/auth/api-keys` (metadata only, session required)
  - `POST /api/v1/auth/api-keys` (create + one-time key reveal, session required)
  - `POST /api/v1/auth/api-keys/:keyId/revoke` (immediate revoke, session required)
- API keys are generated with `mdcms_key_` prefix and hashed at rest (`api_keys.key_hash`).
- Keys store:
  - operation scopes
  - `(project, environment)` context allowlist tuples
  - optional expiry + revoke timestamps
- Deny-by-default operation scopes enforced:
  - `content:read`
  - `content:read:draft`
  - `content:write`
  - `content:write:draft` (legacy compatibility alias, write-only)
  - `content:publish`
  - `content:delete`
  - `schema:read`
  - `schema:write`
  - `media:upload`
  - `media:delete`
  - `webhooks:read`
  - `webhooks:write`
  - `environments:clone`
  - `environments:promote`
  - `migrations:run`
- API keys authorize access only; explicit request routing (`project` + `environment`) remains mandatory.

## CLI Browser Login Handshake (CMS-79)

- Browser-based CLI auth endpoints:
  - `POST /api/v1/auth/cli/login/start`
  - `GET /api/v1/auth/cli/login/authorize`
  - `POST /api/v1/auth/cli/login/authorize`
  - `POST /api/v1/auth/cli/login/exchange`
- Start endpoint requirements:
  - validates tuple `(project, environment)`
  - validates loopback `redirectUri` (`http://127.0.0.1|localhost|::1:<port>`)
  - stores one-time challenge with TTL and hashed state
- Authorize/exchange behavior:
  - authorization requires valid browser session (or interactive email/password on authorize form)
  - one-time code exchange issues scoped API key for requested tuple
  - login-generated default scopes are: `content:read`, `content:read:draft`, `content:write`
  - deterministic failure codes include:
    - `LOGIN_CHALLENGE_EXPIRED`
    - `LOGIN_CHALLENGE_USED`
    - `INVALID_LOGIN_EXCHANGE`
- Self-revoke endpoint:
  - `POST /api/v1/auth/api-keys/self/revoke`
  - uses Bearer API key from `Authorization` header
  - revokes only the authenticated key instance

## Session Auth Endpoints (CMS-36)

- Server-side Studio session auth is implemented with `better-auth` + Drizzle adapter.
- Session routes are mounted under `/api/v1/auth`.
- Implemented endpoints:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/session`
  - `POST /api/v1/auth/logout`
- Login issues an HttpOnly session cookie (Better Auth `session_token`).
- Session validation is deny-by-default: requests without a valid session token receive `401 UNAUTHORIZED`.
- Better Auth native endpoints are also available under `/api/v1/auth/*` (for example `POST /api/v1/auth/sign-up/email`).

## API Key Lifecycle (CMS-42)

- API key management endpoints:
  - `GET /api/v1/auth/api-keys` (metadata only, session required)
  - `POST /api/v1/auth/api-keys` (create + one-time key reveal, session required)
  - `POST /api/v1/auth/api-keys/:keyId/revoke` (immediate revoke, session required)
- API keys are generated with `mdcms_key_` prefix and hashed at rest (`api_keys.key_hash`).
- Keys support:
  - labels
  - optional expiry
  - immediate revoke
  - rotation workflow (create new key, migrate consumers, revoke old key)

## DB Adapter + SQL Migrations (CMS-4)

- Database adapter baseline is implemented with Drizzle ORM and `postgres.js` in `src/lib/db.ts`.
- SQL migrations are managed via Drizzle Kit and committed in `apps/server/drizzle`.
- Server package scripts:
  - `bun run --cwd apps/server db:generate` (generate SQL migrations from Drizzle schema)
  - `bun run --cwd apps/server db:migrate` (apply pending SQL migrations)
  - `bun run --cwd apps/server demo:seed` (idempotently ensure compose demo API key, demo user, and demo content set)
- Docker Compose runs SQL migrations and `demo:seed` automatically through one-shot `db-migrate` before `server` starts accepting traffic.
- Demo seed defaults (override via env):  
  `MDCMS_DEMO_API_KEY=mdcms_key_demo_local_compose_seed_2026_read`,  
  `MDCMS_DEMO_PROJECT=marketing-site`,  
  `MDCMS_DEMO_ENVIRONMENT=staging`,  
  `MDCMS_DEMO_SEED_USER_EMAIL=demo@mdcms.local`,  
  `MDCMS_DEMO_SEED_USER_PASSWORD=Demo12345!`.
- Seed content set (in `MDCMS_DEMO_PROJECT/MDCMS_DEMO_ENVIRONMENT`):
  - `post` / `content/posts/hello-mdcms` (`md`)
  - `post` / `content/posts/pull-push-demo` (`md`)
  - `page` / `content/pages/about` (`mdx`)

### Core Schema Baseline (CMS-11 + CMS-12)

- Core tables created in `src/lib/db/schema.ts`:
  - `users`
  - `sessions`
  - `accounts`
  - `verifications`
  - `api_keys`
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
