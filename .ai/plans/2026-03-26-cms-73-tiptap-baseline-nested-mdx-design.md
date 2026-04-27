# CMS-73 TipTap Baseline and Nested MDX Content Design

> Local-only planning note. This file is not canonical product documentation and should remain uncommitted.

## Summary

Implement `CMS-73` as a real editor-core upgrade in `@mdcms/studio` that:

- absorbs the missing TipTap editor baseline currently expected from earlier
  roadmap slices
- keeps the current document-route UI shell and editor-panel layout intact
- introduces a generic `MdxComponent` TipTap node for wrapper and void MDX
  components
- enables nested rich-text editing for wrapper component `children` inside the
  same editor document and autosave path
- proves nested MDX round-tripping through targeted serialization and editor
  tests

## Spec Delta Summary

No new spec text is required before implementation.

The owning contract is already present in
`docs/specs/SPEC-007-editor-mdx-and-collaboration.md`:

- Markdown/MDX content is edited through TipTap.
- MDX components are modeled as a single generic `MdxComponent` node.
- Wrapper components expose a `block*` content hole for nested child content.
- Nested child content is edited inline within the component block.
- Serialization recursively renders wrapper children back into MDX.

This task is therefore an implementation catch-up to an existing spec-owned
contract, not a new product-surface change.

## Current Gap

The current repo already has:

- a reusable markdown pipeline in
  `packages/studio/src/lib/markdown-pipeline.ts`
- local MDX catalog transport and extracted-prop metadata in
  `@mdcms/shared` and `@mdcms/studio`
- a runtime document route shell with save-state scaffolding and sidebars

What is still missing:

- a real `@tiptap/react` editor surface on the document route
- MDX-aware TipTap extensions for parsing/rendering component nodes
- a generic `MdxComponent` node implementation
- inline wrapper-node content editing
- round-trip tests for nested wrapper content

The current
`packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx`
remains a mock toolbar plus textarea, which is below the baseline already
described by `SPEC-007`.

## Approved Direction

### Keep the current document UI

Retain the current editor-page shell:

- header
- locale tabs
- publish dialog
- right sidebar
- overall editor panel footprint

This task upgrades behavior and editor internals, not the surrounding document
page layout.

### Absorb the missing baseline into CMS-73

Treat the missing “real TipTap editor” work as part of `CMS-73` so the task can
actually satisfy its own nested-content acceptance criteria and produce a
usable dependency for `CMS-74`.

This avoids:

- building throwaway adapter code on top of the mock textarea
- splitting foundational editor work across another unplanned slice
- forcing `CMS-74` to redo baseline editor integration before it can add node
  views and insertion UX

## Architecture

### Package ownership

`@mdcms/shared` continues to own:

- the MDX catalog contract
- extracted prop metadata
- the `children: { type: "rich-text" }` signal used to distinguish wrapper
  components

`@mdcms/studio` owns:

- TipTap editor instantiation
- MDX parsing and rendering integration
- the generic `MdxComponent` extension
- wrapper node-view rendering and nested editing
- document-route editor UI wiring

No backend or SDK contract changes are needed for this task because the editor
still persists a single markdown/MDX body string.

### Editor document model

Use one top-level TipTap document as the only local editor state.

- normal markdown blocks live directly in that document
- wrapper MDX components become `MdxComponent` nodes with nested `content`
- void MDX components become self-closing `MdxComponent` nodes with no child
  content

Nested wrapper content must not be modeled as a separate draft state or a
second disconnected editor document. The editable child region should be driven
by the same ProseMirror tree so page-level change handling and serialization
remain whole-document operations.

### Generic `MdxComponent` node

Introduce a single editor node type that carries:

- `componentName`
- `props`
- wrapper-vs-void semantics derived from the local MDX catalog

Behavior:

- if `extractedProps.children?.type === "rich-text"`, treat the component as a
  wrapper and allow `block*` child content
- otherwise treat it as void and serialize it as self-closing MDX

This keeps the editor schema stable as the host app adds or removes registered
components.

### Markdown/MDX pipeline

Extend the existing markdown pipeline rather than replacing it.

- keep `parseMarkdownToDocument(...)`
- keep `serializeDocumentToMarkdown(...)`
- keep `roundTripMarkdown(...)`

Add MDX-component-aware extensions so the pipeline can:

- parse MDX component syntax into `MdxComponent` nodes
- preserve JSON props in node attrs
- recursively serialize wrapper children back into markdown within opening and
  closing tags

The implementation should stay compatible with the current spec direction of a
custom tokenizer plus custom TipTap extension. If the parser work exposes a
clear limitation for nested MDX, the limitation should be documented in code
comments for the later fallback evaluation path already named in `SPEC-007`.

### Node-view UI

Wrapper node views should remain minimal in `CMS-73`.

They need:

- visible wrapper chrome so editors can identify the component boundary
- component name display
- a nested editable content region using the TipTap node-view content hole

They do not need in this slice:

- full host-app live preview rendering
- component insertion panel
- slash-command integration
- polished props panel selection syncing

That work remains aligned with `CMS-74`.

## Scope Boundaries

### In scope

- replace the mock textarea editor internals with a real TipTap React editor
- keep the current route-level UI shell
- add the generic `MdxComponent` editor extension
- support wrapper child-content editing inside component nodes
- keep nested content in the same local document state and `onChange` path
- serialize wrapper children back to MDX
- document foundational behavior at point of use

### Out of scope

- full component insertion UX
- slash command / toolbar insertion flows
- host-app live component preview inside node views
- deep props-panel selection synchronization
- collaboration transport / Yjs wiring

`SPEC-007` mentions collaboration participation for nested content, but that
same spec also defers collaboration transport post-MVP. For this slice, the
practical equivalent is that nested content stays in the same local editor
document and autosave pipeline so future collaboration can bind to the same
document tree later.

## Testing Strategy

Use TDD in this order:

1. markdown-pipeline tests for wrapper parse/serialize round trips
2. focused `MdxComponent` extension tests for wrapper-vs-void behavior
3. React editor tests for rendering the real TipTap surface and updating nested
   wrapper content
4. route-level integration checks that document save-state callbacks still fire
   from editor changes

Verification should specifically prove:

- wrapper MDX parses into editor state without dropping children
- nested markdown formatting inside wrapper children round-trips correctly
- editing nested child content updates the parent document serialization
- current document-page shell behavior still works with the upgraded editor

## Risks and Constraints

- The current document route is a runtime-shell scaffold, so the real editor
  integration should be implemented as reusable `@mdcms/studio` infrastructure
  rather than page-only glue.
- The task intentionally stops short of full `CMS-74` preview and insertion
  UX; otherwise the slice would sprawl beyond the nested-content foundation.
- `docs/plans/` is local-only in this repo, so this design note must remain
  uncommitted.
