# CMS-19 Project Boundaries Design

## Scope

Implement CMS-19 strictly within the existing server/runtime surface:

- keep project identity backed by `projects.slug`
- preserve nullable `organization_id`
- centralize project/environment scope resolution for server stores
- prove cross-project isolation for content, schema, and environment operations

Out of scope:

- project CRUD endpoints
- auth or RBAC behavior changes
- Studio project switcher work
- new media or webhook runtime APIs

## Approved Approach

Use an internal repository-style refactor, not a public API expansion.

The existing project/environment lookup and provisioning logic is currently split
between:

- `apps/server/src/lib/project-provisioning.ts`
- `apps/server/src/lib/content-api.ts`
- `apps/server/src/lib/schema-api.ts`
- `apps/server/src/lib/environments-api.ts`

CMS-19 will consolidate that logic into one server-owned module so each store
resolves scope through the same path.

## Architecture

The internal project repository owns:

- `findProjectBySlug`
- `ensureProjectProvisioned`
- `resolveProjectEnvironmentScope(project, environment, { createIfMissing })`
- `requireProjectEnvironmentScope(...)`
- `requireEnvironmentInProject(project, environmentId)`

The route/store layers keep responsibility for mapping repository results into
endpoint-specific `RuntimeError` responses.

## Data Flow

### Content store

- replace the store-local `resolveScopeIds` helper with repository-backed scope
  resolution
- keep document reads and writes scoped by `(projectId, environmentId)`
- keep wrong-project `documentId` access returning `NOT_FOUND`

### Schema store

- reuse the same repository helper for project/environment resolution
- keep schema list/get/sync fully isolated to the resolved scope

### Environment store

- keep project-routed list/create/delete contracts unchanged
- use the repository for provisioning and environment ownership checks

## Provisioning Rules

Preserve current behavior where it already exists:

- environment creation may provision the project row and default `production`
  environment transactionally
- content creation keeps its current repository-backed scope resolution behavior

CMS-19 should not broaden or normalize provisioning semantics beyond the current
contract surface.

## Error Handling

Public error contracts remain unchanged.

- content document operations keep returning `NOT_FOUND` for out-of-scope
  documents
- schema sync keeps returning `NOT_FOUND` when the routed project/environment
  pair does not exist
- environment delete keeps returning `NOT_FOUND` when the target environment ID
  is not owned by the routed project

Repository helpers return typed records or `undefined`; they do not raise
endpoint-specific errors themselves.

## Testing

Add or tighten database-backed tests for:

- content cross-project isolation
- schema registry cross-project isolation
- environment deletion with an environment ID that belongs to another project
- repository provisioning and scope resolution behavior

## Repo Policy Note

This design file is intentionally stored in `docs/plans/` as a local planning
artifact and should remain untracked per the repository instructions in
`AGENTS.md`.
