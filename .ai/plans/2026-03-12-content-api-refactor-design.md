# Content API Refactor Design

## Scope

Refactor `apps/server/src/lib/content-api.ts` into smaller internal modules
without changing any behavior, public exports, route contracts, or existing
test expectations.

In scope:

- keep `apps/server/src/lib/content-api.ts` as the stable public entrypoint
- extract shared content API types into an internal module
- extract parsing/routing helpers into an internal module
- extract response and row conversion helpers into an internal module
- extract the in-memory content store into its own module
- extract the DB-backed content store into its own module
- extract route mounting into its own module
- preserve the current test suite as the regression guard

Out of scope:

- endpoint behavior changes
- route path or payload changes
- new tests for new behavior
- cleanup refactors unrelated to file decomposition
- broader server architecture changes

## Spec Delta Summary

There is no product-spec delta for this work. This is a no-behavior-change
internal refactor of the current server implementation.

The contract that must remain unchanged is the existing public surface exported
by `apps/server/src/lib/content-api.ts`:

- `createInMemoryContentStore`
- `createDatabaseContentStore`
- `mountContentApiRoutes`

Acceptance for this refactor depends on preserving:

- existing content API runtime behavior
- existing request/response contracts
- existing test outcomes

## Approved Approach

Use a thin facade entrypoint and move internals into
`apps/server/src/lib/content-api/`.

Target structure:

- `content-api.ts`
- `content-api/types.ts`
- `content-api/parsing.ts`
- `content-api/responses.ts`
- `content-api/in-memory-store.ts`
- `content-api/database-store.ts`
- `content-api/routes.ts`

This is the safest split because it reduces the file size quickly while keeping
the rest of the codebase importing the same top-level module path.

## Migration Strategy

1. Extract pure/shared code first:
   - content types
   - payload/query types
   - parsing helpers
   - response serializers
2. Extract `createInMemoryContentStore` and keep its private helper functions
   local to that module.
3. Extract `createDatabaseContentStore` and keep DB-only helper functions local
   to that module.
4. Extract `mountContentApiRoutes` last, after shared helpers and store exports
   are already stable.
5. Reduce `content-api.ts` to a thin re-export facade.

## Guardrails

- no public API changes
- no route changes
- no behavior changes
- no test rewrites beyond import-stability needs
- no opportunistic cleanups mixed into the extraction

## Risks

- accidental type cycles between shared helpers and store modules
- import path mistakes when moving helpers
- behavioral drift between in-memory and DB stores if helpers are duplicated
- route authorization regressions if helper ownership changes

## Mitigation

- keep shared types/helpers in dedicated internal modules
- keep store-specific helpers private to the relevant store module
- extract routes last
- run the existing content API test file after each major extraction step

## Testing

Primary regression gate:

- `bun test apps/server/src/lib/content-api.test.ts`

Full validation after the refactor:

- `bun run format:check`
- `bun run check`

## Repo Policy Note

This design file is intentionally stored in `docs/plans/` as a local planning
artifact and should remain untracked per `AGENTS.md`.
