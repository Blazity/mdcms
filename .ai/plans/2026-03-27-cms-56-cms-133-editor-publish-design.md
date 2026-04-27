# CMS-56 + CMS-133 Editor Publish Integration Design

Date: 2026-03-27
Tasks:

- `CMS-56 - Wire Studio publish flow + version history panel + version diff view`
- `CMS-133 - Integrate editor draft load/save flow with real content mutations`

## Notes

- This design doc is intentionally local-only under `docs/plans/` per repo workflow.
- The owning specs are:
  - [SPEC-003](../specs/SPEC-003-content-storage-versioning-and-migrations.md)
  - [SPEC-004](../specs/SPEC-004-schema-system-and-sync.md)
  - [SPEC-005](../specs/SPEC-005-auth-authorization-and-request-routing.md)
  - [SPEC-007](../specs/SPEC-007-editor-mdx-and-collaboration.md)
- No spec delta is required before implementation. The current spec set already defines the route behavior, auth mode, write guard, publish semantics, version-history contract, and version-detail reads needed for this slice.

## Spec Delta Summary

1. No spec text changes are required.
2. The affected behavior is the Studio document editor route:
   - draft document load
   - draft update mutation
   - publish flow with optional change summary
   - version history display
   - version diff between any two selected immutable snapshots
3. Acceptance criteria depend on existing spec text for:
   - `GET /api/v1/content/:documentId?draft=true`
   - `PUT /api/v1/content/:documentId`
   - `POST /api/v1/content/:documentId/publish`
   - `GET /api/v1/content/:documentId/versions`
   - `GET /api/v1/content/:documentId/versions/:version`
   - schema-hash write enforcement on content writes
   - session-authenticated CSRF bootstrap via `GET /api/v1/auth/session`

## Current State

The repo already contains the backend contracts required for this work:

- `apps/server/src/lib/content-api/routes.ts`
  - content read, update, publish, version summary, and version detail routes
- `apps/server/src/lib/auth.ts`
  - session route returning `csrfToken`
  - CSRF protection for state-changing session requests
  - RBAC checks for draft reads and publish operations
- `packages/shared/src/lib/contracts/content-api.ts`
  - shared version summary and version detail response shapes
- `packages/studio/src/lib/document-shell.ts`
  - draft document load helper with scoped headers and typed error states

The gap is entirely on the Studio route side:

- `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
  - still reads from `mockDocuments`
  - simulates publish locally
  - has no real version history or diff state
- `packages/studio/src/lib/runtime-ui/components/editor/editor-sidebar.tsx`
  - still exposes mock field-editing controls that are not backed by schema-aware real mutations
- there is no Studio-side helper for:
  - CSRF bootstrap
  - schema-hash derivation from local config
  - real draft update mutation
  - publish mutation
  - version history fetch
  - version diff construction

## Decision

Implement one dedicated Studio document-route data layer inside `packages/studio` and keep the route component mostly presentational.

Do not add new backend endpoints.

Do not turn this into a generic Studio-wide query framework.

## Architecture

### 1. Route-local data layer

Add a typed Studio-side helper module responsible for:

- bootstrapping CSRF for cookie-authenticated mutations through `GET /api/v1/auth/session`
- loading the routed draft document
- updating the draft document through `PUT /api/v1/content/:documentId`
- publishing through `POST /api/v1/content/:documentId/publish`
- loading version summaries and specific version snapshots
- normalizing error handling into route-friendly states

This keeps request details out of the page component and provides one reuse point for later `CMS-57` write gating.

### 2. Local schema-hash derivation

Draft writes must satisfy the `x-mdcms-schema-hash` contract from `SPEC-004`.

The Studio route should derive the local schema hash from the full `MdcmsConfig` already accepted by `@mdcms/studio` when the host passes the authored config object instead of the shell-only embed config.

The derivation should mirror the existing server-side demo-seed hashing inputs:

- normalized raw config snapshot
- resolved environment schema
- active environment name

If the route only receives shell-only config and cannot derive a trustworthy local schema hash, draft writes and publish must remain disabled with truthful copy. Reads still work.

### 3. Truthful editor-route behavior

The document route should stop pretending unfinished UI is live.

That means:

- keep real draft loading and body persistence in scope
- keep real publish/history/diff in scope
- remove or disable mock controls that imply unavailable schema-driven field editing
- do not ship a fake locale switcher; locale-variant behavior remains owned by `CMS-63`
- do not expand into schema-mismatch recovery UI; guarded write-mode belongs to `CMS-57`

### 4. Publish and history model

Publish remains explicit and versioned:

- the publish dialog keeps the optional change-summary textarea
- success refreshes the route document state and version history
- version history lists:
  - version
  - `publishedBy`
  - `publishedAt`
  - `changeSummary`

The history panel is read-only in this slice. Restore stays out of scope.

### 5. Client-side diff model

There is no spec-owned diff endpoint, so diff must be computed client-side from two fetched immutable version snapshots.

The diff view should support any two selected versions, not only adjacent pairs.

The comparison should cover:

- path changes
- frontmatter changes
- body changes

The implementation can stay simple and readable. It does not need a full word-level rich diff engine to satisfy the current spec.

## UI Behavior

### Document route lifecycle

The route must render complete UI states for:

- loading
- ready
- not found
- forbidden
- generic load error

The page should continue to preserve route context (`type`, `documentId`) even when the content load fails.

### Draft save behavior

Draft updates are debounced from the editor route:

- editing marks the route dirty immediately
- a debounce triggers the real update mutation
- save states are visible:
  - `unsaved`
  - `saving`
  - `saved`
  - `save failed`

The page owns the canonical draft snapshot after each successful mutation so subsequent publish/history refreshes use real backend state.

### Publish behavior

- the Publish button opens the dialog
- the dialog sends optional `changeSummary`
- success closes the dialog, refreshes the current draft snapshot, and refreshes version history
- forbidden or mutation failures surface inline route-level feedback

### Version history and diff behavior

- the route exposes a real version history panel
- the panel supports:
  - loading
  - empty
  - error
  - populated
- the user can select any two versions for comparison
- selecting a version pair fetches the two immutable snapshots and renders the diff view

## Testing Strategy

### Studio helper tests

Add focused tests for:

- draft load
- cookie-auth CSRF bootstrap
- token-auth mutation path without CSRF bootstrap
- schema-hash derivation
- publish request payloads
- version list/detail fetch behavior
- typed error normalization

### Route integration tests

Add route-level tests covering:

- loading -> ready flow
- `FORBIDDEN`
- `NOT_FOUND`
- draft save success and failure
- publish success and error
- version history states
- arbitrary-version diff selection
- write-disabled state when schema-hash-capable config is unavailable

### Existing regression coverage

Keep existing tests green in:

- `packages/studio`
- touched shared helpers, if any
- touched server packages, if any server change becomes necessary

## Scope Boundaries

In scope:

- real draft document load for the routed editor
- real draft body save
- real publish flow
- real version history panel
- real version diff view
- truthful editor-route control availability
- package README updates for write-enabled config requirements

Out of scope:

- restore from version history
- unpublish workflow unless needed to remove a misleading mock control
- locale variant switching
- schema mismatch banner and read-only recovery flow
- schema browsing
- environment-specific field badges
- generalized Studio query/mutation framework
- Post-MVP autosave durability behavior such as blur/disconnect flush and collaboration hooks
