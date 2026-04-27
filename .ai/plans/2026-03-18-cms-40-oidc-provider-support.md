# CMS-40 OIDC Provider Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add startup-configured OIDC provider support to MDCMS using the Better Auth SSO plugin, canonical claims mapping, and a deterministic provider fixture matrix.

**Architecture:** MDCMS keeps Better Auth SSO as the protocol and callback engine while owning a typed startup config contract, provider allowlist, claims normalization, and fixture-backed regression coverage. The implementation should validate provider config at startup, reject unsupported provider IDs by default, and keep the CMS-40 scope limited to static instance configuration.

**Tech Stack:** Bun, Nx, TypeScript, Elysia, Better Auth, `@better-auth/sso`, Drizzle, Node test runner

---

### Task 1: Lock the spec and operator contract

**Files:**

- Modify: `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- Modify: `apps/server/README.md`
- Test: none

**Step 1: Re-read the approved CMS-40 design and current auth spec**

Run: `sed -n '1,260p' docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
Expected: current auth section and endpoint table with no OIDC startup-config contract beyond generic SSO mention

**Step 2: Update the auth spec with the CMS-40 OIDC delta**

Add the normative sections for:

- Better Auth SSO plugin as the MDCMS OIDC mechanism
- startup-only provider configuration
- supported provider IDs: `okta`, `azure-ad`, `google-workspace`, `auth0`
- canonical claims mapping
- OIDC sign-in and callback endpoint contracts
- deterministic failure categories

**Step 3: Update the server README with the operator workflow**

Document:

- the `MDCMS_AUTH_OIDC_PROVIDERS` startup env contract
- restart requirement after config changes
- supported provider IDs
- callback URL restrictions

**Step 4: Run formatting checks for the touched docs**

Run: `bun run format:check`
Expected: PASS

**Step 5: Commit**

```bash
git add docs/specs/SPEC-005-auth-authorization-and-request-routing.md apps/server/README.md
git commit -m "docs(auth): specify CMS-40 oidc provider contract"
```

### Task 2: Add typed OIDC startup config parsing

**Files:**

- Modify: `apps/server/src/lib/env.ts`
- Modify: `packages/shared/src/lib/runtime/env.ts` (only if shared parsing helpers are needed)
- Modify: `.env.example`
- Test: `packages/shared/src/lib/runtime/env.test.ts` or `apps/server/src/lib/*.test.ts`

**Step 1: Write the failing env parsing test**

Add focused tests covering:

- valid `MDCMS_AUTH_OIDC_PROVIDERS` JSON
- invalid JSON
- unsupported `providerId`
- duplicate provider IDs
- missing required fields

**Step 2: Run the targeted test to verify red**

Run: `bun test packages/shared/src/lib/runtime/env.test.ts`
Expected: FAIL on missing OIDC parsing behavior

**Step 3: Implement minimal OIDC env parsing**

Add a typed parser for:

- `MDCMS_AUTH_OIDC_PROVIDERS`
- provider shape: `providerId`, `issuer`, `domain`, `clientId`, `clientSecret`
- optional `scopes`
- optional `trustedOrigins`
- optional discovery overrides for endpoint and token auth method fixes

Reject malformed or unsupported provider entries with `INVALID_ENV`.

**Step 4: Re-run the targeted test**

Run: `bun test packages/shared/src/lib/runtime/env.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/env.ts packages/shared/src/lib/runtime/env.ts packages/shared/src/lib/runtime/env.test.ts .env.example
git commit -m "feat(server): parse startup oidc provider config"
```

### Task 3: Wire Better Auth SSO into the server auth service

**Files:**

- Modify: `apps/server/package.json`
- Modify: `apps/server/src/lib/auth.ts`
- Test: `apps/server/src/lib/auth.test.ts`

**Step 1: Write the failing auth-service tests**

Add tests that prove:

- configured provider profiles are registered at startup
- unsupported provider IDs are rejected
- callback URL validation is same-origin or relative-path only
- missing required claims fail deterministically

**Step 2: Run the targeted auth test**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: FAIL on missing SSO/OIDC behavior

**Step 3: Add the minimal Better Auth SSO wiring**

Implement:

- `@better-auth/sso` dependency
- plugin registration in `createAuthService(...)`
- startup provider registration from parsed env config
- canonical claims mapping
- deny-by-default provider allowlist
- callback URL validation

Do not add runtime registration APIs or Studio settings UI.

**Step 4: Re-run the targeted auth test**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: PASS for the new OIDC cases and existing auth coverage

**Step 5: Commit**

```bash
git add apps/server/package.json bun.lock apps/server/src/lib/auth.ts apps/server/src/lib/auth.test.ts
git commit -m "feat(server): add static oidc provider support"
```

### Task 4: Build the provider fixture matrix

**Files:**

- Create: `apps/server/src/lib/auth-oidc-fixtures.ts` or a similarly named test helper
- Modify: `apps/server/src/lib/auth.test.ts`
- Test: `apps/server/src/lib/auth.test.ts`

**Step 1: Write the failing fixture-driven tests**

Add one test per supported provider profile:

- `okta`
- `azure-ad`
- `google-workspace`
- `auth0`

Each fixture should prove:

- startup config is accepted
- sign-in route targets the expected provider
- canonical claims mapping yields the same MDCMS user fields

Add negative fixtures for:

- missing `email`
- missing `sub`
- unconfigured provider ID

**Step 2: Run the fixture tests to verify red**

Run: `bun test apps/server/src/lib/auth.test.ts --test-name-pattern="oidc|sso"`
Expected: FAIL until fixture helpers and mappings exist

**Step 3: Implement the minimal fixture helpers**

Use deterministic local fixtures, not live SaaS tenants.

The fixture helpers should:

- create provider config inputs
- create normalized user-info payloads per provider profile
- assert the same MDCMS user/session output

**Step 4: Re-run the fixture tests**

Run: `bun test apps/server/src/lib/auth.test.ts --test-name-pattern="oidc|sso"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/auth.test.ts apps/server/src/lib/auth-oidc-fixtures.ts
git commit -m "test(server): add oidc provider fixture matrix"
```

### Task 5: Verify the full CMS-40 slice

**Files:**

- Modify: none unless fixes are required
- Test: existing touched tests

**Step 1: Run formatting**

Run: `bun run format:check`
Expected: PASS

**Step 2: Run workspace checks**

Run: `bun run check`
Expected: PASS

**Step 3: Run the targeted auth suite**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: PASS

**Step 4: Inspect git status**

Run: `git status --short`
Expected: only task-scoped tracked changes; local-only files such as `docs/plans/` remain unstaged

**Step 5: Final commit if any verification fixes were needed**

```bash
git add <task-scoped-files>
git commit -m "test(server): finalize cms-40 verification"
```
