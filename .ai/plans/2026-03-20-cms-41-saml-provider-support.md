# CMS-41 SAML Provider Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add startup-configured SAML 2.0 provider support to MDCMS using the existing Better Auth SSO plugin, provider-presence enablement, and deterministic ACS/metadata regression coverage.

**Architecture:** Extend the current OIDC-only startup auth pipeline into a mixed static SSO registry. Keep OIDC and SAML operator config separate in env parsing, normalize both into Better Auth `defaultSSO` providers at startup, and add SAML-specific ACS plus SP metadata coverage without introducing runtime provider management or IdP-initiated flows.

**Tech Stack:** Bun, Nx, TypeScript, Elysia, Better Auth, `@better-auth/sso`, Drizzle, `samlify`, Node test runner

---

## Spec Delta

- `docs/specs/SPEC-005-auth-authorization-and-request-routing.md` now defines startup-configured `MDCMS_AUTH_SAML_PROVIDERS`, provider-presence enablement, canonical SAML attribute mapping, and the `/api/v1/auth/sso/saml2/sp/acs/:providerId` and `/api/v1/auth/sso/saml2/sp/metadata` endpoints.
- The affected behavior is in the server auth boundary only: startup env parsing, Better Auth SSO provider registration, shared `POST /api/v1/auth/sign-in/sso`, SAML ACS handling, and SP metadata exposure.
- Acceptance criteria that depend on this delta:
  - “disabled by default” now means no SAML providers are available when `MDCMS_AUTH_SAML_PROVIDERS` is absent or empty
  - “enabled instances pass login flows” now means configured SAML providers complete SP-initiated sign-in and establish the normal MDCMS session
  - deterministic failures must map to `INVALID_ENV`, `SSO_PROVIDER_NOT_CONFIGURED`, `AUTH_SAML_REQUIRED_ATTRIBUTE_MISSING`, and `AUTH_PROVIDER_ERROR`

## Conflict Note

- `ROADMAP_TASKS.md` still says `SAML beta-flag integration path`, but the owning spec has removed `beta` and the extra enablement flag.
- Execute against the stricter spec-owned contract, not the stale roadmap wording.

## Workspace Note

- The current worktree already has unrelated unstaged changes in `packages/shared/`.
- Implement this plan in a fresh worktree or with strict staged-file discipline so CMS-41 stays isolated.

### Task 1: Add typed SAML startup config parsing

**Files:**

- Modify: `apps/server/src/lib/env.ts`
- Modify: `apps/server/src/lib/env.test.ts`
- Modify: `.env.example`

**Step 1: Write the failing env parsing tests**

Add focused tests for:

- valid `MDCMS_AUTH_SAML_PROVIDERS` parsing
- absent or blank `MDCMS_AUTH_SAML_PROVIDERS` returning `[]`
- malformed JSON
- non-array payload
- missing required SAML fields (`providerId`, `issuer`, `domain`, `entryPoint`, `cert`)
- duplicate SAML domains
- duplicate `providerId` across OIDC and SAML provider sets

**Step 2: Run the targeted env test to verify red**

Run: `bun test apps/server/src/lib/env.test.ts`
Expected: FAIL on missing SAML parsing/types or missing cross-protocol uniqueness checks

**Step 3: Implement minimal SAML env parsing**

Add a typed parser for:

- `MDCMS_AUTH_SAML_PROVIDERS`
- required fields: `providerId`, `issuer`, `domain`, `entryPoint`, `cert`
- optional fields: `audience`, `spEntityId`, `identifierFormat`, `authnRequestsSigned`, `wantAssertionsSigned`, `attributeMapping`

Implementation details:

- extend `ServerEnv` with `MDCMS_AUTH_SAML_PROVIDERS`
- preserve the current OIDC parser unchanged except for shared cross-protocol `providerId` uniqueness
- keep missing or blank `MDCMS_AUTH_SAML_PROVIDERS` equivalent to “no configured SAML providers”
- keep errors as deterministic `INVALID_ENV` envelopes keyed to the offending env var

**Step 4: Update the operator env example**

Add a commented `MDCMS_AUTH_SAML_PROVIDERS` example to `.env.example` alongside the existing OIDC example and note that providers are enabled by presence, not by a separate flag.

**Step 5: Re-run the targeted env test**

Run: `bun test apps/server/src/lib/env.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/server/src/lib/env.ts apps/server/src/lib/env.test.ts .env.example
git commit -m "feat(server): parse startup saml provider config"
```

### Task 2: Extend the auth service to register static SAML providers

**Files:**

- Modify: `apps/server/src/lib/auth.ts`
- Modify: `apps/server/src/lib/auth.test.ts`

**Step 1: Write the failing auth-service tests**

Add unit-level tests proving:

- the shared SSO sign-in payload accepts a configured SAML `providerId`
- `SSO_PROVIDER_NOT_CONFIGURED` is protocol-neutral, not OIDC-only
- static SAML provider config is converted into Better Auth SSO provider input
- the Better Auth plugin options enable the required SAML protections:
  - `enableInResponseToValidation: true`
  - `allowIdpInitiated: false`
  - `requireTimestamps: true`

**Step 2: Run the targeted auth test to verify red**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: FAIL on missing SAML provider building or OIDC-specific error/messages

**Step 3: Implement the minimal mixed-protocol provider registry**

Implement in `apps/server/src/lib/auth.ts`:

- a `SamlProviderConfig` runtime mapping compatible with `@better-auth/sso`
- a builder that converts parsed SAML env config into Better Auth `defaultSSO` entries
- a combined configured-provider allowlist across OIDC and SAML
- protocol-neutral `SSO_PROVIDER_NOT_CONFIGURED` and `AUTH_PROVIDER_ERROR` messages where the code path is shared
- shared callback URL validation for both protocols
- Better Auth `sso(...)` registration with:
  - all OIDC providers
  - all SAML providers
  - required SAML validation options from the spec

Do not add:

- runtime provider registration
- Studio-managed SSO settings
- IdP-initiated login
- SAML Single Logout

**Step 4: Re-run the targeted auth test**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: PASS for the new provider-registry assertions and existing OIDC regressions

**Step 5: Commit**

```bash
git add apps/server/src/lib/auth.ts apps/server/src/lib/auth.test.ts
git commit -m "feat(server): register static saml providers"
```

### Task 3: Add deterministic SAML fixture helpers

**Files:**

- Create: `apps/server/src/lib/auth-saml-fixtures.ts`
- Modify: `apps/server/src/lib/auth.test.ts`

**Step 1: Write the failing fixture-driven SAML tests**

Add integration-style coverage in `apps/server/src/lib/auth.test.ts` for:

- configured SAML sign-in starts from `POST /api/v1/auth/sign-in/sso`
- SP metadata endpoint returns `200` for a configured SAML provider
- ACS success establishes a session and redirects to `/studio`
- missing mapped `email` or `id` becomes `AUTH_SAML_REQUIRED_ATTRIBUTE_MISSING`
- unconfigured provider returns `SSO_PROVIDER_NOT_CONFIGURED`
- unsolicited IdP response is rejected
- replayed assertion is rejected

**Step 2: Run the targeted auth test to verify red**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: FAIL on missing SAML test helpers and missing ACS/metadata support

**Step 3: Implement the SAML fixture helper**

Create `apps/server/src/lib/auth-saml-fixtures.ts` with deterministic helpers that:

- define a startup-valid SAML provider config
- generate reusable test certificates/private keys
- decode the SP-initiated `SAMLRequest` created by the sign-in step so tests can reuse the exact request ID
- generate signed SAML responses for:
  - success
  - missing email
  - missing id
  - replay reuse
  - missing `InResponseTo`

Prefer local deterministic XML generation over live IdP/network tests.

**Step 4: Re-run the targeted auth test**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: FAIL only on missing runtime ACS/metadata behavior

**Step 5: Commit**

```bash
git add apps/server/src/lib/auth-saml-fixtures.ts apps/server/src/lib/auth.test.ts
git commit -m "test(server): add saml auth fixtures"
```

### Task 4: Add ACS and SP metadata route handling

**Files:**

- Modify: `apps/server/src/lib/auth.ts`
- Modify: `apps/server/src/lib/auth.test.ts`

**Step 1: Keep the SAML endpoint tests red and focused**

Make sure the integration tests explicitly verify:

- `GET /api/v1/auth/sso/saml2/sp/metadata?providerId=<id>&format=xml` returns metadata that references the configured ACS URL
- `POST /api/v1/auth/sso/saml2/sp/acs/:providerId` accepts a valid signed response and issues the normal MDCMS session
- missing mapped attributes surface `AUTH_SAML_REQUIRED_ATTRIBUTE_MISSING`
- unsolicited or replayed responses surface deterministic failure envelopes

**Step 2: Run the targeted auth test to confirm red**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: FAIL on missing route mounts or incorrect SAML error translation

**Step 3: Implement the minimal route support**

In `apps/server/src/lib/auth.ts`:

- add route mounts for:
  - `POST /api/v1/auth/sso/saml2/sp/acs/:providerId`
  - `GET /api/v1/auth/sso/saml2/sp/metadata`
- route both through `auth.handler(...)` with the same runtime error wrapping used for existing auth endpoints
- add SAML-specific error mapping so:
  - missing mapped identity fields become `AUTH_SAML_REQUIRED_ATTRIBUTE_MISSING`
  - unsupported provider IDs become `SSO_PROVIDER_NOT_CONFIGURED`
  - assertion validation/replay/issuer/signature failures become `AUTH_PROVIDER_ERROR`
- add post-callback user normalization for the SAML ACS path similar to the existing OIDC callback normalization, but using the SAML attribute mapping defined in the provider config

**Step 4: Re-run the targeted auth test**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: PASS for the new SAML route coverage and all pre-existing OIDC regressions

**Step 5: Commit**

```bash
git add apps/server/src/lib/auth.ts apps/server/src/lib/auth.test.ts
git commit -m "feat(server): add saml acs and metadata routes"
```

### Task 5: Update operator-facing auth documentation

**Files:**

- Modify: `apps/server/README.md`
- Modify: `.env.example` (only if more examples are still needed after Task 1)

**Step 1: Update the server README**

Document:

- `MDCMS_AUTH_SAML_PROVIDERS`
- provider-presence enablement semantics
- required and optional SAML fields
- ACS and SP metadata routes
- SP-initiated-only scope
- callback URL restrictions shared with OIDC

**Step 2: Run formatting checks for touched docs**

Run: `bun run format:check`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/server/README.md .env.example
git commit -m "docs(server): document saml provider support"
```

### Task 6: Verify the full CMS-41 slice

**Files:**

- Modify: none unless verification fixes are required

**Step 1: Run the env parser suite**

Run: `bun test apps/server/src/lib/env.test.ts`
Expected: PASS

**Step 2: Run the auth suite**

Run: `bun test apps/server/src/lib/auth.test.ts`
Expected: PASS

**Step 3: Run formatting**

Run: `bun run format:check`
Expected: PASS

**Step 4: Run the workspace baseline**

Run: `bun run check`
Expected: PASS

**Step 5: Inspect git status**

Run: `git status --short`
Expected:

- only CMS-41 task-scoped files are staged or modified
- unrelated local-only paths such as `.claude/`, `.codex/`, `ROADMAP_TASKS.md`, and `docs/plans/` remain unstaged

**Step 6: Final verification commit if fixes were needed**

```bash
git add <cms-41-files>
git commit -m "test(server): finalize cms-41 verification"
```
