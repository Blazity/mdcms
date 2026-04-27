# Studio UI Runtime Mock Integration Design

Date: 2026-03-25
Task: CMS-47 + CMS-48 follow-on Studio UI integration

## Goal

Replace the current remote Studio placeholder UI with the approved `./studio_ui` admin mock inside the real `@mdcms/studio` runtime so visiting `/admin` in the host app renders the new Studio shell and route set through the existing bootstrap/runtime-delivery path.

## Canonical Inputs

- `ROADMAP_TASKS.md` CMS-47, CMS-48, CMS-49, CMS-50
- `docs/specs/README.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `packages/studio/README.md`
- `packages/studio/src/lib/build-runtime.ts`
- `packages/studio/src/lib/remote-module.ts`
- `packages/studio/src/lib/remote-studio-app.tsx`
- `packages/studio/src/lib/remote-studio-app.test.ts`
- `apps/studio-example/app/admin/[[...path]]/page.tsx`
- `apps/studio-example/README.md`
- `studio_ui/`

## Spec Delta

`SPEC-006` already owns the Studio embed shell and these runtime routes:

- `/admin`
- `/admin/content`
- `/admin/content/:type`
- `/admin/content/:type/:documentId`
- `/admin/environments`
- `/admin/users`
- `/admin/settings`
- `/admin/trash`

The approved mock adds runtime-owned admin pages that are not yet specified in
the owning spec:

- `/admin/media`
- `/admin/schema`
- `/admin/workflows`
- `/admin/api`

The required spec delta is narrow:

- add those four routes to `SPEC-006` as Studio runtime-owned navigable
  surfaces
- define this phase as shell-only/mock rendering for those pages
- keep live backend contracts and mutations for those pages deferred to their
  future owning work
- explicitly keep mock auth pages out of scope because Studio auth remains
  governed by `SPEC-005` and the host embed flow in `SPEC-006`

## Scope

### In Scope

- Port the admin mock route set into `packages/studio`
- Keep the existing bootstrap, verification, and remote-module mount flow
- Replace Next-specific routing helpers with runtime-local navigation helpers
- Add a runtime-owned styling path so the remote bundle renders independently of
  host-app CSS
- Keep mock data, stub actions, and local-only state where backend wiring is not
  part of this slice
- Update tests so `/admin/*` routes are asserted through the real remote runtime

### Out of Scope

- Wiring mock pages to live backend contracts beyond what already exists
- Reworking the host-app embed architecture in `apps/studio-example`
- Porting `(auth)` pages from `studio_ui`
- Making `/admin/media`, `/admin/schema`, `/admin/workflows`, or `/admin/api`
  functional beyond the approved shell-only placeholders
- Introducing new server endpoints or mutation contracts for the placeholder
  pages

## Design Decisions

### 1. Keep the Real Runtime Boundary Intact

The host app should keep mounting `@mdcms/studio` at `/admin/*` through the
existing catch-all route. The visible UI change should come from updating the
remote runtime bundle in `packages/studio`, not from bypassing the runtime and
rendering the mock directly in `apps/studio-example`.

This preserves the architecture already defined in `SPEC-006`:

- shell fetches bootstrap
- shell verifies runtime
- shell loads remote module
- remote runtime owns the Studio UI after `mount(...)`

### 2. Port Only the Admin Runtime Surfaces

The `studio_ui` project contains both admin and auth pages. Only the admin route
set should move into the remote runtime. Auth remains outside the Studio runtime
surface and should continue to be owned by the host/server auth stack.

### 3. Replace Next Router APIs With Runtime-Local Navigation

The mock currently depends on:

- `next/link`
- `next/navigation`
- `next/font`

The runtime port should replace those with:

- a base-path-aware link component that uses `history.pushState`
- pathname/params helpers backed by the remote runtime router state
- plain CSS font stacks instead of Next font loaders

This keeps the runtime bundle framework-agnostic once it is mounted.

### 4. Add a Runtime-Owned CSS Asset Path

The current remote runtime uses inline styles, while the mock uses Tailwind v4
utility classes and a global token sheet.

The port should add a dedicated runtime styling path:

- keep the mock's token system and visual language
- compile the runtime stylesheet as a Studio asset during `build-runtime`
- derive the stylesheet URL from the remote module URL so the mounted runtime
  can install its own styles without host-app participation

This avoids coupling the Studio UI to host-app Tailwind configuration.

### 5. Port Selectively, Not Blindly

Only the components actually needed by the approved route set should move into
`packages/studio`:

- shared admin layout
- sidebar/header/shell state
- mock data and view helpers
- route page components
- only the shadcn/Radix primitives used by those pages
- editor components needed for the document route

This keeps the first integration pass focused while still delivering the whole
approved route set.

### 6. Keep Backend Wiring Deferred But Shape the Runtime for It

Mock data is acceptable in this phase, but the port should keep clean seams for
future backend work:

- route-level page components should accept data via small local selectors or
  adapters rather than reading globals everywhere
- extra placeholder pages should remain obvious shell surfaces, not pretend to
  be wired features
- role visibility rules should already exist for admin-only surfaces so later
  real auth/session wiring can slot into the same structure

## Verification

Completion should be backed by:

- spec/doc updates for the extra Studio pages
- runtime build tests covering emitted CSS assets
- remote runtime tests covering:
  - route matching for the expanded `/admin/*` set
  - local navigation helpers
  - route rendering titles for the ported pages
  - role-aware nav visibility where applicable
- loader tests proving bootstrap/mount behavior remains unchanged
- host smoke verification so `http://127.0.0.1:4173/admin` renders the new UI
- `bun run format:check`
- `bun run check`

## Notes

- `docs/plans/` is local-only in this repository and must remain untracked.
- The current repository layout uses `packages/studio`, not `apps/studio`, so
  implementation should follow the actual workspace boundaries.
- `ROADMAP_TASKS.md` and `SPEC-006` are aligned for the existing route set, but
  the extra mock pages need the spec patch before implementation starts.
