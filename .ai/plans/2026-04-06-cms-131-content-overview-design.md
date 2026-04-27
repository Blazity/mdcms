# CMS-131 Content Overview Design

## Scope

Finish `CMS-131` by completing the `/admin/content` live overview so it can:

- render truthful per-type `total`, `published`, and `drafts` counts for callers
  with `content:read`
- persist the Studio light/dark theme across reloads and remounts
- keep the existing real schema-driven cards, locale badges, and localized demo
  content intact

## Design

### Overview counts

The current page derives counts by calling `GET /api/v1/content` with
`limit=1` and reading `pagination.total`. That means the route still receives a
real `data` array with document payloads even though the overview only needs
counts. It also means `total` and `draft`-derived metrics currently depend on
`draft=true`, which requires `content:read:draft`.

To separate metadata visibility from draft document access:

- add a dedicated `GET /api/v1/content/overview` endpoint in the content API
- keep required scope at `content:read`
- return metadata-only rows per requested type with no document bodies or list
  payloads
- define `drafts` as non-deleted documents whose current head has no published
  version

### Theme persistence

The Studio `ThemeProvider` currently stores the theme only in React state and
reapplies the `dark` class on mount. It should own browser-local persistence
through `localStorage` and derive the effective theme using:

1. persisted Studio preference
2. explicit `defaultTheme`
3. system preference when `enableSystem` is enabled
4. `light`

## Files in scope

- `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `apps/server/src/lib/content-api/types.ts`
- `apps/server/src/lib/content-api/routes.ts`
- `apps/server/src/lib/content-api/in-memory-store.ts`
- `apps/server/src/lib/content-api/database-store.ts`
- `apps/server/src/lib/content-api*.test.ts`
- `packages/shared/src/lib/contracts/*` if shared endpoint types are needed
- `packages/studio/src/lib/content-overview-state.ts`
- `packages/studio/src/lib/runtime-ui/adapters/next-themes.tsx`
- `packages/studio/src/lib/runtime-ui/pages/content-page*.tsx`
- `packages/studio/src/lib/*test.ts*`

## Constraints

- Keep CMS-131 scoped to `/admin/content`; do not broaden dashboard behavior.
- Preserve the existing `GET /api/v1/content?draft=true` permission model.
- Do not commit files under `docs/plans/`; they are local workflow artifacts in
  this repo.
