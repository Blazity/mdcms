---
status: live
canonical: true
created: 2026-05-01
last_updated: 2026-05-01
---

# SPEC-014 AI-Assisted Studio Editing

This spec owns in-product AI assistance for Studio document authoring and
editing. It does not define external-agent MCP integration, AI-assisted
migrations, or schema authoring automation.

## Product Scope

AI assistance in Studio is a bounded editing aid. It helps users create and
revise draft documents while preserving MDCMS's existing content invariants:
schema validation, MDX component validation, explicit draft writes, optimistic
concurrency, authorization, and normal publish separation.

The first product scope includes:

- Inline AI transforms for selected editor content.
- Document-scoped AI chat that can propose draft document edits or new draft
  documents.
- Copy-improvement workflows such as rewrite, shorten, expand, change tone, fix
  grammar, and improve clarity.
- SEO-improvement workflows that produce actionable frontmatter edits, surfaced
  from the document properties panel rather than the inline editor.
- MDX-aware generation that can use only registered components and valid props,
  invoked from the editor slash menu, the toolbar Insert Component affordance,
  or document chat.

The first product scope excludes:

- Autocomplete or ghost-text generation while typing.
- External-agent MCP integration.
- AI-assisted migrations and import transforms.
- Schema, environment, project, role, or provider configuration changes through
  chat.
- Publish, unpublish, restore, delete, or environment promotion actions through
  AI.

## User Experience

### Inline Selection Transforms

Users can select text in the editor and invoke an AI action from an inline
editor affordance. Supported actions are scoped to **selection-anchored copy
edits** that rewrite the selected text in place: rewrite, shorten, expand,
change tone, fix grammar, and improve clarity.

Other AI workflows do not belong in the inline panel:

- **Frontmatter (SEO) edits** are surfaced from the document properties panel,
  not from an editor selection. The underlying `seo_improvement` task is reused
  there.
- **MDX component insertion** is a block-level operation reachable from the
  editor's slash menu, the toolbar's Insert Component affordance, and from
  document chat. It is not a transform of the current selection.

The result renders inline at the selection location as a proposed replacement,
not as a committed draft write. The proposed replacement has visible controls:

- `Accept` applies the proposal to the local editor state and then persists the
  accepted proposal through the proposal apply endpoint; Studio updates local
  editor state from the successful draft response.
- `Reject` discards the proposal and keeps the original selection.
- `Try again` requests a replacement using the same action and current context.

Inline proposals must stay anchored near the source selection. Studio must not
move selection-based proposals into a separate suggestion queue.

### Document Chat

Studio provides a document-scoped chat surface for authoring assistance. Chat is
allowed to answer questions about the current document, propose edits to the
current draft, and propose new draft documents of existing content types.

Chat is not a general administration console. It cannot change schemas,
environments, projects, roles, API keys, modules, provider settings, or publish
state.

When chat proposes a content change, Studio renders the change as a draft
proposal with explicit accept/reject controls. For current-document edits,
proposed changes render inline in the editor where practical. For new-document
creation, Studio renders a proposed draft document summary that includes type,
path, locale, frontmatter, body preview, and validation status before creation.

### Proposal Handling

AI output is always mediated through proposals:

1. User invokes an inline action or sends a document chat message.
2. Server creates one or more proposals.
3. Studio renders the proposal with validation status and accept/reject
   controls.
4. User explicitly accepts a proposal.
5. Server applies the accepted proposal as a draft write if the target still
   matches the proposal's base revision and validation passes.
6. Studio reconciles local editor state from the accepted draft response.

Rejecting a proposal has no content side effects. Proposals expire after a short
server-defined lifetime and may also become stale when a draft revision changes.

## Context Model

The server, not the browser, owns AI context assembly. Browser requests provide
the user intent, selected text or target document, and optional action
parameters. The server resolves target-scoped context using the caller's
authorization.

Allowed context:

- Current draft document body and frontmatter when the caller can read drafts.
- Current content type schema and field metadata.
- Current locale and path.
- Selected text or block range.
- Nearby editor context needed to produce a coherent replacement.
- Registered MDX component catalog metadata supplied through the Studio host
  bridge and normalized into serializable component names, prop schemas, prop
  hints, and child-content rules.
- Action-specific instructions for copy, SEO, MDX component insertion, or
  document creation workflows.

Disallowed context:

- Documents outside the caller's project/environment routing context.
- Drafts the caller cannot read.
- Provider secrets, API keys, session cookies, or credential-store values.
- Unbounded repository source code.
- Schema or environment mutation authority.

## Structured Proposals

AI providers must not return unstructured final content directly into the draft.
The orchestration layer converts model output into structured proposal objects.

```typescript
export type AiProposalKind =
  | "replace_selection"
  | "insert_block"
  | "update_frontmatter"
  | "create_document";

export type AiProposal = {
  proposalId: string;
  kind: AiProposalKind;
  project: string;
  environment: string;
  documentId?: string;
  baseDraftRevision?: number;
  type: string;
  locale: string;
  summary: string;
  operations: AiProposalOperation[];
  validation: AiProposalValidation;
  expiresAt: string;
};

export type AiProposalOperation =
  | {
      op: "replace_selection";
      selectionId: string;
      originalText: string;
      replacementText: string;
    }
  | {
      op: "insert_block";
      afterSelectionId?: string;
      bodyMdx: string;
    }
  | {
      op: "update_frontmatter";
      patch: Record<string, unknown>;
    }
  | {
      op: "create_document";
      path: string;
      format: "md" | "mdx";
      frontmatter: Record<string, unknown>;
      body: string;
    };

export type AiProposalValidation =
  | { status: "valid" }
  | {
      status: "invalid";
      errors: {
        code: string;
        message: string;
        path?: string;
      }[];
    };
```

The implementation may store proposals server-side or encode them in signed
proposal tokens, but clients must treat proposal identifiers as opaque.

## MDX Component Grounding

AI-generated MDX must be grounded in the active MDX component catalog.

Rules:

- Generated component names must exist in the active catalog.
- Generated props must validate against the component's extracted prop metadata
  and any author-provided prop hints.
- Required props must be present.
- Unknown props are rejected unless the component metadata explicitly permits
  passthrough props.
- Wrapper components must follow their declared child-content rules.
- Studio must show validation failures before the user can accept a proposal.

Invalid MDX proposals are never silently repaired on apply. The user may request
another proposal or edit manually.

## SEO Assistance

SEO assistance is a document-editing workflow, not a separate search or
analytics product in this spec.

The first SEO workflow may inspect and propose edits for:

- title and description-style fields when present in the content type schema
- headings
- intro clarity
- excerpt quality
- keyword/topic coverage provided by the user
- internal link opportunities when linkable context is explicitly available

SEO suggestions that change content follow the same proposal lifecycle as other
AI edits. SEO scoring may be shown as supporting context, but score changes
must not be the only success signal; proposed edits must remain inspectable.

## Authorization and Safety

AI endpoints require explicit project/environment routing and obey the shared
HTTP boundary in `SPEC-005`.

Minimum scopes:

- Generating proposals for an existing draft requires `ai:use` and
  `content:read:draft`.
- Generating a new-document proposal requires `ai:use` and schema visibility for
  the requested content type.
- Applying an edit proposal requires `content:write`.
- Applying a create-document proposal requires `content:write`.

AI endpoints must not grant publish authority. Accepted AI edits update drafts
only. Publishing remains owned by the content publish endpoints.

All AI write application paths must:

- verify the caller is still authorized at apply time
- verify the proposal has not expired
- verify the proposal target still matches the expected draft revision
- validate content against the current synced schema
- validate generated MDX before writing
- write through the same draft mutation semantics as normal content updates
- produce an audit event that identifies the human actor, target document,
  proposal kind, accepted/rejected outcome, model/provider metadata, and
  validation result

## Endpoint Contracts

This table is normative and follows the shared contract template in `SPEC-005`.

| Method | Endpoint                                 | Auth mode          | Required scope                                                 | Target routing                  | Request schema                                                                                                                                   | Success response schema                                               | Errors                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------- | ------------------ | -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/ai/inline-transform`            | session_or_api_key | `ai:use`, `content:read:draft`                                 | required: `project_environment` | JSON: `{ documentId, draftRevision, selectionId, selectedText, action, instruction?, tone? }`                                                    | `200` `{ data: { proposals: AiProposal[] } }`                         | `MISSING_TARGET_ROUTING` (`400`), `TARGET_ROUTING_MISMATCH` (`400`), `INVALID_INPUT` (`400`), `AI_DISABLED` (`403`), `UNAUTHORIZED` (`401`), `FORBIDDEN` (`403`), `NOT_FOUND` (`404`), `AI_CONTEXT_TOO_LARGE` (`413`), `AI_RATE_LIMITED` (`429`), `AI_PROVIDER_UNAVAILABLE` (`503`)                                        |
| POST   | `/api/v1/ai/chat/messages`               | session_or_api_key | `ai:use`, `content:read:draft` for current-document operations | required: `project_environment` | JSON: `{ documentId?, draftRevision?, message, conversationId?, allowedActions?: ("answer" \| "edit_current_document" \| "create_document")[] }` | `200` `{ data: { conversationId, message, proposals? } }`             | `MISSING_TARGET_ROUTING` (`400`), `TARGET_ROUTING_MISMATCH` (`400`), `INVALID_INPUT` (`400`), `AI_DISABLED` (`403`), `UNAUTHORIZED` (`401`), `FORBIDDEN` (`403`), `NOT_FOUND` (`404`), `AI_UNSUPPORTED_ACTION` (`400`), `AI_CONTEXT_TOO_LARGE` (`413`), `AI_RATE_LIMITED` (`429`), `AI_PROVIDER_UNAVAILABLE` (`503`)       |
| POST   | `/api/v1/ai/proposals/:proposalId/apply` | session_or_api_key | `content:write`                                                | required: `project_environment` | path `proposalId`, JSON: `{ draftRevision?, schemaHash, clientSelectionState? }`                                                                 | `200` `{ data: { proposal: AiProposal, document: ContentDocument } }` | `MISSING_TARGET_ROUTING` (`400`), `TARGET_ROUTING_MISMATCH` (`400`), `INVALID_INPUT` (`400`), `UNAUTHORIZED` (`401`), `FORBIDDEN` (`403`), `NOT_FOUND` (`404`), `AI_PROPOSAL_EXPIRED` (`410`), `AI_PROPOSAL_CONFLICT` (`409`), `AI_OUTPUT_INVALID` (`422`), `SCHEMA_HASH_REQUIRED` (`400`), `SCHEMA_HASH_MISMATCH` (`409`) |

`action` for inline transforms is an enum of selection-anchored copy edits:

- `rewrite`
- `shorten`
- `expand`
- `change_tone`
- `fix_grammar`
- `improve_clarity`

SEO frontmatter assistance and MDX component insertion are not part of this
endpoint. SEO suggestions are produced server-side by the `seo_improvement`
task and surfaced through the document properties panel. MDX component
insertion is handled by the editor slash menu and the document chat surface.

## Provider and Orchestration Requirements

AI provider credentials are server-side only. Studio never receives provider API
keys or raw provider request payloads.

The orchestration layer must support task-specific prompt templates or
equivalent workflow definitions for at least:

- copy improvement
- SEO improvement
- MDX component insertion
- current-document editing through chat
- new-document draft creation through chat

The implementation may use specialized subagents, but subagents are not a
product contract. The product contract is the validated proposal output and the
human accept/reject workflow.

## Observability and Evaluation

AI operations must be auditable without storing unnecessary secrets.

Audit records include:

- actor id
- project and environment
- document id when applicable
- proposal id
- proposal kind
- action name or chat allowed action
- accepted, rejected, expired, or failed outcome
- provider and model identifier
- prompt template or workflow identifier
- validation status
- token/cost metadata when available

Regression coverage must include:

- hallucinated MDX component names are rejected
- invalid component props are rejected
- stale draft revisions cannot be applied
- prompt-injection attempts cannot trigger publish, schema, environment, or
  project changes
- generated frontmatter is schema-validated before writing
- rejected proposals do not mutate content
- accepted proposals write drafts only

## Deferred Follow-Up Areas

The following areas are intentionally deferred but should remain tracked:

- External-agent MCP integration for Codex, Claude Code, Cursor, ChatGPT, and
  other agent clients.
- AI-assisted migration workflows for imports, schema mapping, transforms, and
  dry-run reports.
- Autocomplete or ghost-text authoring while the user types.
- AI-assisted schema design and environment/project administration.
