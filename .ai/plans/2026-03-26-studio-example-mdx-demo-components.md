# Studio Example MDX Demo Components Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Register `Chart`, `Callout`, and `PricingTable` in `apps/studio-example` so the sample admin Studio route can exercise local MDX insertion, preview, auto-form editing, wrapper editing, and custom props editor loading through the real prepared-config path.

**Architecture:** Keep `apps/studio-example/mdcms.config.ts` as the source of truth for local MDX component registration. Add the example component modules inside the sample app, prepare the full config on the admin server route with `prepareStudioConfig(...)`, and document that the raw `/demo/content` pages remain renderer-free inspection surfaces.

**Tech Stack:** Bun, Nx, TypeScript, React 19, Next.js 15, node:test, react-dom/server

---

### Task 1: Add demo-host MDX component registrations and component modules

**Files:**

- Create: `apps/studio-example/components/mdx/Chart.tsx`
- Create: `apps/studio-example/components/mdx/Callout.tsx`
- Create: `apps/studio-example/components/mdx/PricingTable.tsx`
- Create: `apps/studio-example/components/mdx/PricingTable.editor.tsx`
- Modify: `apps/studio-example/mdcms.config.ts`
- Test: `apps/studio-example/mdcms.config.test.ts`

**Step 1: Write the failing test**

Add a config test that imports `apps/studio-example/mdcms.config.ts` and asserts:

- `config.components` exists
- registered component names are exactly `Chart`, `Callout`, and `PricingTable`
- `PricingTable` includes `propsEditor` and `loadPropsEditor`
- `Chart` includes a `color` prop hint suitable for the auto-form demo

**Step 2: Run test to verify it fails**

Run: `bun test apps/studio-example/mdcms.config.test.ts`
Expected: FAIL because the test file and component registrations do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- lightweight presentational sample components
- a simple `PricingTable` custom editor using `PropsEditorComponent`
- `mdcms.config.ts` component registrations with relative `importPath` values and local loader callbacks

Example registration shape:

```ts
{
  name: "Chart",
  importPath: "./components/mdx/Chart",
  description: "Render a small chart card in MDX content.",
  load: () => import("./components/mdx/Chart").then((m) => m.Chart),
  propHints: {
    color: { widget: "color-picker" },
  },
}
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/studio-example/mdcms.config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/studio-example/components/mdx/Chart.tsx apps/studio-example/components/mdx/Callout.tsx apps/studio-example/components/mdx/PricingTable.tsx apps/studio-example/components/mdx/PricingTable.editor.tsx apps/studio-example/mdcms.config.ts apps/studio-example/mdcms.config.test.ts
git commit -m "feat(studio-example): register mdx demo components"
```

### Task 2: Switch the sample admin route to prepared Studio config

**Files:**

- Modify: `apps/studio-example/app/admin/[[...path]]/page.tsx`
- Modify: `apps/studio-example/app/admin/admin-studio-client.tsx`
- Test: `apps/studio-example/app/admin/[[...path]]/page.test.tsx`

**Step 1: Write the failing test**

Add a narrow route test that proves the admin page no longer passes `createStudioEmbedConfig(config)` and instead provides a config object that still includes the registered MDX components.

The test can import the default page function, render or inspect its returned element tree, and assert that the `config` prop handed to `AdminStudioClient` contains `components`.

**Step 2: Run test to verify it fails**

Run: `bun test 'apps/studio-example/app/admin/[[...path]]/page.test.tsx'`
Expected: FAIL because the route still strips component registrations through `createStudioEmbedConfig(...)`.

**Step 3: Write minimal implementation**

Implement:

- server-side `prepareStudioConfig(...)` usage in the admin page
- `cwd` and `tsconfigPath` arguments that resolve correctly from `apps/studio-example`
- any small prop-type adjustments needed in `AdminStudioClient`

Example route shape:

```tsx
const preparedConfig = await prepareStudioConfig(config, {
  cwd: process.cwd(),
  tsconfigPath: join(process.cwd(), "apps/studio-example/tsconfig.json"),
});

return <AdminStudioClient config={preparedConfig} />;
```

**Step 4: Run test to verify it passes**

Run: `bun test 'apps/studio-example/app/admin/[[...path]]/page.test.tsx'`
Expected: PASS

**Step 5: Commit**

```bash
git add 'apps/studio-example/app/admin/[[...path]]/page.tsx' apps/studio-example/app/admin/admin-studio-client.tsx 'apps/studio-example/app/admin/[[...path]]/page.test.tsx'
git commit -m "feat(studio-example): prepare local mdx config for studio"
```

### Task 3: Document the sample-app behavior

**Files:**

- Modify: `apps/studio-example/README.md`

**Step 1: Write the failing test**

Skip. This task is documentation-only.

**Step 2: Run test to verify it fails**

Skip. No behavior assertion is needed beyond the focused tests in Tasks 1-2.

**Step 3: Write minimal implementation**

Update the README to explain:

- the sample app now registers `Chart`, `Callout`, and `PricingTable`
- the admin route uses prepared config so Studio receives local MDX metadata
- the `/demo/content` pages still show raw content and do not render MDX

**Step 4: Run test to verify it passes**

Run: `bun test apps/studio-example`
Expected: PASS for the focused sample-app tests added earlier.

**Step 5: Commit**

```bash
git add apps/studio-example/README.md
git commit -m "docs(studio-example): document mdx demo components"
```

### Task 4: Final verification

**Files:**

- Verify only

**Step 1: Run focused sample-app tests**

Run: `bun test apps/studio-example`
Expected: PASS

**Step 2: Run demo-host build and typecheck**

Run: `bun nx build studio-example && bun nx typecheck studio-example`
Expected: PASS

**Step 3: Run workspace baseline checks required by repo policy**

Run: `bun run format:check && bun run check`
Expected: PASS

**Step 4: Confirm local-only files remain unstaged**

Run: `git status --short`
Expected: `docs/plans/`, `ROADMAP_TASKS.md`, `AGENTS.md`, and other local-only paths remain untracked and unstaged.
