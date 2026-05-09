# @mdcms/studio

## 0.2.0

### Minor Changes

- 98779f0: Add Studio AI inline selection transforms and proposal lifecycle.

  `@mdcms/shared` exposes the new `ai.use` capability flag in
  `CurrentPrincipalCapabilities`, signalling whether the current
  principal can request AI proposals against the routed
  project/environment.

  `@mdcms/studio` exports `createStudioAiRouteApi`, `InlineAiPanel`,
  `InlineAiBubble`, and `useInlineAiTransform`, providing the client
  surface for the new `/api/v1/ai/inline-transform`,
  `/api/v1/ai/proposals/:id/apply`, and `/api/v1/ai/proposals/:id/reject`
  endpoints. The bubble renders a floating "Ask AI" trigger anchored at
  the editor selection; opening it shows a popover with the action list
  and Accept / Reject / Try again controls, and accept routes the
  proposal through the apply endpoint so the editor draft is updated
  through normal content draft mutation semantics.

  Inline transforms are scoped to selection-anchored copy edits per
  SPEC-014: rewrite, shorten, expand, change_tone, fix_grammar,
  improve_clarity. Frontmatter (SEO) suggestions and MDX component
  insertion live on other surfaces (the document properties panel and
  the slash menu / chat respectively).

### Patch Changes

- Updated dependencies [a81169a]
- Updated dependencies [98779f0]
  - @mdcms/shared@0.2.0

## 0.1.6

### Patch Changes

- 82b5fbd: Reduce the Studio runtime bundle size by keeping Node-side MDX prop extraction out of the browser runtime and emitting optimized production runtime assets.
- Updated dependencies [82b5fbd]
  - @mdcms/shared@0.1.5

## 0.1.5

### Patch Changes

- e77088f: Add a System/Light/Dark theme picker in the admin header, default the Studio theme to System so it follows the OS preference, and theme the bootstrap loading shell (`Loading Studio`) so it resolves from `localStorage` + `prefers-color-scheme` instead of always rendering light. `StudioShellFrame` gains an optional `shellTheme` prop (defaulted to `"light"`, non-breaking).

## 0.1.4

### Patch Changes

- c800ac8: Visual refresh for Studio runtime bundle loading screen
- 38932fc: Clarify wrapper MDX component editing in Studio and align bundled examples with the current Callout prop contract.
- a1bae03: Preserve the missing-token Studio error state and add follow-up token auth coverage.
- Updated dependencies [d10a004]
  - @mdcms/shared@0.1.4

## 0.1.3

### Patch Changes

- 0143cf5: Group localized Studio content lists by translation group.
- Updated dependencies [0143cf5]
  - @mdcms/shared@0.1.3
