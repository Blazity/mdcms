# CMS-70 Prop Type to Form Control Mapping Design

> Local-only planning note. This file is not canonical product documentation and should remain uncommitted.

## Summary

`CMS-70` should turn the extracted local MDX prop metadata from `CMS-69` into a
stable auto-form contract that downstream Studio/editor tasks can reuse without
re-deriving UI decisions ad hoc.

The main contract wrinkle is the URL case. The approved direction is to model
URL as string formatting metadata, not as a new widget override. That keeps
type extraction, default form mapping, and later widget overrides clearly
separated.

## Problem

The codebase already has:

- local MDX component catalog transport from host app to embedded Studio
- deterministic TypeScript prop extraction in `@mdcms/shared`
- fail-closed omission of unsupported props
- a basic Studio distinction between "auto form available" and "custom props
  editor available"

What is still missing for `CMS-70`:

- a shared, explicit prop-to-control mapping contract
- a deterministic URL-input signal for string props
- a reusable mapping helper instead of Studio-only branching
- proof that Studio consumes the shared mapping contract rather than only
  checking whether `extractedProps` exists

Without that, `CMS-71` and `CMS-72` would have to infer control semantics from
raw extracted prop metadata in multiple places.

## Approved Direction

### Contract boundary

`@mdcms/shared` owns both:

- the extracted MDX prop contract
- the pure auto-form mapping helper derived from that contract

`@mdcms/studio` consumes the mapping output but does not own the mapping rules.

### URL handling

URL is modeled as an optional format on string props:

- extracted prop shape: `{ type: "string", required: boolean, format?: "url" }`
- declaration source: `propHints.<propName>.format = "url"`
- extraction rule: preserve the format only when the normalized prop type is
  `string`

This is intentionally not a widget. Widget overrides remain the later `CMS-71`
concern.

### Shared auto-form output

Introduce a pure shared mapper that turns `MdxExtractedProps` into explicit
auto-form field metadata. Planned default control kinds:

- `string` -> `text`
- `string` with `format: "url"` -> `url`
- `number` -> `number`
- `boolean` -> `boolean`
- `enum` -> `select`
- `array` with `items: "string"` -> `string-list`
- `array` with `items: "number"` -> `number-list`
- `date` -> `date`
- `rich-text` -> `rich-text`

Function and ref props remain hidden by omission upstream in extraction, which
already matches the spec.

### Studio integration scope

`CMS-70` should stop short of building the full editable props UI. The Studio
side only needs a thin proof consumer that uses the shared mapper in the
existing hidden diagnostics/runtime test path.

That keeps this task foundational and avoids bleeding into `CMS-72`.

## Consequences

### Benefits

- One mapping source of truth for Studio and future local tooling.
- URL inputs become deterministic without expanding the widget system early.
- Downstream tasks can build form rendering on explicit field metadata instead
  of reinterpreting extracted props.

### Tradeoffs

- The extracted prop contract grows slightly to include string formatting.
- Shared code now owns one more MDX helper surface that needs tests and README
  coverage.
- The product spec must explicitly define the URL format hint before
  implementation.

## Spec Delta Required

The owning spec update belongs in:

- `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

Required contract delta:

- define URL intent as `propHints.<propName>.format = "url"`
- define extracted string props as optionally carrying `format: "url"`
- define Studio mapping of `{ type: "string", format: "url" }` to a URL input
  with validation
- keep widget overrides limited to the existing widget list

## Acceptance Mapping

- "Auto-controls implement all 11 prop-type-to-form-control mappings" maps to
  the shared mapping helper plus tests covering each supported control outcome.
- "Foundational behavior is documented and reusable" maps to the spec delta,
  shared contract typing, shared mapping helper exports, and README notes.
- "Any newly introduced public contract ... is documented at the point of use"
  maps to contract comments/README updates in the shared package.
