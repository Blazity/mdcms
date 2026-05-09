# @mdcms/shared

## 0.2.0

### Minor Changes

- a81169a: Add AI contract types and Zod schemas (AiProposal, AiProposalKind, AiProposalOperation, AiProposalValidation, AiTaskKind, AI_ERROR_CODES) consumed by the Studio AI provider and orchestration foundation. The orchestrator is built on the Vercel AI SDK, so future provider adapters (Anthropic, OpenAI) plug in through `@ai-sdk/*` packages without changing the public contract.
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

## 0.1.5

### Patch Changes

- 82b5fbd: Reduce the Studio runtime bundle size by keeping Node-side MDX prop extraction out of the browser runtime and emitting optimized production runtime assets.

## 0.1.4

### Patch Changes

- d10a004: Make default CLI logs user-friendly and move internal runtime diagnostics behind --verbose mode.

## 0.1.3

### Patch Changes

- 0143cf5: Group localized Studio content lists by translation group.
