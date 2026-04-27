# CMS-23 + CMS-24 Restore and Version History Design

## Scope

Implement the bundled `CMS-23` and `CMS-24` server-side content behaviors
inside the existing content API surface in `apps/server`.

In scope:

- add exact-undelete trash restore to `POST /api/v1/content/:documentId/restore`
- add immutable version history read endpoints
- add historical version restore to
  `POST /api/v1/content/:documentId/versions/:version/restore`
- preserve project/environment scoping, deterministic conflict handling, and
  append-only version history guarantees
- document the new API contract at the point of use in the server README

Out of scope:

- Studio trash/version-history UI
- CLI commands for restore or history
- schema-aware field validation beyond the current content write contract
- collaboration merge semantics
- new tables or indexes; the existing `documents` and `document_versions`
  schema already support the required behavior

## Spec Delta Summary

Confirmed contract delta for this bundled implementation:

- `POST /api/v1/content/:documentId/restore` is an exact undelete of the
  current head row only
- trash restore does **not** accept `targetStatus`
- trash restore does **not** append a new `document_versions` row
- trash restore preserves the current head state, including any existing
  `publishedVersion`, and only clears `isDeleted`
- `POST /api/v1/content/:documentId/versions/:version/restore` is the only
  restore flow that accepts `targetStatus=draft|published`
- `targetStatus=draft` updates mutable head content only
- `targetStatus=published` appends a fresh immutable version row at HEAD and
  updates `publishedVersion`

This resolves the ambiguity between the current `SPEC-003` prose and endpoint
table by keeping plain trash restore as undelete-only and leaving publish-style
restoration on the version-restore endpoint.

## Approved Approach

Keep the work inside the existing content API module and extend the current
store abstraction.

The implementation will:

1. extend `ContentStore` with `restore`, `listVersions`, `getVersion`, and
   `restoreVersion`
2. keep in-memory and DB-backed stores aligned so HTTP tests exercise the same
   public contract in both modes
3. reuse the existing publish flow semantics for restore-to-published so the
   version history remains linear and append-only
4. centralize path-conflict handling so both trash restore and version restore
   return the same deterministic `CONTENT_PATH_CONFLICT` error shape

This keeps the task scoped to the existing server boundary while preserving the
behavioral guarantees already established by the content API.

## Request Contract

### `POST /api/v1/content/:documentId/restore`

- no request body fields are required
- exact undelete of the current head row
- clears `isDeleted`
- preserves current head content and `publishedVersion`
- does not append version history

### `GET /api/v1/content/:documentId/versions`

- returns immutable publish history for the routed document
- response items are version summaries derived from `document_versions`

### `GET /api/v1/content/:documentId/versions/:version`

- returns one immutable snapshot from `document_versions`

### `POST /api/v1/content/:documentId/versions/:version/restore`

- accepts optional `targetStatus` enum: `draft` or `published`
- default is `draft`
- `draft` updates the mutable head from the chosen immutable snapshot and sets
  `hasUnpublishedChanges = true`
- `published` updates the mutable head from the chosen immutable snapshot,
  appends a new immutable publish row, and updates `publishedVersion`

## Validation and Data Flow

### Trash restore

When restoring a soft-deleted document:

1. resolve the document within the routed `project` and `environment`
2. reject missing documents with `NOT_FOUND`
3. reject already-active documents by returning the current active head
   semantics only if explicitly supported; for this task, only deleted documents
   are restorable
4. check whether another active document already occupies the same
   `(project, environment, locale, path)` tuple
5. if no conflict exists, clear `isDeleted` and return the restored head

### Version history reads

1. resolve the document within the routed scope
2. reject missing or soft-deleted targets with `NOT_FOUND`
3. read immutable rows from `document_versions` for that `documentId`
4. return descending version order for list responses

### Version restore

When restoring a historical version:

1. resolve the head document within the routed scope
2. resolve the requested immutable version row for the same `documentId`
3. reject malformed versions with `INVALID_INPUT`
4. reject missing snapshots with `NOT_FOUND`
5. check active path uniqueness against the snapshot path and locale
6. update the mutable head from the snapshot
7. for `targetStatus=draft`, set `hasUnpublishedChanges = true` and do not
   append a version row
8. for `targetStatus=published`, append a fresh immutable version row and set
   `publishedVersion` to the new HEAD version number

## Error Handling

Deterministic errors for the bundled work:

- `INVALID_INPUT` (`400`)
  - malformed `version` path parameter
  - invalid `targetStatus`
- `NOT_FOUND` (`404`)
  - document missing in the routed scope
  - requested immutable version missing for the document
- `CONTENT_PATH_CONFLICT` (`409`)
  - trash restore or version restore would reactivate/update the head into an
    active `(project, environment, locale, path)` collision

Conflict details should include:

- `path`
- `locale`
- `conflictDocumentId` when available

## Testing

Add coverage in `apps/server/src/lib/content-api.test.ts` for:

- in-memory trash restore exact undelete
- in-memory trash restore conflict handling
- in-memory version history listing and single-version fetch
- in-memory draft version restore
- in-memory published version restore appending a fresh HEAD version
- DB-backed trash restore conflict handling
- DB-backed published version restore preserving linear append-only history

Verification commands:

- `bun test apps/server/src/lib/content-api.test.ts`
- `bun run format:check`
- `bun run check`

## Documentation

Document the new content contracts in `apps/server/README.md`:

- trash restore is exact undelete of the current head
- version history endpoints expose immutable publish snapshots
- version restore supports `targetStatus=draft|published`
- restore conflicts return `CONTENT_PATH_CONFLICT`

## Repo Policy Note

This design file is intentionally stored in `docs/plans/` as a local planning
artifact and should remain untracked per the repository instructions in
`AGENTS.md`.
