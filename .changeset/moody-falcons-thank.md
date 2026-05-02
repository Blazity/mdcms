---
"@mdcms/shared": minor
"@mdcms/studio": minor
---

Add Studio AI inline selection transforms and proposal lifecycle.

`@mdcms/shared` exposes the new `ai.use` capability flag in
`CurrentPrincipalCapabilities`, signalling whether the current
principal can request AI proposals against the routed
project/environment.

`@mdcms/studio` exports `createStudioAiRouteApi`, `InlineAiPanel`, and
`useInlineAiTransform`, providing the client surface for the new
`/api/v1/ai/inline-transform`, `/api/v1/ai/proposals/:id/apply`, and
`/api/v1/ai/proposals/:id/reject` endpoints. The panel renders an
inline proposal preview with Accept/Reject/Try again controls, and
mediates accept through the proposal apply endpoint so the editor
draft is updated through normal content draft mutation semantics.
