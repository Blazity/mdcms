# CMS-74 MDX Component Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement shared toolbar and slash-command MDX component insertion, selection-bound props editing, inline host-app preview, and round-trip coverage for the generic `mdxComponent` editor node.

**Architecture:** Keep the existing generic `mdxComponent` TipTap extension and layer editor-owned selection/insertion behavior on top of it. Both insertion entrypoints use one catalog-backed controller, while the sidebar and node view bind to the currently selected MDX component node and reuse the existing props-editor lifecycle and host-bridge preview contracts.

**Tech Stack:** Bun, Nx, TypeScript, React 19, TipTap 3, node:test

---

### Task 1: Add shared MDX catalog and insertion helpers

**Files:**

- Create: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.ts`
- Test: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.test.ts`
- Modify: `packages/studio/src/lib/document-editor.ts`

**Step 1: Write the failing test**

Add tests that prove:

- catalog helpers infer `void` vs `wrapper` from extracted props / `children`
- insertion helpers build the expected `mdxComponent` attrs for both component kinds

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.test.ts`
Expected: FAIL because the helper file does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- catalog entry normalization
- kind inference helper
- shared insertion payload builder usable by toolbar and slash entrypoints

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.ts packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.test.ts packages/studio/src/lib/document-editor.ts
git commit -m "feat(studio): add mdx component catalog helpers"
```

### Task 2: Add editor command coverage for generic MDX component insertion and round-trip editing

**Files:**

- Modify: `packages/studio/src/lib/document-editor.ts`
- Modify: `packages/studio/src/lib/document-editor.test.ts`
- Modify: `packages/studio/src/lib/mdx-component-extension.test.ts`

**Step 1: Write the failing test**

Add tests that prove:

- inserting a void component through the editor produces self-closing MDX
- inserting a wrapper component produces opening and closing tags
- updating component attrs preserves component structure on serialize

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/document-editor.test.ts packages/studio/src/lib/mdx-component-extension.test.ts`
Expected: FAIL because insertion helpers / command wiring are not implemented yet.

**Step 3: Write minimal implementation**

Extend the editor setup so tests can insert or replace `mdxComponent` nodes through shared helpers and serialize them back through the existing markdown pipeline.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/document-editor.test.ts packages/studio/src/lib/mdx-component-extension.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/document-editor.ts packages/studio/src/lib/document-editor.test.ts packages/studio/src/lib/mdx-component-extension.test.ts
git commit -m "feat(studio): cover mdx component insertion round-trips"
```

### Task 3: Build the shared component picker used by toolbar and slash command

**Files:**

- Create: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-picker.tsx`
- Create: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-picker.test.tsx`
- Create: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-slash.ts`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/editor-toolbar.ts`

**Step 1: Write the failing test**

Add tests that prove:

- picker renders component names, descriptions, and `Void` / `Wrapper` badges
- picker shows deterministic `empty` and `forbidden` states
- toolbar and slash entrypoints both target the same picker behavior contract

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/mdx-component-picker.test.tsx`
Expected: FAIL because the picker and slash helper do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- shared picker component
- toolbar button wiring
- slash-command extension / helper
- one insertion callback path shared by both entrypoints

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/mdx-component-picker.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/components/editor/mdx-component-picker.tsx packages/studio/src/lib/runtime-ui/components/editor/mdx-component-picker.test.tsx packages/studio/src/lib/runtime-ui/components/editor/mdx-component-slash.ts packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx packages/studio/src/lib/runtime-ui/components/editor/editor-toolbar.ts
git commit -m "feat(studio): add shared mdx component picker"
```

### Task 4: Bind the props panel to the selected MDX node and render inline preview in the node view

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/components/editor/mdx-props-panel.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.test.tsx`
- Modify: `packages/studio/src/lib/mdx-props-editor-host.tsx`
- Modify: `packages/studio/src/lib/mdx-props-editor-host.test.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`

**Step 1: Write the failing test**

Add tests that prove:

- the panel follows the selected node instead of arbitrary catalog selection
- prop edits update selected node attrs
- preview uses host-bridge rendering with current component name and props
- deterministic fallback and `forbidden` behavior render correctly

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.test.tsx packages/studio/src/lib/mdx-props-editor-host.test.tsx`
Expected: FAIL because selection-bound preview and panel wiring are not implemented yet.

**Step 3: Write minimal implementation**

Wire the editor selection state into:

- the sidebar props panel
- the node view preview surface
- node-attr updates

Keep preview cleanup explicit on rerender and unmount.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.test.tsx packages/studio/src/lib/mdx-props-editor-host.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/components/editor/mdx-props-panel.tsx packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.tsx packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.test.tsx packages/studio/src/lib/mdx-props-editor-host.tsx packages/studio/src/lib/mdx-props-editor-host.test.tsx packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx
git commit -m "feat(studio): bind mdx props editing to selected nodes"
```

### Task 5: Document the operator and developer-visible behavior and run verification

**Files:**

- Modify: `packages/studio/README.md`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx`

**Step 1: Write the failing test**

Add or update the narrowest test needed if documentation or labels require a behavior assertion, such as toolbar label or picker copy.

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`
Expected: FAIL if a new behavior assertion is added, or skip if documentation-only.

**Step 3: Write minimal implementation**

Update:

- package README for toolbar + slash insertion and selection-bound props editing
- concise inline comments where the shared insertion / preview lifecycle is non-obvious

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/README.md packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx
git commit -m "docs(studio): document mdx component editor flow"
```

### Task 6: Final verification

**Files:**

- Verify only

**Step 1: Run focused package tests**

Run: `bun test packages/studio/src`
Expected: PASS

**Step 2: Run package type/build checks**

Run: `bun nx build studio && bun nx typecheck studio`
Expected: PASS

**Step 3: Run workspace baseline checks required by repo policy**

Run: `bun run format:check && bun run check`
Expected: PASS

**Step 4: Confirm local-only files remain unstaged**

Run: `git status --short`
Expected: `docs/plans/`, `ROADMAP_TASKS.md`, `AGENTS.md`, and other local-only files remain untracked and unstaged.
