# CMS-73 TipTap Baseline and Nested MDX Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock document editor internals with a real TipTap-based editor in `@mdcms/studio`, then add generic `MdxComponent` wrapper-node support so nested MDX child content can be edited inline and serialized through the same local document/autosave pipeline.

**Architecture:** Keep the current document-route UI shell and sidebar layout, but replace the textarea-based mock editor with a real `@tiptap/react` editor backed by the existing markdown pipeline. Introduce a reusable generic `MdxComponent` TipTap extension plus a minimal node view for wrapper components whose `children` prop is typed as `rich-text` in the local MDX catalog. Keep nested child content inside the same ProseMirror document tree so page-level change handling still serializes one markdown/MDX body string.

**Tech Stack:** Bun, Nx, TypeScript, node:test, React, TipTap (`@tiptap/core`, `@tiptap/react`, `@tiptap/markdown`, `@tiptap/starter-kit`)

---

### Task 1: Lock Down the Missing Editor-Core Contract With Failing Tests

**Files:**

- Modify: `packages/studio/src/lib/markdown-pipeline.test.ts`
- Create: `packages/studio/src/lib/mdx-component-extension.test.ts`

**Step 1: Add failing round-trip tests for wrapper MDX**

Cover:

- parsing and serializing `<Callout>Plain text</Callout>`
- nested markdown inside wrapper children
- stable second-pass serialization for wrapper content

**Step 2: Add failing extension tests**

Cover:

- wrapper classification when `children` is extracted as `rich-text`
- void classification when `children` is absent
- prop retention across parse/render for both node shapes

**Step 3: Run the tests to verify failure**

Run: `bun test packages/studio/src/lib/markdown-pipeline.test.ts packages/studio/src/lib/mdx-component-extension.test.ts`

Expected: FAIL because the current markdown pipeline has no MDX-component extension or wrapper-child support.

### Task 2: Implement the Generic `MdxComponent` Extension and MDX Parsing Helpers

**Files:**

- Create: `packages/studio/src/lib/mdx-component-extension.ts`
- Modify: `packages/studio/src/lib/markdown-pipeline.ts`
- Modify: `packages/studio/src/lib/package-boundaries.test.ts`

**Step 1: Implement the extension**

Add a reusable generic TipTap node extension that carries:

- `componentName`
- `props`
- wrapper-vs-void handling

Keep wrapper detection catalog-aware and driven by extracted `children` metadata.

**Step 2: Extend the markdown pipeline**

Update the pipeline helpers so they can accept the MDX catalog context needed to:

- parse MDX component tokens into `MdxComponent` nodes
- serialize wrapper children recursively back into MDX
- preserve existing plain-markdown behavior for documents without MDX components

**Step 3: Re-run the failing editor-core tests**

Run: `bun test packages/studio/src/lib/markdown-pipeline.test.ts packages/studio/src/lib/mdx-component-extension.test.ts`

Expected: PASS

### Task 3: Replace the Mock Textarea With a Real TipTap React Editor

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx`
- Create: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`

**Step 1: Add failing component tests**

Cover:

- initial markdown loads into the editor
- editor changes call `onChange` with serialized markdown/MDX
- wrapper child edits flow through the same callback as top-level edits

**Step 2: Run the component tests to verify failure**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`

Expected: FAIL because the current component is still a mock textarea and does not mount TipTap.

**Step 3: Implement the real editor surface**

Replace the textarea internals with:

- `@tiptap/react` editor setup
- the existing toolbar chrome wired to actual editor commands where already practical
- serialization via the updated markdown pipeline
- minimal wrapper-node rendering support

Keep the current editor-panel footprint and surrounding chrome intact.

**Step 4: Re-run the component tests**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`

Expected: PASS

### Task 4: Add Minimal Wrapper Node Views for Nested Child Editing

**Files:**

- Create: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`

**Step 1: Add failing node-view behavior tests**

Cover:

- wrapper nodes render component chrome plus an editable child region
- void nodes do not expose nested content areas
- nested child edits preserve wrapper boundaries in serialized output

**Step 2: Run the relevant tests to verify failure**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`

Expected: FAIL because wrapper node views do not exist yet.

**Step 3: Implement the node view**

Build a minimal node view that:

- shows the component name and wrapper boundary
- uses the TipTap content hole for wrapper child editing
- avoids full preview or insertion UX that belongs to `CMS-74`

**Step 4: Re-run the editor tests**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx`

Expected: PASS

### Task 5: Wire the Document Route to the Real Editor Without Changing the Shell UI

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/editor-sidebar.tsx`

**Step 1: Add a failing document-route behavior test if coverage is missing**

Cover:

- editor changes still drive the save-status indicator path
- the existing page shell continues to render with the upgraded editor
- the optional MDX props sidebar surface still mounts unchanged when context is present

**Step 2: Run the affected tests or add targeted coverage**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`

Expected: FAIL or expose missing route/editor coupling.

**Step 3: Implement the route wiring**

Pass real content and catalog context into the upgraded editor component while:

- preserving the current header, publish dialog, locale tabs, and sidebar layout
- keeping save-state updates driven by editor changes
- avoiding unrelated UI redesign

**Step 4: Re-run the route-level checks**

Run: `bun test packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`

Expected: PASS

### Task 6: Document the Foundation at Point of Use

**Files:**

- Modify: `packages/studio/README.md`
- Modify: `packages/studio/src/lib/markdown-pipeline.ts`
- Modify: `packages/studio/src/lib/mdx-component-extension.ts`

**Step 1: Add concise implementation comments**

Document:

- why wrapper child content stays in the same ProseMirror document
- how wrapper-vs-void classification is derived from the local MDX catalog

**Step 2: Update the package README**

Add notes for:

- the real TipTap editor baseline
- generic `MdxComponent` support
- nested wrapper-content serialization support

**Step 3: Verify the docs reference the new behavior**

Run: `rg -n "MdxComponent|nested|wrapper|TipTap" packages/studio/README.md packages/studio/src/lib/markdown-pipeline.ts packages/studio/src/lib/mdx-component-extension.ts`

Expected: the foundational behavior is described at the point of use.

### Task 7: Run Verification

**Files:**

- Modify only files touched above

**Step 1: Run targeted tests**

Run: `bun test packages/studio/src/lib/markdown-pipeline.test.ts packages/studio/src/lib/mdx-component-extension.test.ts packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`

Expected: PASS

**Step 2: Run format check**

Run: `bun run format:check`

Expected: PASS

**Step 3: Run baseline workspace validation**

Run: `bun run check`

Expected: PASS
