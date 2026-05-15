---
"@mdcms/studio": minor
---

Add streaming + markdown rendering to the chat surface client APIs.

- `StudioAiRouteApi.chatMessageStream(input)` opens an SSE connection against `POST /api/v1/ai/chat/messages/stream` and returns an `AsyncIterable<StudioAiChatStreamEvent>` that yields `text-delta`, `done`, and `error` events as the model produces them.
- New `StudioAiChatStreamEvent` discriminated-union export covers the wire-shape of each SSE event the client can observe.
- New runtime dependency on `streamdown` (v2.5.0). The chat panel now uses it under the hood to render assistant prose as markdown — headings, fenced code (shiki highlighting), GFM tables, task lists, links, etc. Streaming-aware: `parseIncompleteMarkdown` keeps mid-stream chunks from leaking unclosed `**`/```` fences while a token batch is in flight.
