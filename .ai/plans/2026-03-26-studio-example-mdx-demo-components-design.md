# Studio Example MDX Demo Components Design

Date: 2026-03-26
Scope: register example local MDX components in `apps/studio-example` for Studio editor testing

## Notes

- This design doc is intentionally local-only under `docs/plans/` per repo workflow.
- The owning spec is [SPEC-007](../specs/SPEC-007-editor-mdx-and-collaboration.md).
- No spec delta is required. This work stays inside the existing local MDX component registration and prepared-catalog contract.

## Spec Delta Summary

1. No new spec text is needed.
2. The affected behavior is the demo host app's local MDX component registration and how the embedded Studio route receives that prepared config.
3. Acceptance depends on the existing `SPEC-007` sections covering:
   - `config.components` as the source of truth
   - host-local `load` and `loadPropsEditor` callbacks
   - node-side prop extraction through `prepareStudioConfig(...)`
   - local runtime preview and custom props editor resolution keyed by component name

## Current State

`apps/studio-example` currently exposes Studio through:

- [apps/studio-example/app/admin/[[...path]]/page.tsx](../../apps/studio-example/app/admin/[[...path]]/page.tsx)
- [apps/studio-example/app/admin/admin-studio-client.tsx](../../apps/studio-example/app/admin/admin-studio-client.tsx)

The app's [mdcms.config.ts](../../apps/studio-example/mdcms.config.ts) currently defines only content types and environment metadata. It does not register any local MDX components.

The admin route currently passes `createStudioEmbedConfig(config)` into `Studio`. That helper intentionally strips local MDX component registrations and loader callbacks, so simply adding components to `mdcms.config.ts` would not make them available to the current sample admin surface.

The `/demo/content` routes intentionally render raw API payloads and raw body text. They are not part of this change.

## Decision

Implement a realistic host-app MDX demo surface for editor testing by:

1. registering three example components in `apps/studio-example/mdcms.config.ts`
2. adding the component modules and one custom props editor inside the sample app
3. switching the admin route from embed-only config to `prepareStudioConfig(...)`

The demo renderer remains raw-content only. This task is about validating Studio/editor integration, not front-end page rendering.

## Approved Component Set

### Chart

- self-closing component
- exercises void insertion
- exercises auto-form editing
- props:
  - `data: number[]`
  - `type: "bar" | "line" | "pie"`
  - `title?: string`
  - `color?: string`

### Callout

- wrapper component
- exercises nested rich-text editing inside the editor canvas
- props:
  - `tone: "info" | "warning" | "success"`
  - `title?: string`
  - `children`

### PricingTable

- self-closing component
- exercises custom props editor loading
- props:
  - `title?: string`
  - `tiers: Array<{ name: string; price: string; description?: string }>`
- edited through `PricingTable.editor.tsx` instead of auto-generated controls

## Architecture

### 1. Config-owned registration

The sample host app continues to use `mdcms.config.ts` as the source of truth. The new `components` array will register:

- `name`
- `importPath`
- `description`
- `load`
- `propHints` where useful
- `propsEditor` and `loadPropsEditor` for `PricingTable`

Because `apps/studio-example` does not currently define an `@/` path alias, the sample registrations should use plain relative import paths rather than introducing unrelated alias infrastructure.

### 2. Prepared config on the admin route

The admin route will prepare the authored config on the server with `prepareStudioConfig(...)` before passing it into the client `Studio` mount.

This is the key integration change. It ensures the embedded Studio runtime receives:

- serializable extracted prop metadata
- catalog metadata for insertion and props-panel display
- executable local preview loaders and custom-editor loaders through the config-owned runtime path

The route must fail closed if preparation fails, rather than silently launching Studio without the registered components.

### 3. No document-renderer changes

The raw `/demo/content` pages stay untouched. They intentionally display API payloads and the stored document body text. They do not need to render MDX components for this testing slice.

## UI and Data Flow

1. The host app registers `Chart`, `Callout`, and `PricingTable` in `mdcms.config.ts`.
2. The admin route calls `prepareStudioConfig(config, { cwd, tsconfigPath? })`.
3. `prepareStudioConfig(...)` resolves component source files, extracts supported props, and preserves valid `propHints`.
4. The prepared config is passed to `Studio`.
5. Studio derives the local MDX catalog and host bridge from the prepared config.
6. Editors can insert the example components through the CMS-74 toolbar and slash-command entrypoints.
7. The props panel and preview path behave according to each component kind:
   - `Chart` -> auto-form + preview
   - `Callout` -> wrapper content + preview, no props-panel editing for `children`
   - `PricingTable` -> custom props editor + preview

## Error Handling

- Invalid component import paths fail the admin route during preparation.
- Invalid prop hints fail preparation instead of being ignored in the browser.
- Missing custom props editor resolution continues to fall back to auto-form behavior where the Studio runtime already supports it.
- Components with no editable extracted props continue to use the existing empty/custom panel states. No demo-only fallback logic is added.

## Testing Strategy

Add the narrowest tests that prove the sample host registration is wired correctly:

- config-level coverage for the registered component names and loaders
- admin-route coverage for using prepared config rather than stripped embed-only config
- keep broader editor behavior coverage in `@mdcms/studio`, which already owns those contracts

Verification should include:

- focused tests added for the sample app integration
- `bun nx build studio-example`
- `bun nx typecheck studio-example`
- workspace-required `bun run format:check`
- workspace-required `bun run check`

## Documentation

Update [apps/studio-example/README.md](../../apps/studio-example/README.md) to explain that:

- the sample app now registers local MDX components for Studio testing
- the admin route uses prepared config so local catalog metadata reaches Studio
- the `/demo/content` routes remain raw-content inspection surfaces

## Scope Boundaries

In scope:

- demo-host MDX component files
- config registration for three example components
- one example custom props editor
- admin route wiring to `prepareStudioConfig(...)`
- sample-app README updates

Out of scope:

- rendering MDX on `/demo/content`
- backend API changes
- new path-alias infrastructure
- changes to the core Studio MDX component contract
