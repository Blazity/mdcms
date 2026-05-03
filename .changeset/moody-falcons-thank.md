---
"@mdcms/shared": minor
"@mdcms/studio": minor
---

Add Studio AI inline selection transforms and proposal lifecycle.

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
