# Studio UI Runtime Mock Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the approved `studio_ui` admin mock into the real `@mdcms/studio` remote runtime so `/admin/*` in the host app renders the new Studio UI through the existing bootstrap/runtime path.

**Architecture:** Keep the current `@mdcms/studio` shell, bootstrap verification, and remote module loading intact. Update the owning spec first for the extra mock-only admin pages, then add a runtime-owned CSS asset path, base-path-aware navigation helpers, and a selective port of the admin shell/pages into `packages/studio` with mock data preserved for now.

**Tech Stack:** Bun, TypeScript, React 19, Next host app, Tailwind v4 runtime stylesheet build, Radix UI primitives, TipTap, node:test, Nx

---

> Local workflow note: `docs/plans/` is local-only and must remain untracked. Do not include this plan file in commits.

### Task 1: Patch the owning spec and point-of-use docs for the expanded admin route set

**Files:**

- Modify: `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- Modify: `packages/studio/README.md`
- Modify: `apps/studio-example/README.md`

**Step 1: Write the spec delta for the extra mock-backed admin pages**

Add `/admin/media`, `/admin/schema`, `/admin/workflows`, and `/admin/api` to
the Studio internal route list in `SPEC-006`, and describe them as
runtime-owned navigable surfaces that are allowed to render shell-only/mock
content in this phase.

```md
- `/admin/media` - Media library shell surface
- `/admin/schema` - Schema explorer shell surface
- `/admin/workflows` - Workflow shell surface
- `/admin/api` - API playground shell surface
```

**Step 2: Align the runtime package and host-app docs**

Update `packages/studio/README.md` and `apps/studio-example/README.md` so both
documents describe the expanded `/admin/*` route set and clarify that the
additional pages are present as UI surfaces before backend wiring lands.

**Step 3: Run a targeted terminology check**

Run:

```bash
rg -n "/admin/media|/admin/schema|/admin/workflows|/admin/api|shell-only|mock content" docs/specs/SPEC-006-studio-runtime-and-ui.md packages/studio/README.md apps/studio-example/README.md
```

Expected: each new route appears in the updated docs.

**Step 4: Run format verification**

Run:

```bash
bun run format:check
```

Expected: PASS

**Step 5: Commit the spec/docs delta**

```bash
git add docs/specs/SPEC-006-studio-runtime-and-ui.md packages/studio/README.md apps/studio-example/README.md
git commit -m "docs(studio): define expanded admin route surfaces"
```

### Task 2: Add a runtime-owned stylesheet asset path for the remote Studio bundle

**Files:**

- Modify: `packages/studio/package.json`
- Modify: `packages/studio/src/lib/build-runtime.ts`
- Modify: `packages/studio/src/lib/build-runtime.test.ts`
- Modify: `packages/studio/src/lib/remote-module.ts`
- Create: `packages/studio/src/lib/runtime-ui/styles.css`
- Create: `packages/studio/src/lib/runtime-ui/style-installer.ts`
- Create: `packages/studio/src/lib/runtime-ui/style-installer.test.ts`

**Step 1: Write the failing runtime-style tests**

Add tests that assert:

- `buildStudioRuntimeArtifacts(...)` emits a CSS asset next to the JS entry
- the emitted CSS filename is derived from the same `buildId`
- `mount(...)` installs the stylesheet once and cleans up correctly on unmount

```ts
assert.match(result.cssFile, /^studio-runtime\.[a-f0-9]{16}\.css$/);
assert.equal(installedLinks[0]?.href.endsWith(result.cssFile), true);
```

**Step 2: Run the targeted tests to verify failure**

Run:

```bash
bun --cwd packages/studio test ./src/lib/build-runtime.test.ts ./src/lib/runtime-ui/style-installer.test.ts
```

Expected: FAIL because the runtime build currently emits only the JS module.

**Step 3: Implement the minimal CSS asset pipeline**

Update `build-runtime.ts` so it also emits a compiled stylesheet asset, and add
a small installer helper that derives the CSS URL from `import.meta.url` when
the remote runtime mounts.

```ts
const stylesheetUrl = new URL(
  import.meta.url.replace(/\.mjs$/, ".css"),
).toString();

const removeStyles = installStudioRuntimeStyles(stylesheetUrl);
```

Keep the first pass simple: one global runtime stylesheet asset owned by
`@mdcms/studio`.

**Step 4: Re-run the targeted tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/build-runtime.test.ts ./src/lib/runtime-ui/style-installer.test.ts
```

Expected: PASS

**Step 5: Commit the runtime-style slice**

```bash
git add packages/studio/package.json packages/studio/src/lib/build-runtime.ts packages/studio/src/lib/build-runtime.test.ts packages/studio/src/lib/remote-module.ts packages/studio/src/lib/runtime-ui/styles.css packages/studio/src/lib/runtime-ui/style-installer.ts packages/studio/src/lib/runtime-ui/style-installer.test.ts
git commit -m "feat(studio): add remote runtime stylesheet assets"
```

### Task 3: Add runtime-local navigation primitives and admin-shell state

**Files:**

- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`
- Create: `packages/studio/src/lib/runtime-ui/mock-data.ts`
- Create: `packages/studio/src/lib/runtime-ui/utils.ts`
- Create: `packages/studio/src/lib/runtime-ui/navigation.tsx`
- Create: `packages/studio/src/lib/runtime-ui/runtime-link.tsx`
- Create: `packages/studio/src/lib/runtime-ui/layout/admin-layout.tsx`
- Create: `packages/studio/src/lib/runtime-ui/layout/app-sidebar.tsx`
- Create: `packages/studio/src/lib/runtime-ui/layout/page-header.tsx`
- Create: `packages/studio/src/lib/runtime-ui/coming-soon.tsx`

**Step 1: Write the failing runtime-shell tests**

Cover:

- matching and rendering the expanded route set
- base-path-aware `navigate(...)` behavior
- active-nav highlighting under `/admin/*`
- role-aware nav visibility for admin-only pages

```ts
assert.equal(matchStudioRoute("/api", routes)?.id, "api");
assert.match(markup, /data-mdcms-nav-item="settings"/);
assert.doesNotMatch(viewerMarkup, /data-mdcms-nav-item="users"/);
```

**Step 2: Run the targeted remote-runtime tests to verify failure**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: FAIL because the current remote runtime still renders the placeholder
registry demo.

**Step 3: Implement the local navigation and shell foundations**

Add a small runtime router state layer and use it to power a reusable admin
layout, sidebar, header, and shared mock-data selectors.

```tsx
const { pathname, navigate } = useStudioNavigation(context.basePath);

return (
  <StudioNavigationProvider value={{ pathname, navigate }}>
    <AdminLayout>{children}</AdminLayout>
  </StudioNavigationProvider>
);
```

Keep `next/link`, `next/navigation`, and `next/font` out of the runtime port.

**Step 4: Re-run the targeted tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: PASS

**Step 5: Commit the navigation/shell slice**

```bash
git add packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/runtime-ui/mock-data.ts packages/studio/src/lib/runtime-ui/utils.ts packages/studio/src/lib/runtime-ui/navigation.tsx packages/studio/src/lib/runtime-ui/runtime-link.tsx packages/studio/src/lib/runtime-ui/layout/admin-layout.tsx packages/studio/src/lib/runtime-ui/layout/app-sidebar.tsx packages/studio/src/lib/runtime-ui/layout/page-header.tsx packages/studio/src/lib/runtime-ui/coming-soon.tsx
git commit -m "feat(studio): add runtime admin shell navigation"
```

### Task 4: Port the shared UI primitives and editor surfaces used by the approved admin pages

**Files:**

- Modify: `packages/studio/package.json`
- Create: `packages/studio/src/lib/runtime-ui/editor/editor-sidebar.tsx`
- Create: `packages/studio/src/lib/runtime-ui/editor/tiptap-editor.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/avatar.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/badge.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/breadcrumb.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/button.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/card.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/checkbox.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/collapsible.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/dialog.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/dropdown-menu.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/input.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/label.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/pagination.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/select.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/separator.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/switch.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/table.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/tabs.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/textarea.tsx`
- Create: `packages/studio/src/lib/runtime-ui/ui/tooltip.tsx`

**Step 1: Write the failing editor and primitive smoke tests**

Add one small rendering test that mounts the document route and asserts the
ported editor/sidebar surfaces and core primitives render without throwing.

```ts
assert.match(markup, /Document Editor/);
assert.match(markup, /data-mdcms-editor-sidebar/);
```

**Step 2: Run the targeted tests to verify failure**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: FAIL because the route components and their primitive dependencies do
not exist yet.

**Step 3: Port the minimal component set used by the admin pages**

Copy only the primitives and editor surfaces referenced by the approved page
set. Trim mock-only dependencies that are not used by those pages, and prefer a
small local theme toggle over bringing `next-themes` into the runtime.

```tsx
export function StudioButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-slot="button" {...props} />;
}
```

Update `packages/studio/package.json` with the exact Radix, icon, and TipTap
runtime dependencies required by this subset.

**Step 4: Re-run the targeted tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: PASS

**Step 5: Commit the primitive/editor slice**

```bash
git add packages/studio/package.json packages/studio/src/lib/runtime-ui/editor/editor-sidebar.tsx packages/studio/src/lib/runtime-ui/editor/tiptap-editor.tsx packages/studio/src/lib/runtime-ui/ui/avatar.tsx packages/studio/src/lib/runtime-ui/ui/badge.tsx packages/studio/src/lib/runtime-ui/ui/breadcrumb.tsx packages/studio/src/lib/runtime-ui/ui/button.tsx packages/studio/src/lib/runtime-ui/ui/card.tsx packages/studio/src/lib/runtime-ui/ui/checkbox.tsx packages/studio/src/lib/runtime-ui/ui/collapsible.tsx packages/studio/src/lib/runtime-ui/ui/dialog.tsx packages/studio/src/lib/runtime-ui/ui/dropdown-menu.tsx packages/studio/src/lib/runtime-ui/ui/input.tsx packages/studio/src/lib/runtime-ui/ui/label.tsx packages/studio/src/lib/runtime-ui/ui/pagination.tsx packages/studio/src/lib/runtime-ui/ui/select.tsx packages/studio/src/lib/runtime-ui/ui/separator.tsx packages/studio/src/lib/runtime-ui/ui/switch.tsx packages/studio/src/lib/runtime-ui/ui/table.tsx packages/studio/src/lib/runtime-ui/ui/tabs.tsx packages/studio/src/lib/runtime-ui/ui/textarea.tsx packages/studio/src/lib/runtime-ui/ui/tooltip.tsx
git commit -m "feat(studio): port admin runtime UI primitives"
```

### Task 5: Port the approved admin page components and wire them into the runtime route map

**Files:**

- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`
- Create: `packages/studio/src/lib/runtime-ui/pages/dashboard-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/content-index-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/content-type-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/environments-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/users-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/settings-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/trash-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/media-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/schema-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/workflows-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/api-playground-page.tsx`

**Step 1: Write the failing route-render tests**

Cover the page titles and route ids for:

- `/admin`
- `/admin/content`
- `/admin/content/blogpost`
- `/admin/content/blogpost/1`
- `/admin/environments`
- `/admin/users`
- `/admin/settings`
- `/admin/trash`
- `/admin/media`
- `/admin/schema`
- `/admin/workflows`
- `/admin/api`

```ts
assert.match(render("/admin/media"), /Media Library/);
assert.match(render("/admin/api"), /API Playground/);
assert.match(render("/admin/workflows"), /Coming Soon/);
```

**Step 2: Run the targeted tests to verify failure**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: FAIL because the runtime still renders placeholder surfaces or is
missing the new routes.

**Step 3: Port the page components and update the route registry**

Wire the new page components into the remote runtime route map and keep the
current route IDs stable where possible.

```tsx
const routes: StudioRouteDefinition[] = [
  { id: "dashboard", path: "/", render: () => <DashboardPage /> },
  { id: "content.index", path: "/content", render: () => <ContentIndexPage /> },
  { id: "api", path: "/api", render: () => <ApiPlaygroundPage /> },
];
```

Keep the placeholder pages explicit for mock-only surfaces rather than adding
fake backend calls.

**Step 4: Re-run the targeted tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/remote-studio-app.test.ts
```

Expected: PASS

**Step 5: Commit the page-port slice**

```bash
git add packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/runtime-ui/pages/dashboard-page.tsx packages/studio/src/lib/runtime-ui/pages/content-index-page.tsx packages/studio/src/lib/runtime-ui/pages/content-type-page.tsx packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx packages/studio/src/lib/runtime-ui/pages/environments-page.tsx packages/studio/src/lib/runtime-ui/pages/users-page.tsx packages/studio/src/lib/runtime-ui/pages/settings-page.tsx packages/studio/src/lib/runtime-ui/pages/trash-page.tsx packages/studio/src/lib/runtime-ui/pages/media-page.tsx packages/studio/src/lib/runtime-ui/pages/schema-page.tsx packages/studio/src/lib/runtime-ui/pages/workflows-page.tsx packages/studio/src/lib/runtime-ui/pages/api-playground-page.tsx
git commit -m "feat(studio): port admin runtime pages"
```

### Task 6: Verify the real embed path and finalize package docs

**Files:**

- Modify: `packages/studio/README.md`
- Modify: `apps/studio-example/README.md`
- Modify: `packages/studio/src/lib/studio-loader.test.ts`
- Modify: `packages/studio/src/lib/studio.test.ts`

**Step 1: Add the final regression tests**

Cover:

- loader behavior still mounts the remote runtime with the same context
- the shell still handles startup errors after the UI swap
- no route-port work changed bootstrap semantics

```ts
assert.deepEqual(contexts[0], {
  apiBaseUrl: "http://localhost:4000",
  basePath: "/admin",
  auth: { mode: "cookie" },
  hostBridge: validHostBridge,
});
```

**Step 2: Run the targeted studio tests**

Run:

```bash
bun --cwd packages/studio test ./src/lib/studio-loader.test.ts ./src/lib/studio.test.ts ./src/lib/remote-studio-app.test.ts
```

Expected: PASS

**Step 3: Run workspace verification**

Run:

```bash
bun run format:check
bun run check
bun run studio:embed:smoke
```

Expected: PASS for all three commands, and the smoke check should prove that
`http://127.0.0.1:4173/admin` renders the new Studio runtime instead of the old
placeholder.

**Step 4: Update any remaining point-of-use docs**

If the runtime README or smoke-app README still describe the old placeholder UI,
patch them now so the embed workflow docs match reality.

**Step 5: Commit the verification/docs slice**

```bash
git add packages/studio/README.md apps/studio-example/README.md packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/studio.test.ts
git commit -m "test(studio): verify embedded admin runtime swap"
```
