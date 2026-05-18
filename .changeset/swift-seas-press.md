---
"@mdcms/studio": minor
"@mdcms/shared": patch
---

Studio: post-accept Undo on the chat-assistant Applied banner.

After Accept succeeds, the 6-second lime banner now exposes a working
Undo button (and a ⌘Z / Ctrl+Z shortcut scoped to the assistant
panel). Undo routes through the new
`POST /api/v1/ai/proposals/:proposalId/undo` endpoint, which fans out
per proposal kind: soft-delete for `create_document`,
restore-from-trash for `delete_document`, and a body/frontmatter
replay for `replace_selection` / `insert_block` /
`update_frontmatter`. A concurrent edit inside the window fails loud
with `AI_PROPOSAL_CONFLICT`; outside the window the banner morphs to
the quiet log line and undo is no longer offered.

`StudioAiRouteApi` gains `undoProposal`. `StudioAiApplyResult` now
surfaces `priorDraft` for body/frontmatter kinds so the client can
echo the captured snapshot back. The AI audit outcome enum gains
`undone` and `undo_failed`.
