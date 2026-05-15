---
"@mdcms/studio": minor
---

Add the chat surface client APIs that pair with `POST /api/v1/ai/chat/messages` and the new content-list endpoint used by the assistant's `@`-mention picker. New public surface on `@mdcms/studio`:

- `StudioAiRouteApi.chatMessage(input)` and the `StudioAiChatMessageRequest` / `StudioAiChatMessageResult` / `StudioAiChatMessage` / `StudioAiChatAttachedSelection` / `StudioAiChatAllowedAction` types.
- `StudioAiProposal` extended with the `delete_document` kind (new `StudioAiProposalOperation` variant with `path` + optional `reason`).
- `StudioDocumentRouteApi.listContent({ q?, type?, limit?, offset?, signal? })` returning the standard `ApiPaginatedEnvelope<ContentDocumentResponse>` shape.
