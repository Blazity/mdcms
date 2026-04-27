# CMS-39 Login Backoff And Failed-Attempt Throttling Design

Date: 2026-03-13
Status: approved in chat, local planning artifact only

## Goal

Implement deterministic failed-password throttling for MDCMS password-entry flows, with exponential backoff that becomes observable as `429 AUTH_BACKOFF_ACTIVE` responses.

## Source Of Truth

- Roadmap task: `CMS-39` in `ROADMAP_TASKS.md`
- Owning auth spec: `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- Server auth implementation: `apps/server/src/lib/auth.ts`
- Server auth docs: `apps/server/README.md`

## Approved Spec Delta

Add a concrete throttling contract to `SPEC-005`:

- Failed password login attempts use exponential backoff.
- The protected password-entry routes are:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/cli/login/authorize` when credentials are submitted
- Backoff state is keyed by normalized email for MVP scope.
- Invalid credentials without an active backoff return:
  - status `401`
  - code `AUTH_INVALID_CREDENTIALS`
- Requests made while backoff is active return:
  - status `429`
  - code `AUTH_BACKOFF_ACTIVE`
  - header `Retry-After: <seconds>`
- Backoff resets on successful password sign-in.
- Backoff also resets after a quiet window of 15 minutes without failed attempts.
- Exponential schedule for MVP:
  - attempt 1 sets next delay to `1s`
  - attempt 2 sets next delay to `2s`
  - attempt 3 sets next delay to `4s`
  - attempt 4 sets next delay to `8s`
  - attempt 5 sets next delay to `16s`
  - attempt 6+ cap at `32s`

## Server Design

Keep Better Auth responsible for credential verification and session issuance, but own the throttling contract in MDCMS.

### Why Not Better Auth Rate Limiting

- Better Auth has a built-in rate limiter, but MDCMS currently calls `auth.api.signInEmail(...)` server-side in its own wrapper.
- Better Auth documents that server-side `auth.api` requests are not rate limited.
- The built-in limiter is request-path based, while `CMS-39` needs failed-attempt-aware exponential backoff with MDCMS-owned status codes and reset rules.

### Persistence Model

Persist throttle state in Postgres so behavior is deterministic across process restarts and test runs.

Proposed table shape:

- `login_key` text primary/unique key
- `failure_count` integer
- `first_failed_at` timestamp
- `last_failed_at` timestamp
- `next_allowed_at` timestamp
- `created_at` timestamp
- `updated_at` timestamp

`login_key` should be the normalized email used for password login attempts.

### Request Flow

For `POST /api/v1/auth/login` and password-backed CLI authorize:

1. Normalize the email.
2. Read the throttle row for that login key.
3. If `next_allowed_at > now`, reject immediately with `429 AUTH_BACKOFF_ACTIVE` and `Retry-After`.
4. If the quiet window has elapsed, treat the row as reset before processing this attempt.
5. Call Better Auth to verify credentials.
6. On success:
   - delete or reset the throttle row
   - continue with existing session issuance behavior
7. On invalid credentials:
   - increment `failure_count`
   - compute the next delay using the capped exponential schedule
   - set `last_failed_at` and `next_allowed_at`
   - return the existing `401 AUTH_INVALID_CREDENTIALS`

This keeps credential failures and active lockout as separate deterministic states.

## Endpoint Coverage

Apply the throttle guard only to password-entry routes owned by `SPEC-005`:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/cli/login/authorize` when `email` and `password` are present

Do not apply it to:

- `GET /api/v1/auth/cli/login/authorize`
- API key flows
- session reads
- logout/revoke routes
- future SSO providers

## Error Handling

- Active backoff returns:
  - HTTP `429`
  - code `AUTH_BACKOFF_ACTIVE`
  - message `Too many failed login attempts. Retry after <seconds> seconds.`
  - `Retry-After` response header
- Invalid credentials outside active backoff keep the existing:
  - HTTP `401`
  - code `AUTH_INVALID_CREDENTIALS`
- Internal persistence failures remain `500 INTERNAL_ERROR`

## Testing Strategy

Primary acceptance coverage should prove:

- repeated failed password attempts create exponential backoff state
- login requests made during backoff return `429` with `Retry-After`
- successful login clears backoff state
- quiet-window expiry resets the counter
- CLI browser authorize shares the same throttling behavior when credentials are posted

Suggested test technique:

- add focused auth tests in `apps/server/src/lib/auth.test.ts`
- inject or control the clock in auth throttling helpers, or temporarily stub `Date.now()` in tests
- validate both response semantics and persisted DB state where that gives better signal

## Documentation

- Update `SPEC-005` with the concrete `429` contract.
- Update `apps/server/README.md` with the new auth abuse behavior and operator-visible response semantics.
- Add a short code comment near the throttling helper in `auth.ts` explaining why MDCMS owns this logic instead of relying on Better Auth rate limiting.

## Validation

Run from workspace root:

- `bun test apps/server/src/lib/auth.test.ts`
- `bun test apps/server/src/lib/db/schema.contract.test.ts`
- `bun run format:check`
- `bun run check`

## Notes

- `docs/plans/` is intentionally local-only in this repository and should remain untracked.
