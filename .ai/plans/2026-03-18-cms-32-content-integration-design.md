# CMS-32 Content Integration Design

Date: 2026-03-18
Task: CMS-32

## Goal

Turn the existing DB-backed content route coverage into a deterministic, CI-gated integration suite for lifecycle, routing, uniqueness, restore, schema-hash, and resolve behaviors.

## Canonical Inputs

- `ROADMAP_TASKS.md` CMS-32
- `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- `docs/specs/SPEC-009-i18n-and-environments.md`

## Spec Delta

No spec delta is required. CMS-32 only strengthens verification and CI gating for already-specified behavior.

## Scope

### In Scope

- Extract DB-backed content route scenarios into a dedicated integration suite.
- Keep in-memory content route tests for fast contract and smoke coverage.
- Factor shared content test harness code into reusable support helpers.
- Add a deterministic integration runner that boots Docker Compose, waits for services, runs the DB-backed suite, and tears the stack down.
- Wire the new integration suite into the existing root `integration` command and CI job.
- Document the new local operator workflow in the server README.

### Out of Scope

- Replacing the content store abstraction.
- Removing `createInMemoryContentStore`.
- Reworking the entire CI workflow structure.
- Redesigning Docker Compose services beyond what is required to run the new suite.

## Design Decisions

### 1. Keep the In-Memory Store

`createInMemoryContentStore` remains in the codebase.

Its responsibility becomes:

- fast route-level contract checks
- parsing and validation coverage
- envelope and pagination formatting checks
- basic route/store smoke coverage

It is no longer the evidence for production persistence semantics.

### 2. Create a Dedicated DB-Backed Content Integration Suite

Introduce a new integration-focused test file:

- `apps/server/src/lib/content-api.integration.test.ts`

This suite becomes the canonical regression gate for:

- draft/publish/unpublish lifecycle
- published-default vs `draft=true` reads
- deleted visibility behavior
- version history and immutable snapshots
- restore flows and restore conflict handling
- routing isolation across project/environment scope
- DB uniqueness and conflict mapping
- schema-hash enforcement on real write paths
- DB-backed `resolve` behavior and its failure cases

### 3. Extract Shared Test Support

Move reusable DB test harness code into:

- `apps/server/src/lib/content-api-test-support.ts`

Expected shared helpers:

- DB connectivity probe
- authenticated test context creation
- schema registry seeding
- common scope headers
- common request helpers
- deterministic fixture/namespace helpers

### 4. Make Fixtures Deterministic by Label

Avoid `Date.now()` / `Math.random()` as the primary fixture naming mechanism inside the extracted integration suite.

Each test should derive stable labels for:

- project name
- path segments
- auth email
- schema source ids

This keeps the suite easier to debug and more repeatable against a fresh DB in CI.

### 5. Add a Dedicated Integration Runner

Introduce a root script:

- `scripts/content-api-integration-check.sh`

Responsibilities:

1. Start Docker Compose with build.
2. Wait for `postgres`, `db-migrate`, and `server` readiness.
3. Run the dedicated server integration test command from the host workspace.
4. Tear down the Compose stack and volumes on exit.

Existing scripts remain:

- `scripts/compose-health-check.sh`
- `scripts/migration-startup-check.sh`

### 6. Strengthen the Existing Integration Gate

Update root `package.json` so `bun run integration` covers:

1. compose health
2. migration startup/schema validation
3. content API DB integration suite

The GitHub Actions integration job can continue calling `bun run integration`.

## Test Ownership Split

### Fast Route Suite

`apps/server/src/lib/content-api.test.ts`

Keeps:

- in-memory route smoke coverage
- parsing/query validation
- response envelope assertions
- routing-guard smoke behavior
- any storage-independent checks that should stay fast

### DB Integration Suite

`apps/server/src/lib/content-api.integration.test.ts`

Owns:

- lifecycle and visibility
- restore paths
- routing isolation
- uniqueness/conflict behavior
- schema-hash transport and persistence behavior
- DB-backed `resolve`
- DB race/constraint precedence mapping

## Verification

Task completion should be backed by:

- `bun run format:check`
- `bun run check`
- `bun run integration`

## Notes

- `docs/plans/` is local-only in this repository, so this design doc should remain untracked.
- No public API contract changes are introduced; README documentation only needs to describe the new local integration workflow.
