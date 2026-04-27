# CMS-38 CSRF Enforcement Design

Date: 2026-03-12
Status: approved in chat, local planning artifact only

## Goal

Implement CSRF enforcement for session-authenticated, state-changing Studio API requests without changing API-key behavior.

## Source Of Truth

- Roadmap task: `CMS-38` in `ROADMAP_TASKS.md`
- Owning auth spec: `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- Related endpoint specs:
  - `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
  - `docs/specs/SPEC-004-schema-system-and-sync.md`
  - `docs/specs/SPEC-009-i18n-and-environments.md`
  - `docs/specs/SPEC-006-studio-runtime-and-ui.md`

## Approved Spec Delta

Add a concrete CSRF contract to `SPEC-005`:

- Session-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests require CSRF validation.
- The server issues a readable cookie named `mdcms_csrf`.
- The client must echo the same value in the `x-mdcms-csrf-token` request header.
- A state-changing session request is accepted only when:
  - the Studio session cookie is valid,
  - the `mdcms_csrf` cookie is present,
  - the `x-mdcms-csrf-token` header is present,
  - the cookie value and header value match.
- API-key authenticated requests are exempt from CSRF enforcement.
- Read-only requests (`GET`, `HEAD`, `OPTIONS`) are exempt.
- Public auth routes are exempt:
  - `/api/v1/auth/login`
  - `/api/v1/auth/sign-up/email`
  - `/api/v1/auth/sign-in/email`
  - `/api/v1/auth/cli/login/*`
- CSRF failures return deterministic authz semantics:
  - status `403`
  - code `FORBIDDEN`
  - message `Valid CSRF token is required for session-authenticated state-changing requests.`

## Server Design

Keep CSRF enforcement server-side in `apps/server/src/lib/auth.ts`, with a shared helper used by first-party mutation handlers.

### Token Lifecycle

- Mint a random CSRF token on successful `POST /api/v1/auth/login`.
- Also mint and return the token on successful session bootstrap reads:
  - `GET /api/v1/auth/session`
  - `GET /api/v1/auth/get-session`
- Clear the CSRF cookie on:
  - `POST /api/v1/auth/logout`
  - `POST /api/v1/auth/sign-out`

This lets the Studio recover a token when the browser already has a valid session cookie.

### Enforcement Rule

The shared helper should:

1. Skip CSRF validation when the request is not state-changing.
2. Skip CSRF validation when the request authenticates with `Authorization: Bearer ...` because that is an API-key flow, not a cookie-backed Studio session.
3. If no bearer token is present, check whether a valid session exists.
4. If there is a valid session and the request is state-changing, require matching `mdcms_csrf` cookie and `x-mdcms-csrf-token` header values.
5. If there is no valid session, do not transform the failure; let the existing auth path return `401`.

This preserves current `401` vs `403` behavior and keeps the scope explicit.

## Endpoint Coverage

Apply the guard only to first-party state-changing routes that can be session-authenticated:

- Auth mutation routes in `apps/server/src/lib/auth.ts`
  - `POST /api/v1/auth/logout`
  - `POST /api/v1/auth/api-keys`
  - `POST /api/v1/auth/api-keys/:keyId/revoke`
  - `POST /api/v1/auth/users/:userId/sessions/revoke-all`
- Content mutations in `apps/server/src/lib/content-api/routes.ts`
- Schema sync mutation in `apps/server/src/lib/schema-api.ts`
- Environment mutations in `apps/server/src/lib/environments-api.ts`

Do not apply the guard to:

- login and sign-up routes
- CLI browser-login routes
- API-key self-revoke route
- read-only routes

## Testing Strategy

Primary acceptance tests:

- session mutation succeeds with matching CSRF cookie and header
- session mutation fails when header is missing
- session mutation fails when CSRF cookie is missing
- session mutation fails when values mismatch
- API-key mutation remains allowed without CSRF
- login/session bootstrap routes emit `mdcms_csrf`
- logout/sign-out clear `mdcms_csrf`

Route-level regression coverage:

- content mutation test in `apps/server/src/lib/content-api.test.ts`
- schema sync test in `apps/server/src/lib/schema-api.test.ts`
- environment mutation test in `apps/server/src/lib/environments-api.test.ts`

## Documentation

- Update `SPEC-005` with the concrete CSRF contract.
- Add a short code comment near the shared guard in `auth.ts` explaining the session-only enforcement rule.

## Validation

Run from workspace root:

- `bun test apps/server/src/lib/auth.test.ts`
- `bun test apps/server/src/lib/content-api.test.ts`
- `bun test apps/server/src/lib/schema-api.test.ts`
- `bun test apps/server/src/lib/environments-api.test.ts`
- `bun run format:check`
- `bun run check`

## Notes

- `docs/plans/` is intentionally local-only in this repository and should remain untracked.
