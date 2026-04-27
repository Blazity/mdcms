# CMS-74 MDX Component Editor Design

Date: 2026-03-26
Task: `CMS-74 - Implement MdxComponent node view insert/edit/serialize/live preview`

## Notes

- This design doc is intentionally local-only under `docs/plans/` per repo workflow.
- The owning spec is [SPEC-007](../specs/SPEC-007-editor-mdx-and-collaboration.md).
- No spec delta is required before implementation. The task is already fully specified in `SPEC-007`.

## Spec Delta Summary

1. No new spec text is needed.
2. The affected behavior is the document editor's MDX component insertion, selection-bound prop editing, live preview, and MDX round-tripping.
3. Acceptance criteria 1-7 rely on the existing `SPEC-007` sections for:
   - generic `MdxComponent` node behavior
   - void vs wrapper semantics
   - local catalog-backed insertion
   - custom-editor and auto-form prop editing
   - inline preview through the host bridge
   - lifecycle states: `loading`, `empty`, `error`, `forbidden`

## Current State

The repo already contains most of the substrate for `CMS-74`:

- `packages/studio/src/lib/mdx-component-extension.ts`
  - generic `mdxComponent` TipTap node
  - MDX tokenizer/parser/renderer
  - void vs wrapper serialization behavior
- `packages/studio/src/lib/mdx-props-editor-host.tsx`
  - custom props editor lifecycle
  - auto-form fallback
  - `loading`, `empty`, `error`, and `forbidden` states
- `packages/studio/src/lib/studio-loader.ts`
  - local MDX catalog preparation
  - host bridge wiring
  - async props editor resolution
- `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-node-view.tsx`
  - baseline node chrome for wrapper and void components

The main gap is editor integration:

- the toolbar still marks component insertion as planned-only
- there is no slash-command support
- the props panel is catalog-driven instead of selection-driven
- the node view does not yet render inline host-app preview
- there is no shared insertion controller used by both entrypoints

## Decision

Implement one shared MDX component insertion and editing flow with two entrypoints:

1. toolbar picker
2. `/` slash command

Both entrypoints must use the same catalog source, selection rules, insertion defaults, and permission gating.

## Architecture

### 1. Shared insertion controller

Introduce editor-local MDX helpers that:

- read the MDX component catalog from `StudioMountContext`
- infer whether a catalog entry is `void` or `wrapper`
- insert a generic `mdxComponent` node with:
  - `componentName`
  - `props`
  - `isVoid`
- create a stable default insertion outcome:
  - void components insert as self-closing nodes with empty content
  - wrapper components insert with an empty content hole and focus moves into the wrapper body

This controller becomes the single insertion path for both toolbar and slash command entrypoints.

### 2. Editor-owned MDX selection state

`TipTapEditor` becomes the owner of:

- current selected `mdxComponent` node
- picker open/closed state
- insertion mode (`toolbar` or `slash`)
- read-only / forbidden behavior passed down to editing surfaces

The props panel must bind to the selected node, not to an arbitrary catalog entry.

### 3. Toolbar picker and slash command

Add one picker UI component that can be opened from:

- the toolbar `Insert Component` button
- a slash-command extension when the user types `/`

The picker must show:

- component name
- optional description
- component kind badge: `Void` or `Wrapper`

The picker state contract must cover:

- `ready`: list available components
- `empty`: no local components registered
- `forbidden`: list visible but insertion disabled

### 4. Selection-bound props editing

Replace the current catalog proof-surface behavior with selection-bound editing:

- selecting a component node reveals the props panel for that node
- prop mutations update node attrs immediately
- custom editor lifecycle remains owned by `MdxPropsEditorHost`
- auto-form fallback still derives from `extractedProps` + `propHints`

Lifecycle expectations:

- `loading`: async custom editor pending
- `ready`: custom editor resolved and mounted
- `empty`: no editable props for this node
- `error`: resolver rejects or render boundary fails
- `forbidden`: session may inspect but not mutate

### 5. Inline preview

The node view must render the actual host-app component inside the editor canvas via `context.hostBridge.renderMdxPreview(...)`.

Preview behavior:

- preview rerenders when node props change
- preview remains visible in read-only mode
- missing host component resolution produces a deterministic fallback instead of silent blank output
- preview mounting always cleans up on node change/unmount

### 6. Serialization

Keep the existing generic node and extend tests so the pipeline proves:

- parse -> edit -> serialize for void components
- parse -> edit -> serialize for wrapper components
- prop edits preserve component structure
- wrapper child content continues to serialize as nested markdown

## UI Behavior

### Insertion

1. User opens insertion via toolbar or `/`.
2. Shared picker lists components from `context.mdx.catalog.components`.
3. User selects one component.
4. Editor inserts the generic node with correct `isVoid`.
5. The newly inserted node becomes selected.
6. The sidebar props panel opens for that node.
7. For wrapper components, focus may move into the nested body after insertion.

### Editing

- Clicking or selecting a component node activates the component panel.
- Prop edits update node attrs immediately.
- Preview rerenders from the same local document state.
- Wrapper child content stays editable in the document flow through the existing content hole.

### Read-only and forbidden

- Preview remains visible.
- Picker may remain discoverable, but insertion actions are disabled.
- Prop editors mount in inspection mode where applicable, but `onChange` cannot mutate node attrs.

## Testing Strategy

### Unit and integration coverage

- extend `mdx-component-extension` tests for round-trip edits
- add editor command tests through `createDocumentEditor(...)`
- add picker and selection helper tests
- add node-view tests for preview and fallback states
- add props-panel tests for selection-bound behavior

### Verification target

Task verification calls for node-view e2e tests. Within the current package test setup, the implementation should at minimum add editor integration tests that exercise insertion, selection, and serialization end-to-end through the TipTap editor API. If the existing runtime test surface can support a heavier React integration path without new infrastructure, add that as well.

## Scope Boundaries

In scope:

- generic `mdxComponent` insertion flow
- toolbar picker
- slash command
- selection-bound prop editing
- inline preview
- lifecycle states required by spec
- round-trip serialization coverage
- README / inline documentation updates

Out of scope:

- generalized editor command palette
- unrelated slash actions
- collaboration transport
- backend API changes
- broader media workflows beyond existing prop widget contracts
