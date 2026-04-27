# CMS-28 CMS-29 Reference Identity And Schema Hash Gate Design

## Context

CMS-28 and CMS-29 both land on the same write-path seam in the content API.
CMS-28 needs reference fields to persist stable environment-local document
identities, while CMS-29 needs the server to reject draft-content writes when
the client's local schema hash is missing, unsynced, or stale for the target
environment.

The approved design combines both tasks so the schema gate runs before any
write-side reference validation. That lets CMS-28 rely on a synced target
schema instead of carrying a permissive fallback that CMS-29 would immediately
remove.

## Approved Decisions

### Endpoint Scope

Schema-hash gating applies only to:

- `POST /api/v1/content`
- `PUT /api/v1/content/:documentId`

It does not apply to `DELETE`, `restore`, `restore version`, `publish`, or
`unpublish`.

### Transport

Clients send the local schema hash in a dedicated header:

```http
x-mdcms-schema-hash: <schemaHash>
```

The hash is request metadata, not content data, so it stays out of JSON bodies.

### Deterministic Errors

- Missing or blank header returns `SCHEMA_HASH_REQUIRED` (`400`).
- Missing target schema sync record returns `SCHEMA_NOT_SYNCED` (`409`).
- Non-matching client and server hashes return `SCHEMA_HASH_MISMATCH` (`409`).

Recommended detail payloads:

- `SCHEMA_HASH_REQUIRED`: `{ field: "x-mdcms-schema-hash" }`
- `SCHEMA_NOT_SYNCED`: `{ project, environment }`
- `SCHEMA_HASH_MISMATCH`:
  `{ project, environment, clientSchemaHash, serverSchemaHash }`

### Stored Reference Shape

The current spec set is inconsistent about whether stored reference values are
plain IDs or rich objects. The approved contract resolves that in favor of the
simpler shape:

- stored `frontmatter` reference values are plain env-local `document_id` UUID
  strings
- target type metadata remains schema-owned through `reference("TypeName")`
- read-time `resolve=` expansion still turns stored IDs into inline documents

### Write Validation Order

For `POST /api/v1/content` and `PUT /api/v1/content/:documentId`, the server
must:

1. resolve target routing
2. authorize the request
3. validate `x-mdcms-schema-hash`
4. load the target environment's schema sync record
5. reject `SCHEMA_HASH_REQUIRED`, `SCHEMA_NOT_SYNCED`, or
   `SCHEMA_HASH_MISMATCH` when applicable
6. load the target environment's resolved schema for the effective content type
7. validate reference-bearing fields in `frontmatter`
8. persist the draft content

### Reference Validation Rules

- Validation walks nested object fields and arrays recursively.
- Only fields declared as `reference(...)` in the resolved schema receive
  special validation.
- Each stored reference value must be a UUID string that resolves to a
  non-deleted document in the same routed `(project, environment)` scope.
- The referenced document's type must match the schema-declared target type.
- Invalid shape, malformed UUID, missing target, deleted target, out-of-scope
  target, and type mismatch all fail the write with `INVALID_INPUT` (`400`).
- If the effective content type does not exist in the target environment's
  resolved schema, the write fails with `INVALID_INPUT` (`400`).
- This combined work does not introduce full schema validation for every
  non-reference field. It only hardens reference identity plus the schema-hash
  write gate.

## Required Spec Delta

### SPEC-004

Update `docs/specs/SPEC-004-schema-system-and-sync.md` to define the schema
gate for content draft-write endpoints:

- required `x-mdcms-schema-hash` header
- `SCHEMA_HASH_REQUIRED` (`400`)
- `SCHEMA_NOT_SYNCED` (`409`)
- `SCHEMA_HASH_MISMATCH` (`409`)
- gate runs before content validation and persistence
- stored references are plain env-local `document_id` strings

### SPEC-003

Update `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md` to:

- state that reference fields persist plain env-local `document_id` UUID
  strings
- keep `resolve=` as read-time expansion only
- add `x-mdcms-schema-hash` to the `POST /api/v1/content` and
  `PUT /api/v1/content/:documentId` request contracts
- add `SCHEMA_HASH_REQUIRED`, `SCHEMA_NOT_SYNCED`, and
  `SCHEMA_HASH_MISMATCH` to those endpoint tables
- keep `INVALID_INPUT` (`400`) for reference-validation failures

## Verification Expectations

Implementation should verify:

- create and update reject missing schema hash headers
- create and update reject unsynced target environments
- create and update reject mismatched client/server schema hashes
- matching schema hashes allow writes to continue normally
- reference writes accept valid env-local UUID strings
- reference writes reject malformed UUIDs
- reference writes reject missing, deleted, wrong-type, and out-of-scope targets
- nested object references and arrays of references are both validated
- existing `resolve=` read behavior continues to work with stored string IDs

## Notes

This design note is local workspace documentation under `docs/plans/` and
should remain untracked per repository rules.
