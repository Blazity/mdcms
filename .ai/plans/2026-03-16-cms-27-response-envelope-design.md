# CMS-27 Response Envelope Design

## Summary

CMS-27 standardizes content API response envelopes and pagination metadata.
The existing `/api/v1/content` list route already returns the target shape, but
`GET /api/v1/content/:documentId/versions` still returns a bare `{ data: [] }`
payload in the owning content spec and server implementation.

The approved design treats the versions history endpoint as an in-scope list
response for CMS-27. It will adopt the same pagination contract as
`GET /api/v1/content`:

- `limit` default `20`
- `limit` max `100`
- `offset` default `0`
- success envelope `{ data, pagination: { total, limit, offset, hasMore } }`
- newest-first version ordering remains unchanged

## Spec Delta

- Update `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
  so `GET /api/v1/content/:documentId/versions` accepts `limit` and `offset`.
- Change that endpoint's success contract from
  `{ data: DocumentVersionSummary[] }` to
  `{ data: DocumentVersionSummary[], pagination: { total, limit, offset, hasMore } }`.
- Keep the shared list-envelope guidance in
  `docs/specs/SPEC-005-auth-authorization-and-request-routing.md` unchanged.

## Architecture

The implementation stays scoped to content APIs but extracts the content-facing
response types into `@mdcms/shared` so the server and CLI stop duplicating
contract shapes.

Add a new shared contract module for:

- `ApiDataEnvelope<T>`
- `ApiPaginatedEnvelope<T>`
- `PaginationMetadata`
- `ContentDocumentResponse`
- `ContentVersionSummaryResponse`
- `ContentVersionDocumentResponse`

These remain type-only exports. Runtime route ownership, parsing, and
authorization stay in `@mdcms/server`.

## Server Changes

- Update the content store interface so `listVersions(...)` returns
  `{ rows, total, limit, offset }`, matching the existing `list(...)` contract.
- Parse `limit` and `offset` for the versions listing route with the same
  validation rules already used for `/api/v1/content`.
- Add a small route-local helper for building the standard paginated envelope.
- Keep single-document routes shaped as `{ data: ... }`, but type them against
  the shared content response contracts.

## Store Changes

Both content store implementations must paginate version history after applying
the existing newest-first sort:

- `apps/server/src/lib/content-api/in-memory-store.ts`
- `apps/server/src/lib/content-api/database-store.ts`

Each store should return:

- `rows`
- `total`
- `limit`
- `offset`

No persistence schema changes are required.

## Consumer Changes

`apps/cli/src/lib/pull.ts` and `apps/cli/src/lib/push.ts` currently duplicate
content API payload shapes. They should import the shared content response
types where those shapes already match current server behavior.

This keeps CMS-27 scoped to content contracts without turning the task into a
monorepo-wide response abstraction effort.

## Error Handling

No error semantics change in CMS-27:

- invalid `limit` or `offset` stays `INVALID_QUERY_PARAM` (`400`)
- missing document stays `NOT_FOUND` (`404`)
- target-routing and authorization failures stay unchanged

The task changes envelope consistency and pagination metadata only.

## Testing

Add or update contract coverage for:

- versions list response envelope shape
- versions pagination defaults
- versions pagination with custom `limit` and `offset`
- `hasMore` computation

Keep existing content single-document response assertions aligned with the
shared content response type definitions.

## Documentation

Document the public contract changes in:

- `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- `apps/server/README.md`

`docs/plans/` is local-only in this repository, so this design note is not
intended to be committed.
