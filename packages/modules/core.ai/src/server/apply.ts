import {
  RuntimeError,
  type AiProposal,
  type AiProposalOperation,
  type ContentDocumentResponse,
} from "@mdcms/shared";

export type AiApplyContentScope = {
  project: string;
  environment: string;
};

export type AiApplyContentDocument = ContentDocumentResponse;

export type AiApplyWritePayload = {
  path?: string;
  type?: string;
  locale?: string;
  format?: "md" | "mdx";
  frontmatter?: Record<string, unknown>;
  body?: string;
  draftRevision?: number;
  updatedBy?: string;
  createdBy?: string;
};

export type AiApplyContentStore = {
  getById(
    scope: AiApplyContentScope,
    documentId: string,
    options?: { draft?: boolean },
  ): Promise<AiApplyContentDocument | undefined>;
  update(
    scope: AiApplyContentScope,
    documentId: string,
    payload: AiApplyWritePayload,
    options: {
      expectedSchemaHash: string;
      expectedDraftRevision?: number;
    },
  ): Promise<AiApplyContentDocument>;
  create(
    scope: AiApplyContentScope,
    payload: AiApplyWritePayload & {
      type: string;
      path: string;
      locale: string;
    },
    options: { expectedSchemaHash: string },
  ): Promise<AiApplyContentDocument>;
};

export type AiApplyInput = {
  proposal: AiProposal;
  expectedSchemaHash: string;
  actorId: string;
  store: AiApplyContentStore;
};

function aiProposalConflict(
  message: string,
  details: Record<string, unknown>,
): RuntimeError {
  return new RuntimeError({
    code: "AI_PROPOSAL_CONFLICT",
    message,
    statusCode: 409,
    details,
  });
}

function aiOutputInvalid(
  message: string,
  details: Record<string, unknown>,
): RuntimeError {
  return new RuntimeError({
    code: "AI_OUTPUT_INVALID",
    message,
    statusCode: 422,
    details,
  });
}

function ensureSingleOperation(proposal: AiProposal): AiProposalOperation {
  const [operation] = proposal.operations;

  if (!operation) {
    throw aiOutputInvalid("Proposal has no operations to apply.", {
      proposalId: proposal.proposalId,
    });
  }

  return operation;
}

function applyReplaceSelection(
  body: string,
  operation: Extract<AiProposalOperation, { op: "replace_selection" }>,
): string {
  const original = operation.originalText;
  const index = body.indexOf(original);

  if (index < 0) {
    throw aiProposalConflict(
      "Original selection text was not found in the current draft body.",
      {
        selectionId: operation.selectionId,
      },
    );
  }

  const last = body.lastIndexOf(original);

  if (index !== last) {
    throw aiProposalConflict(
      "Original selection text appears more than once in the current draft body; refusing to apply ambiguously.",
      {
        selectionId: operation.selectionId,
      },
    );
  }

  return (
    body.slice(0, index) +
    operation.replacementText +
    body.slice(index + original.length)
  );
}

function applyInsertBlock(
  body: string,
  operation: Extract<AiProposalOperation, { op: "insert_block" }>,
): string {
  const insertion = operation.bodyMdx;

  if (body.length === 0) {
    return insertion;
  }

  const separator = body.endsWith("\n") ? "\n" : "\n\n";
  return `${body}${separator}${insertion}`;
}

function mergeFrontmatter(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...current, ...patch };
}

/**
 * Apply an AI proposal as a draft mutation through the content store.
 *
 * The function performs operation-specific composition (string-level
 * replacement for `replace_selection`, body append for `insert_block`,
 * shallow merge for `update_frontmatter`, full create for
 * `create_document`) and routes the result through the same content
 * store mutation surface as Studio's normal draft writes.
 *
 * Optimistic concurrency is preserved: existing-document updates pass
 * through `expectedDraftRevision` taken from the proposal, so the
 * underlying store enforces the same conflict semantics as a regular
 * `PUT /api/v1/content/:id`.
 */
export async function applyAiProposal(
  input: AiApplyInput,
): Promise<AiApplyContentDocument> {
  const { proposal, expectedSchemaHash, actorId, store } = input;
  const scope: AiApplyContentScope = {
    project: proposal.project,
    environment: proposal.environment,
  };
  const operation = ensureSingleOperation(proposal);

  if (proposal.kind === "create_document") {
    if (operation.op !== "create_document") {
      throw aiOutputInvalid(
        "create_document proposal must contain a create_document operation.",
        { proposalId: proposal.proposalId },
      );
    }

    return await store.create(
      scope,
      {
        type: proposal.type,
        path: operation.path,
        locale: proposal.locale,
        format: operation.format,
        frontmatter: operation.frontmatter,
        body: operation.body,
        createdBy: actorId,
        updatedBy: actorId,
      },
      { expectedSchemaHash },
    );
  }

  if (!proposal.documentId) {
    throw aiOutputInvalid(
      "Proposal targets an existing document but is missing documentId.",
      { proposalId: proposal.proposalId },
    );
  }

  const existing = await store.getById(scope, proposal.documentId, {
    draft: true,
  });

  if (!existing || existing.isDeleted) {
    throw new RuntimeError({
      code: "NOT_FOUND",
      message: "Document not found.",
      statusCode: 404,
      details: { documentId: proposal.documentId },
    });
  }

  if (
    typeof proposal.baseDraftRevision === "number" &&
    existing.draftRevision !== proposal.baseDraftRevision
  ) {
    throw aiProposalConflict(
      "Proposal base draft revision no longer matches the live draft.",
      {
        proposalId: proposal.proposalId,
        proposalBaseDraftRevision: proposal.baseDraftRevision,
        currentDraftRevision: existing.draftRevision,
      },
    );
  }

  let nextBody = existing.body;
  let nextFrontmatter = existing.frontmatter;

  if (operation.op === "replace_selection") {
    nextBody = applyReplaceSelection(existing.body, operation);
  } else if (operation.op === "insert_block") {
    nextBody = applyInsertBlock(existing.body, operation);
  } else if (operation.op === "update_frontmatter") {
    nextFrontmatter = mergeFrontmatter(existing.frontmatter, operation.patch);
  } else {
    throw aiOutputInvalid(
      `Unsupported operation kind "${(operation as { op: string }).op}" for existing document.`,
      { proposalId: proposal.proposalId },
    );
  }

  return await store.update(
    scope,
    proposal.documentId,
    {
      body: nextBody,
      frontmatter: nextFrontmatter,
      updatedBy: actorId,
    },
    {
      expectedSchemaHash,
      expectedDraftRevision: proposal.baseDraftRevision,
    },
  );
}
