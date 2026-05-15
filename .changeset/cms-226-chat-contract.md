---
"@mdcms/shared": minor
---

Add the `delete_document` proposal kind, the `AI_UNSUPPORTED_ACTION` error code, and the request/response Zod schemas for the new `POST /api/v1/ai/chat/messages` endpoint (`aiChatMessageRequestSchema`, `aiChatMessageResponseSchema`, `aiChatAllowedActionSchema`, `aiChatAttachedSelectionSchema`, `aiChatMessageSchema`). These ship as part of CMS-226 to support the global AI assistant chat surface; the wire contract intentionally omits a `batch` proposal kind — multi-doc turns are grouped implicitly per assistant turn on the client.
