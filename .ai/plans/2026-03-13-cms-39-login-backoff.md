# CMS-39 Login Backoff And Failed-Attempt Throttling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic password-login throttling with persisted exponential backoff, `429 AUTH_BACKOFF_ACTIVE` responses during active lockout, and reset-on-success behavior for the MDCMS auth flows owned by `SPEC-005`.

**Architecture:** Update `SPEC-005` first, then add a small persisted throttle table in the server schema so backoff state survives process restarts and can be tested deterministically. Route both `POST /api/v1/auth/login` and the credential-submission branch of `POST /api/v1/auth/cli/login/authorize` through a shared auth helper that checks active backoff, records failures, clears state on success, and surfaces `Retry-After` on `429`.

**Tech Stack:** Bun, TypeScript, Elysia, better-auth, Drizzle, Postgres, Bun test

---

### Task 1: Codify The Contract In The Owning Spec

**Files:**

- Modify: `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- Modify: `apps/server/README.md`

**Step 1: Update the normative Session Security text**

Add the approved throttling contract under the existing Session Security section:

```md
- Failed password login attempts apply exponential backoff keyed by normalized email.
- Active backoff rejects password-entry requests with `AUTH_BACKOFF_ACTIVE` (`429`) and `Retry-After`.
- Successful password sign-in resets the stored backoff state.
```

**Step 2: Update the auth endpoint table**

Modify the deterministic error column for:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/cli/login/authorize`

so the table includes `AUTH_BACKOFF_ACTIVE` (`429`) in addition to `AUTH_INVALID_CREDENTIALS` (`401)`.

**Step 3: Add the operator-facing server README note**

Document:

- which routes are protected
- that `Retry-After` is emitted on active backoff
- that Better Auth rate limiting is not relied on for this contract

**Step 4: Verify the spec delta against CMS-39 acceptance**

Confirm these exact points are present before code changes:

- observable backoff via `429`
- deterministic error code `AUTH_BACKOFF_ACTIVE`
- protected flows limited to password-entry routes
- reset rules: success and quiet-window expiry

**Step 5: Commit the docs checkpoint if using commit gates**

```bash
git add docs/specs/SPEC-005-auth-authorization-and-request-routing.md apps/server/README.md
git commit -m "docs: define login backoff contract"
```

### Task 2: Add Schema Coverage For Persisted Throttle State

**Files:**

- Modify: `apps/server/src/lib/db/schema.ts`
- Create: `apps/server/drizzle/0008_<name>.sql`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Create: `apps/server/drizzle/meta/0008_snapshot.json`
- Modify: `apps/server/src/lib/db/schema.contract.test.ts`

**Step 1: Add the new Drizzle table definition**

Add a table like:

```ts
export const authLoginBackoffs = pgTable(
  "auth_login_backoffs",
  {
    id: uuid().defaultRandom().primaryKey(),
    loginKey: text().notNull(),
    failureCount: integer().notNull().default(0),
    firstFailedAt: timestamp({ withTimezone: true }).notNull(),
    lastFailedAt: timestamp({ withTimezone: true }).notNull(),
    nextAllowedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uniq_auth_login_backoffs_login_key").on(table.loginKey),
    index("idx_auth_login_backoffs_next_allowed").on(table.nextAllowedAt),
  ],
);
```

If the team prefers no surrogate `id`, use `loginKey` as the primary key instead, but keep the final schema and migration aligned.

**Step 2: Write the SQL migration and snapshot**

Create the migration that adds `auth_login_backoffs` plus the required named index/constraint, then update the journal and latest snapshot under `apps/server/drizzle/meta/`.

**Step 3: Extend the schema contract test**

Add `public.auth_login_backoffs` to the expected tables and assert the named unique/index entries:

```ts
"public.auth_login_backoffs": [
  "id",
  "login_key",
  "failure_count",
  "first_failed_at",
  "last_failed_at",
  "next_allowed_at",
  "created_at",
  "updated_at",
]
```

**Step 4: Run the schema contract test**

Run: `bun test apps/server/src/lib/db/schema.contract.test.ts`

Expected: FAIL until the new table, migration artifacts, and snapshot assertions all match.

**Step 5: Commit the schema checkpoint**

```bash
git add apps/server/src/lib/db/schema.ts apps/server/drizzle apps/server/src/lib/db/schema.contract.test.ts
git commit -m "feat(server): add persisted login backoff table"
```

### Task 3: Add Red Auth Tests For Backoff Semantics

**Files:**

- Modify: `apps/server/src/lib/auth.test.ts`

**Step 1: Add clock-control helpers for auth throttling tests**

Prefer a narrow helper local to this test file:

```ts
async function withMockedNow<T>(
  value: number,
  run: () => Promise<T>,
): Promise<T> {
  const originalNow = Date.now;
  Date.now = () => value;
  try {
    return await run();
  } finally {
    Date.now = originalNow;
  }
}
```

If `auth.ts` already accepts a clock dependency by the time you implement this, use that instead of monkey-patching.

**Step 2: Add failing tests for direct login**

Add tests that prove:

- first invalid password attempt returns `401 AUTH_INVALID_CREDENTIALS`
- immediate retry returns `429 AUTH_BACKOFF_ACTIVE`
- `Retry-After` reflects the stored delay
- advancing beyond the delay allows another credential check
- successful login clears the backoff row

Example assertion shape:

```ts
assert.equal(response.status, 429);
assert.equal(body.error.code, "AUTH_BACKOFF_ACTIVE");
assert.equal(response.headers.get("retry-after"), "1");
```

**Step 3: Add failing tests for CLI authorize**

Cover the credential-submission branch of `POST /api/v1/auth/cli/login/authorize`:

- invalid credentials return `401`
- immediate retry while locked returns `429`
- active lockout does not mutate the challenge into an authorized state

**Step 4: Run the focused auth suite**

Run: `bun test apps/server/src/lib/auth.test.ts`

Expected: FAIL on the new throttling assertions because no backoff state exists yet.

**Step 5: Commit the red-test checkpoint**

```bash
git add apps/server/src/lib/auth.test.ts
git commit -m "test(server): add CMS-39 login backoff coverage"
```

### Task 4: Implement Shared Login Backoff Helpers

**Files:**

- Modify: `apps/server/src/lib/auth.ts`

**Step 1: Add constants and helper functions near the auth constants**

Add small, explicit constants:

```ts
const LOGIN_BACKOFF_RESET_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BACKOFF_DELAYS_SECONDS = [1, 2, 4, 8, 16, 32] as const;
```

Add helpers for:

- normalizing email to a throttle key
- reading the current backoff row
- deciding whether the row has expired into a fresh window
- computing the next delay
- computing `Retry-After`
- upserting failure state
- clearing state on success

**Step 2: Add a deterministic runtime error for active backoff**

Throw a `RuntimeError` like:

```ts
throw new RuntimeError({
  code: "AUTH_BACKOFF_ACTIVE",
  message: `Too many failed login attempts. Retry after ${retryAfterSeconds} seconds.`,
  statusCode: 429,
});
```

Keep the header emission path separate so the response also includes:

```ts
{ "retry-after": String(retryAfterSeconds) }
```

**Step 3: Route password login through the helper flow**

Refactor `loginWithEmailPassword(...)` so it:

1. normalizes the email
2. checks for active backoff before calling Better Auth
3. calls `auth.api.signInEmail(...)`
4. on invalid credentials, records the next backoff state and rethrows `AUTH_INVALID_CREDENTIALS`
5. on success, clears the backoff row before returning the session data

Avoid changing unrelated session, CSRF, API key, or SSO behavior.

**Step 4: Re-run the focused auth suite**

Run: `bun test apps/server/src/lib/auth.test.ts`

Expected: the direct-login throttling tests now pass; any remaining failures should be limited to route-response header plumbing or CLI-path integration.

**Step 5: Commit the helper implementation**

```bash
git add apps/server/src/lib/auth.ts
git commit -m "feat(server): add shared login backoff helpers"
```

### Task 5: Surface `429` Headers On Both Password Routes

**Files:**

- Modify: `apps/server/src/lib/auth.ts`

**Step 1: Extend the auth service result shape if needed**

If `loginWithEmailPassword(...)` needs to return metadata for callers, keep it minimal:

```ts
type LoginResult = {
  session: StudioSession;
  setCookie: string;
};
```

For throttled requests, prefer central runtime-error handling with support for extra response headers rather than returning unions from every auth path.

**Step 2: Ensure `executeWithRuntimeErrorsHandled(...)` can emit `Retry-After`**

If the runtime error handler already supports extra headers, reuse that. If not, extend the smallest shared error path so a `RuntimeError` can carry response headers without changing unrelated API behavior.

**Step 3: Verify both routes now share the same throttle behavior**

Confirm:

- `POST /api/v1/auth/login`
- password-backed `POST /api/v1/auth/cli/login/authorize`

both return `429 AUTH_BACKOFF_ACTIVE` with `Retry-After` when blocked.

**Step 4: Run auth tests again**

Run: `bun test apps/server/src/lib/auth.test.ts`

Expected: PASS

**Step 5: Commit the response-plumbing checkpoint**

```bash
git add apps/server/src/lib/auth.ts
git commit -m "feat(server): return retry-after for throttled logins"
```

### Task 6: Finish Docs, Formatting, And Validation

**Files:**

- Modify: `apps/server/README.md`
- Modify: `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- Modify: `apps/server/src/lib/auth.ts`
- Modify: `apps/server/src/lib/auth.test.ts`
- Modify: `apps/server/src/lib/db/schema.ts`
- Modify: `apps/server/src/lib/db/schema.contract.test.ts`
- Modify: `apps/server/drizzle/...`

**Step 1: Add the point-of-use code comment**

Place one short comment near the throttling helper in `auth.ts` explaining:

```ts
// MDCMS owns failed-attempt backoff here because server-side auth.api calls are outside Better Auth's built-in rate limiter.
```

**Step 2: Run the focused verification commands**

Run:

```bash
bun test apps/server/src/lib/auth.test.ts
bun test apps/server/src/lib/db/schema.contract.test.ts
```

Expected: PASS

**Step 3: Run workspace-level verification**

Run:

```bash
bun run format:check
bun run check
```

Expected: PASS

If `bun run check` is too broad for local-only blockers unrelated to this task, capture the exact failure and stop before claiming success.

**Step 4: Inspect git status for task scope hygiene**

Run:

```bash
git status --short
```

Confirm:

- only `CMS-39`-relevant tracked files are modified
- local-only paths such as `docs/plans/`, `AGENTS.md`, `ROADMAP_TASKS.md`, `.claude/`, and `.codex/` are not staged

**Step 5: Commit the final task-scoped implementation**

```bash
git add docs/specs/SPEC-005-auth-authorization-and-request-routing.md apps/server/README.md apps/server/src/lib/auth.ts apps/server/src/lib/auth.test.ts apps/server/src/lib/db/schema.ts apps/server/src/lib/db/schema.contract.test.ts apps/server/drizzle
git commit -m "feat(server): implement login backoff throttling"
```
