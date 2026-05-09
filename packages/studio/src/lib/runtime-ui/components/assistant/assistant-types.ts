/**
 * Studio Global Assistant — frontend type definitions.
 *
 * These mirror the proposal and conversation contracts in
 * `docs/specs/SPEC-014-ai-assisted-studio-editing.md`. The shapes here are
 * the surface the UI components depend on; the backing transport (the
 * `/api/v1/ai/chat/messages` endpoint and the proposal apply/reject
 * endpoints) is intentionally out of scope for this UI work and is
 * consumed through `StudioAiRouteApi`.
 *
 * The UI is currently driven by a mock provider so designers and editors
 * can interact with the surface end-to-end before the chat endpoint
 * lands. Swap the mock for a real fetcher by changing the assistant
 * provider input — the components themselves do not touch the network.
 */

export type AssistantContextDoc = {
  documentId?: string;
  path: string;
  type: string;
  locale: string;
};

export type AssistantSelectionContext = {
  documentId?: string;
  path: string;
  text: string;
  selectionId?: string;
};

export type AssistantValidationCheck = {
  label: string;
  ok: true;
};

export type AssistantValidationError = {
  code: string;
  message: string;
  path?: string;
};

export type AssistantValidation =
  | { status: "valid"; checks?: AssistantValidationCheck[] }
  | { status: "invalid"; errors: AssistantValidationError[] };

export type AssistantProposalKind =
  | "replace_selection"
  | "insert_block"
  | "update_frontmatter"
  | "create_document"
  | "delete_document"
  | "batch";

type ProposalCommonFields = {
  proposalId: string;
  summary: string;
  validation: AssistantValidation;
  expiresAt?: string;
  /**
   * True when the source text the proposal targets has changed since the
   * proposal was generated. Renders an inline warning and disables Accept
   * until the user retries.
   */
  contentInvalidated?: boolean;
  /** Optional pre-computed diff stats; the card falls back to line counts. */
  diffStats?: { added: number; removed: number };
};

export type AssistantProposalEdit = ProposalCommonFields & {
  kind: "replace_selection";
  docPath: string;
  type: string;
  locale: string;
  baseDraftRevision?: number;
  op: {
    op: "replace_selection";
    selectionId: string;
    originalText: string;
    replacementText: string;
  };
};

export type AssistantProposalInsert = ProposalCommonFields & {
  kind: "insert_block";
  docPath: string;
  type: string;
  locale: string;
  baseDraftRevision?: number;
  op: {
    op: "insert_block";
    afterSelectionId?: string;
    bodyMdx: string;
  };
};

export type AssistantProposalFrontmatter = ProposalCommonFields & {
  kind: "update_frontmatter";
  docPath: string;
  type: string;
  locale: string;
  baseDraftRevision?: number;
  op: {
    op: "update_frontmatter";
    patch: Record<string, unknown>;
  };
};

export type AssistantProposalCreate = ProposalCommonFields & {
  kind: "create_document";
  docPath: string;
  type: string;
  locale: string;
  op: {
    op: "create_document";
    path: string;
    format: "md" | "mdx";
    frontmatter: Record<string, unknown>;
    bodyPreview: string;
    bodyLines: number;
  };
};

export type AssistantProposalDelete = ProposalCommonFields & {
  kind: "delete_document";
  docPath: string;
  type: string;
  locale: string;
  baseDraftRevision?: number;
  op: {
    op: "delete_document";
    path: string;
    reason?: string;
  };
};

export type AssistantBatchChild = {
  /**
   * Stable id of the underlying child proposal. Mirrors
   * `AiProposal.proposalId` on the wire so the UI can route per-child
   * accept/reject regeneration calls and surface which child failed
   * when a batch is invalid.
   */
  proposalId?: string;
  kind: Exclude<AssistantProposalKind, "batch">;
  docPath: string;
  locale: string;
  summary: string;
  /** Short MDX/markdown preview rendered inside the expanded child diff. */
  preview?: string;
  /**
   * Optional per-child validation. When the batch as a whole is
   * `invalid` the parent surfaces the count, but the UI also needs the
   * per-child status to highlight the offending row(s).
   */
  validation?: AssistantValidation;
};

export type AssistantProposalBatch = ProposalCommonFields & {
  kind: "batch";
  children: AssistantBatchChild[];
};

export type AssistantProposal =
  | AssistantProposalEdit
  | AssistantProposalInsert
  | AssistantProposalFrontmatter
  | AssistantProposalCreate
  | AssistantProposalDelete
  | AssistantProposalBatch;

export type AssistantMessageRole = "user" | "assistant";

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  /** Plain-text composer content for user turns. Empty string for assistant turns that emit only proposals. */
  text?: string;
  proposals?: string[];
  at: string;
  /**
   * When the user turn is a regenerate-with-feedback follow-up, the
   * proposal id this message is responding to. Forwarded to the chat
   * endpoint so the server can correlate the regenerate request with
   * its predecessor for audit + cost accounting.
   */
  rejectedProposalId?: string;
};

export type AssistantThread = {
  id: string;
  title: string;
  updatedAt: string;
  pinned?: boolean;
  preview: string;
  contextDocs: AssistantContextDoc[];
  attachedSelection?: AssistantSelectionContext;
  messages: AssistantMessage[];
  /**
   * Counted across messages.proposals; cached to avoid recomputing in the
   * sidebar list when the thread is closed.
   */
  docCount: number;
};

export type AssistantStore = {
  now: string;
  activeThreadId: string;
  threads: AssistantThread[];
  proposals: Record<string, AssistantProposal>;
};
