# CMS-71 and CMS-72 Widget Hints and Custom Editors Design

> Local-only planning note. This file is not canonical product documentation and should remain uncommitted.

## Summary

Combine `CMS-71` and `CMS-72` into one spec-first slice that:

- formalizes the shared `propHints` contract and override precedence
- validates widget-hint config during local MDX catalog preparation
- extends the shared auto-form mapping helper so widget hints can override
  default controls deterministically
- introduces a Studio-side custom props editor host lifecycle that resolves
  editors lazily and exposes `loading`, `ready`, `empty`, `error`, and
  `forbidden` states without pulling in the full `CMS-74` node-view editor UX

## Problem

The current codebase already has:

- local MDX component catalog transport from host config into the embedded
  Studio runtime
- extracted prop metadata for default auto-form generation
- `propHints` passed through as opaque metadata
- `resolvePropsEditor(componentName)` wired as a synchronous presence check in
  the runtime diagnostics path

What is still missing:

- a typed and validated `propHints` contract
- a shared precedence rule between default controls, widget overrides, and
  `propsEditor`
- support for all seven widget overrides in the shared MDX mapping layer
- an actual custom-editor resolution lifecycle with defined UI states and
  read-only behavior

Without that, downstream work would keep reinterpreting raw `propHints` objects
inside Studio code, and `CMS-72` would still not have a contract for how custom
editor loading and failure behave.

## Approved Direction

### Spec ownership

`SPEC-007` remains the owning product contract for both tasks. The required
spec delta is:

- define a typed `propHints` union
- define validation rules per widget
- define deterministic precedence across `propsEditor`, widget hints, and
  default prop-type mapping
- define the custom props editor lifecycle states and read-only behavior

No backend contract changes are needed.

### Shared contract boundary

`@mdcms/shared` owns:

- typed `MdxPropHint` definitions
- runtime validation of `catalog.components[*].propHints`
- pure override mapping from `extractedProps + propHints` into explicit
  field-control metadata

This keeps widget semantics reusable across Studio and future local tooling.

### Studio runtime boundary

`@mdcms/studio` owns:

- local validation of host-authored `propHints` during Studio config
  preparation/loading
- lazy `resolvePropsEditor(componentName)` handling
- the custom-editor host lifecycle for the document route surface

The Studio work should stay intentionally thin. It needs to prove the runtime
can:

- resolve a custom editor asynchronously
- mount it with `value`, `onChange`, and `readOnly`
- show the required state surfaces when the editor is missing, fails, or is not
  editable

It should not implement the full `MdxComponent` node-view props panel from
`CMS-74`.

### Scope split against CMS-74

Keep out of scope:

- TipTap `MdxComponent` node implementation
- insertion UI and slash-command integration
- inline node-view props drawers
- MDX prop persistence into real component nodes in the editor document

For `CMS-72`, it is sufficient to implement the reusable host/runtime surface
and prove its lifecycle in the current document-route runtime shell.

## Proposed Contract Shape

### Widget hints

Use a discriminated union for `propHints` entries:

- `{ format: "url" }`
- `{ widget: "color-picker" }`
- `{ widget: "textarea" }`
- `{ widget: "slider", min, max, step? }`
- `{ widget: "image" }`
- `{ widget: "select", options }`
- `{ widget: "hidden" }`
- `{ widget: "json" }`

Validation rules:

- `format` cannot be combined with `widget`
- `color-picker`, `textarea`, and `image` only target extracted `string` props
- `slider` only targets extracted `number` props and requires valid numeric
  bounds
- `select` requires a non-empty options list whose values match the target
  scalar prop kind
- `hidden` can suppress any extracted prop
- `json` stays limited to JSON-serializable props and never enables function or
  ref-like shapes

### Shared auto-form output

Extend the shared auto-form field union to cover:

- `color-picker`
- `textarea`
- `slider`
- `image`
- `select`
- `json`

`hidden` should produce no field.

The mapper should accept both `extractedProps` and `propHints`, validate the
hint against the extracted prop, and then either:

- emit the override control
- fall back to the default control
- omit the field for `hidden`

### Custom editor lifecycle

Change the host capability from synchronous resolution to async resolution:

- `resolvePropsEditor(name): Promise<unknown | null>`

The runtime host model should expose these states:

- `loading`
- `ready`
- `empty`
- `error`
- `forbidden`

`ready` mounts the resolved editor with:

- `value`
- `onChange`
- `readOnly`

## Testing Strategy

Use TDD in this order:

1. spec delta
2. shared contract validation tests
3. shared override-mapping tests
4. Studio loader/runtime tests for async editor resolution
5. runtime rendering tests for lifecycle states and `onChange`

## Risks and Constraints

- The spec currently names the `image` widget but does not define a richer media
  payload shape. Keep `image` string-backed for this slice so the implementation
  stays compatible with current specs and does not pull Post-MVP media contracts
  into MVP editor work.
- The current document route is still a mock runtime shell. The custom-editor
  lifecycle should be implemented as a reusable runtime surface that can later
  plug into `CMS-74`, not as one-off page-only logic.
- `docs/plans/` is local-only in this repo, so planning artifacts must remain
  untracked.
