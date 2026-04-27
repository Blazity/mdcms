# CMS-40 OIDC Provider Support Design

Date: 2026-03-18
Task: CMS-40

## Goal

Specify a concrete, minimal OIDC integration contract for MDCMS that uses the Better Auth SSO plugin with startup-configured providers, canonical claims mapping, and a deterministic fixture matrix.

## Canonical Inputs

- `ROADMAP_TASKS.md` CMS-40
- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/adrs/ADR-001-backend-framework-bun-elysia.md`

## Spec Delta

`SPEC-005` needs a normative OIDC section that:

- makes the Better Auth SSO plugin the MDCMS OIDC mechanism
- fixes CMS-40 to startup-configured provider profiles only
- defines the supported provider set for this task
- defines canonical claims mapping and deny-by-default error categories
- adds the OIDC sign-in and callback routes to the auth endpoint family

## Scope

### In Scope

- OIDC via Better Auth SSO plugin
- Static startup provider configuration
- Supported provider profile set:
  - `okta`
  - `azure-ad`
  - `google-workspace`
  - `auth0`
- Canonical claims normalization for MDCMS users/sessions
- Deterministic failure categories for config, sign-in initiation, callback, and missing required claims
- Fixture-matrix expectations for the four provider profiles

### Out of Scope

- Runtime provider registration
- Studio provider settings UI
- SAML behavior beyond preserving the CMS-41 handoff
- Arbitrary provider IDs outside the four CMS-40 profiles
- Provider-specific operator workflows beyond startup config and restart

## Design Decisions

### 1. Standardize on Better Auth SSO Plugin

MDCMS should explicitly standardize on the Better Auth SSO plugin for OIDC.

This keeps MDCMS responsible for:

- allowed provider profiles
- startup config contract
- canonical claim mapping
- deterministic operator and test guarantees

It leaves the protocol mechanics, callback handling, and discovery logic to Better Auth.

### 2. Use Startup Configuration Only

Provider definitions should be static server startup config for CMS-40.

This avoids:

- new admin APIs
- secret management UI
- provider CRUD persistence
- runtime validation and rollback workflows

Changes to provider configuration should require server restart.

### 3. Keep the Provider Set Closed

CMS-40 should make the supported provider set explicit and finite:

- `okta`
- `azure-ad`
- `google-workspace`
- `auth0`

The fixture matrix then proves support for a known set rather than a vague "OIDC-compatible" promise.

### 4. Fix the Canonical Claims Mapping

The provider-specific OIDC profile shape should normalize to a single MDCMS user/session shape:

- `id <- sub`
- `email <- email`
- `emailVerified <- email_verified` or `false` when missing
- `name <- name`, then `given_name + family_name`, then `preferred_username`, then `email`
- `image <- picture` or `null`

Missing `sub` or usable `email` should fail sign-in deterministically.

### 5. Restrict the MDCMS OIDC Surface

CMS-40 should define MDCMS-supported usage of the Better Auth SSO plugin as:

- initiate login with `providerId`
- callback handled under `/api/v1/auth/sso/callback/:providerId`
- relative or same-origin callback URLs only

CMS-40 should not promise:

- email/domain-based provider discovery
- runtime provider registration
- organization provisioning
- shared redirect URI behavior

## Verification

Task completion should be backed by:

- provider-fixture integration coverage for all four provider profiles
- successful claims normalization assertions across the fixture matrix
- negative coverage for missing claims and unconfigured provider IDs
- `bun run format:check`
- `bun run check`

## Notes

- `docs/plans/` is local-only in this repository, so this design doc should remain untracked.
- This design intentionally prefers a closed provider matrix over a generic "any OIDC provider" promise so CMS-40 stays testable and bounded.
