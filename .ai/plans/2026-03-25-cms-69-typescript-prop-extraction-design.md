# CMS-69 TypeScript Prop Extraction Design

> Local-only planning note. This file is not canonical product documentation and should remain uncommitted.

## Summary

`CMS-69` should establish a stable local prop-extraction contract for MDX
components without inventing a browser-time reflection system or a required
manual codegen command.

The embedded Studio must receive plain serializable prop metadata, but the
source of truth remains the host app's TypeScript component definitions. That
means extraction belongs on a Node-side integration path in the consumer
workspace, not in the browser and not on the backend.

## Problem

The current codebase has the first half of the local MDX catalog model from
`CMS-68`:

- `config.components` is the source of truth.
- Studio can pass through `extractedProps` if somebody adds them manually.
- The shared contract still treats `extractedProps` as `Record<string, unknown>`.

What is still missing for `CMS-69`:

- a normative serializable extracted-prop shape
- deterministic filtering rules for unsupported props
- a reusable Node-side extractor that can inspect local TypeScript source
- a supported Studio integration path that prepares config before the client
  shell renders

Without that, downstream tasks (`CMS-70` through `CMS-74`) would build on an
unstable pseudo-contract.

## Approved Direction

### Extraction boundary

Prop extraction happens on a Node-side integration path in the consumer
workspace.

Supported integration points:

- framework server components
- framework/build hooks
- dev-server hooks
- explicit local scripts

Not supported:

- browser-time TypeScript inspection
- backend-owned component-catalog sync
- requiring editors to type raw JSON for common props

### Contract ownership

`@mdcms/shared` owns the serializable extracted-prop contract and its runtime
validation rules.

Planned ownership split:

- `@mdcms/shared`
  - exported `MdxExtractedProp` / `MdxExtractedProps` contract
  - strict validation of extracted props inside Studio mount/catalog contracts
  - a Node-only extractor subpath reusable by Studio and future CLI/tooling
- `@mdcms/studio/runtime`
  - a Studio-facing prepare helper that consumes raw config plus workspace
    context and returns config enriched with `extractedProps`
- `@mdcms/studio`
  - continues to consume prepared serializable metadata only

This keeps cross-cutting contract shape in shared while avoiding a future
dependency from CLI tooling onto the Studio package.

### Supported normalized shapes

The extracted metadata should stay intentionally small and fail closed:

- `string`
- `number`
- `boolean`
- `date`
- string-literal `enum`
- `array` of `string` or `number`
- `json` only when the developer explicitly opts the prop into a JSON editor
  and the TypeScript shape is JSON-serializable
- `rich-text` for `children` / `ReactNode`

Requiredness is derived from declared TypeScript optionality only. The
extractor does not inspect runtime default expressions in component bodies.

### Unsupported-by-default shapes

Unsupported props are omitted from `extractedProps` and hidden from the
auto-generated Studio form:

- functions and callbacks
- refs
- React elements/components other than `children`
- object/record/map/set/tuple/class-instance shapes without explicit `json`
  opt-in
- mixed unions, intersections, unresolved generics
- arrays whose item type is not exactly `string` or `number`
- anything not JSON-serializable or not deterministically normalizable

This keeps the contract safe and stable for `CMS-70` form mapping.

### Integration model

The preferred host-app flow is:

1. import authored `mdcms.config.ts` on the Node side
2. call a prepare helper that resolves component source files and extracts prop
   metadata
3. pass the prepared config into the client `<Studio />` shell

This means the existing direct-client-import story remains acceptable for
preview-only MDX registration, but auto-generated props editing depends on the
prepared config path.

## Consequences

### Benefits

- No backend coupling for MDX component metadata.
- No required manual codegen command.
- Stable serializable contract for downstream form/editor tasks.
- One extractor implementation reusable by multiple local consumers.

### Tradeoffs

- The prepared-config path is more explicit than "just import config in a client
  component."
- The extractor needs TypeScript compiler access and filesystem access on the
  Node side.
- A new shared node-only export surface is needed so Studio and future CLI
  flows can reuse the same extractor without depending on each other.

## Spec Delta Applied

The owning spec updates for this design are now in:

- `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`
- `docs/specs/SPEC-006-studio-runtime-and-ui.md`

Those edits:

- replace the old CLI-only extraction phrasing with a Node-side preparation
  pipeline
- define the normalized `MdxExtractedProp` contract
- define fail-closed unsupported-prop filtering rules
- clarify that browser runtime never performs TypeScript inspection

## Acceptance Mapping

- "Extracted schema hides functions/refs and complex unsupported props" maps to
  the fail-closed normalization rules plus fixture coverage.
- "Prop extraction output is stable across local MDX component-catalog
  consumers" maps to shared contract types plus a reusable node-only extractor.
- "Foundational behavior is documented and reusable" maps to spec deltas,
  shared runtime validation, and runtime/helper README updates.
