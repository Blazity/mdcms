# Studio Schema Guard And Read-Only Browser Design

Date: 2026-03-31

## Goal

Implement a combined Studio slice that:

- blocks document writes when the local Studio schema hash does not match the synced server schema hash
- lets privileged users run an explicit `Sync Schema` recovery action
- replaces the placeholder `/admin/schema` surface with a live read-only schema browser

This design intentionally combines the schema mismatch guard and read-only schema browsing work while excluding the broader Settings MVP cleanup.

## Scope

Included:

- live schema fetch for the active `(project, environment)` target
- local-versus-server schema hash comparison
- guarded read-only editor mode while mismatch is unresolved
- explicit privileged `Sync Schema` action backed by `PUT /api/v1/schema`
- live read-only schema browser UI for `/admin/schema`
- minimal Settings integration that reuses or points to the shared schema browser path

Excluded:

- broad Settings tab cleanup and truthful-control audit
- new client-side auth/session contracts for role exposure
- manual schema editing controls in Studio

## Contract Basis

The behavior is already specified by:

- `docs/specs/SPEC-004-schema-system-and-sync.md`
- `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`

The design relies on existing server behavior:

- `GET /api/v1/schema` for read-only schema browsing
- `PUT /api/v1/schema` for privileged explicit sync
- content write rejection when `x-mdcms-schema-hash` is missing or mismatched

## Architecture

Add one Studio-side schema state path in `packages/studio/src/lib` that:

1. fetches the current schema registry entries for the active target
2. derives the local config snapshot and local schema hash from the existing Studio config capability path
3. compares the local hash with the server hash
4. exposes a `syncSchema()` action that forwards the local snapshot to `PUT /api/v1/schema`

That state becomes the shared source for:

- `/admin/schema` read-only schema browsing
- document editor write gating and mismatch recovery

The client should not gain a new role contract in this slice. Capability is derived from endpoint behavior:

- `GET /schema` success means schema browsing is available
- `PUT /schema` success means the current user can perform privileged sync
- `403` on sync means the user remains in read-only recovery without the action

## Components And Data Flow

### Schema Adapter

Create a Studio adapter beside the existing action and document adapters that wraps:

- `GET /api/v1/schema`
- `PUT /api/v1/schema`

The adapter applies:

- Studio auth mode (`cookie` or `token`)
- target headers: `X-MDCMS-Project`, `X-MDCMS-Environment`
- CSRF bootstrap for session-authenticated writes before `PUT /schema`

### Shared Schema State

Add a shared state module or hook that normalizes:

- `loading`
- `ready`
- `empty`
- `forbidden`
- `error`

and derives:

- `localSchemaHash`
- `serverSchemaHash`
- `isMismatch`
- `canSync`
- `syncStatus`

It should expose:

- schema entries
- reload
- sync action
- deterministic error metadata

### Schema Browser UI

Replace `/admin/schema` with a real read-only browser backed by live schema entries.

The page should:

- render content types, fields, localization, and validator metadata from `resolvedSchema`
- never expose schema edit controls
- show loading, empty, forbidden, and generic error states
- surface the same mismatch banner and privileged recovery action when applicable

### Document Editor Guard

The document route should consume the shared schema state and enter guarded read-only mode when:

- the local schema is unavailable, or
- the local and server schema hashes do not match

In guarded read-only mode:

- the editor remains readable
- draft save and publish actions are disabled
- the page shows an explanatory banner
- privileged users can run `Sync Schema`
- non-privileged users see recovery guidance only

## Error Handling

### Loading

Before schema state resolves, Studio should keep guarded write actions disabled rather than briefly enabling them.

### Forbidden

If `GET /api/v1/schema` returns `403`, the schema page shows a forbidden state. If a user can read content but cannot sync schema, the document page still stays read-only when mismatch is detected and omits the privileged action.

### Sync Failure

`PUT /api/v1/schema` failures should surface clearly:

- `403`: sync is not permitted for this user
- `409`: schema is incompatible and requires migration or another operator action
- `400`: local payload/config cannot be synced as-is

Write blocking remains active until the mismatch clears.

### Recovery

After a successful sync:

- Studio reloads schema state
- the mismatch banner clears
- document write affordances re-enable without a full page reload

## Verification

Required verification should cover:

- schema adapter tests for `GET /schema` and `PUT /schema`
- schema state tests for loading, forbidden, mismatch, and sync transitions
- schema page tests proving live read-only rendering with no edit controls
- document page tests proving mismatch disables save and publish affordances
- guarded-write API tests covering privileged sync and non-privileged rejection

## Notes

- `docs/plans` is local-only workspace documentation in this repository, so this design file is intentionally not part of the canonical committed product docs.
- The later Settings cleanup work should stay separate. This slice should only make the minimal Settings changes needed to avoid duplicating schema UI logic.
