import {
  assertRequestTargetRouting,
  RuntimeError,
  type AiProposal,
  type AiProposalKind,
  type AiTaskKind,
  type ContentDocumentResponse,
} from "@mdcms/shared";

import { applyAiProposal, type AiApplyContentStore } from "./apply.js";
import { buildAuditRecord, type AiAuditRecord } from "./audit.js";
import {
  getOrchestratorFailureAudit,
  getOrchestratorFailureRuntimeError,
  type AiOrchestrator,
} from "./orchestrator.js";
import type { AiProposalEnvelope } from "./proposal-builder.js";
import type { AiProposalRecord, AiProposalStore } from "./proposal-store.js";

const INLINE_TRANSFORM_ACTIONS = [
  "rewrite",
  "shorten",
  "expand",
  "change_tone",
  "fix_grammar",
  "improve_clarity",
] as const;

export type InlineTransformAction = (typeof INLINE_TRANSFORM_ACTIONS)[number];

// All inline transforms map to the copy_improvement task; the prompt is
// shaped by the action-specific instruction hint below. SEO frontmatter
// suggestions and MDX component insertion live on other surfaces (the
// document properties panel, slash menu, chat) and are intentionally not
// exposed through `/api/v1/ai/inline-transform`.
const ACTION_TO_TASK: Record<InlineTransformAction, AiTaskKind> = {
  rewrite: "copy_improvement",
  shorten: "copy_improvement",
  expand: "copy_improvement",
  change_tone: "copy_improvement",
  fix_grammar: "copy_improvement",
  improve_clarity: "copy_improvement",
};

const ACTION_INSTRUCTION_HINT: Record<InlineTransformAction, string> = {
  rewrite: "Rewrite the selected content while preserving the meaning.",
  shorten: "Shorten the selected content while preserving the key points.",
  expand: "Expand the selected content with additional supporting detail.",
  change_tone:
    "Rewrite the selected content using the requested tone. Keep meaning intact.",
  fix_grammar:
    "Fix grammar and spelling errors in the selected content without changing meaning.",
  improve_clarity:
    "Rewrite the selected content for clarity, brevity, and active voice.",
};

export type InlineTransformRequestBody = {
  documentId?: string;
  draftRevision?: number;
  selectionId?: string;
  selectedText?: string;
  action?: string;
  instruction?: string;
  tone?: string;
};

export type ProposalApplyRequestBody = {
  draftRevision?: number;
  schemaHash?: string;
};

export type AiAuditEmitter = (record: AiAuditRecord) => void;

export type AiContentStore = AiApplyContentStore & {
  // No additional methods required beyond AiApplyContentStore for routes.
};

export type AiContextResolver = {
  /**
   * Load the draft document used to assemble AI context. Implementations
   * MUST enforce the caller's authorization before returning data.
   */
  loadDraftContext(input: {
    request: Request;
    project: string;
    environment: string;
    documentId: string;
  }): Promise<{
    document: ContentDocumentResponse;
  }>;
};

export type AiSchemaHashLookup = (input: {
  project: string;
  environment: string;
}) => Promise<string | undefined>;

export type AiAuthorizer = (
  request: Request,
  requirement: {
    requiredScope: "ai:use" | "content:write" | "content:read:draft";
    project: string;
    environment: string;
    documentPath?: string;
  },
) => Promise<{ actorId: string }>;

export type AiCsrfProtector = (request: Request) => Promise<void>;

export type AiRouteApp = {
  post?: (path: string, handler: (ctx: any) => unknown) => AiRouteApp;
};

export type MountAiRoutesOptions = {
  orchestrator: AiOrchestrator;
  proposalStore: AiProposalStore;
  contentStore: AiContentStore;
  contextResolver: AiContextResolver;
  schemaHashLookup: AiSchemaHashLookup;
  authorize: AiAuthorizer;
  requireCsrf: AiCsrfProtector;
  emitAudit?: AiAuditEmitter;
};

const KIND_BY_TASK: Record<AiTaskKind, AiProposalKind> = {
  copy_improvement: "replace_selection",
  seo_improvement: "update_frontmatter",
  mdx_component_insertion: "insert_block",
  current_document_edit: "replace_selection",
  new_document_draft: "create_document",
};

function ensureInlineTransformAction(value: unknown): InlineTransformAction {
  if (typeof value !== "string") {
    throw invalidInput('Field "action" must be a string.', { field: "action" });
  }

  if (!INLINE_TRANSFORM_ACTIONS.includes(value as InlineTransformAction)) {
    throw invalidInput(`Unsupported action "${value}".`, {
      field: "action",
      value,
      allowed: INLINE_TRANSFORM_ACTIONS,
    });
  }

  return value as InlineTransformAction;
}

function ensureNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw invalidInput(`Field "${field}" must be a string.`, { field });
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw invalidInput(`Field "${field}" must not be empty.`, { field });
  }

  return trimmed;
}

function ensureOptionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw invalidInput(`Field "${field}" must be a string when provided.`, {
      field,
    });
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

function ensureOptionalNonNegativeInteger(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidInput(
      `Field "${field}" must be a non-negative integer when provided.`,
      { field },
    );
  }

  return value;
}

function invalidInput(
  message: string,
  details: Record<string, unknown>,
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message,
    statusCode: 400,
    details,
  });
}

function buildInstruction(
  action: InlineTransformAction,
  body: InlineTransformRequestBody,
): string {
  const userInstruction = ensureOptionalString(body.instruction, "instruction");
  const tone = ensureOptionalString(body.tone, "tone");

  const parts: string[] = [ACTION_INSTRUCTION_HINT[action]];

  if (action === "change_tone" && tone) {
    parts.push(`Tone: ${tone}.`);
  }

  if (userInstruction) {
    parts.push(`User instruction: ${userInstruction}.`);
  }

  return parts.join("\n");
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    const parsed = (await request.json()) as T;
    return parsed;
  } catch {
    throw invalidInput("Request body must be valid JSON.", {
      field: "body",
    });
  }
}

function emitAudit(
  emitter: AiAuditEmitter | undefined,
  record: AiAuditRecord,
): void {
  if (!emitter) {
    return;
  }

  try {
    emitter(record);
  } catch {
    // Audit emission must never break a request.
  }
}

function toRuntimeErrorResponse(error: unknown): Response {
  if (error instanceof RuntimeError) {
    return new Response(
      JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        statusCode: error.statusCode,
      }),
      {
        status: error.statusCode,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }

  const message =
    error instanceof Error ? error.message : "Internal server error.";
  return new Response(
    JSON.stringify({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      details: { reason: message },
      statusCode: 500,
    }),
    {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

async function handleInlineTransform(
  request: Request,
  options: MountAiRoutesOptions,
): Promise<Response> {
  try {
    const routing = assertRequestTargetRouting(request, "project_environment");
    const body = await readJsonBody<InlineTransformRequestBody>(request);
    const action = ensureInlineTransformAction(body.action);
    const taskKind = ACTION_TO_TASK[action];

    // Every inline-transform action operates on a selection within a
    // document, so selectionId, selectedText, and documentId are all
    // required. Frontmatter and block-insertion workflows live on
    // separate surfaces — see SPEC-014 §Inline Selection Transforms.
    const documentId = ensureOptionalString(body.documentId, "documentId");
    const selectionId = ensureNonEmptyString(body.selectionId, "selectionId");
    const selectedText = ensureNonEmptyString(
      body.selectedText,
      "selectedText",
    );
    const draftRevision = ensureOptionalNonNegativeInteger(
      body.draftRevision,
      "draftRevision",
    );

    const project = routing.project as string;
    const environment = routing.environment as string;

    const aiAuth = await options.authorize(request, {
      requiredScope: "ai:use",
      project,
      environment,
    });
    let documentForContext: ContentDocumentResponse | undefined;

    if (documentId) {
      await options.authorize(request, {
        requiredScope: "content:read:draft",
        project,
        environment,
      });
      const ctx = await options.contextResolver.loadDraftContext({
        request,
        project,
        environment,
        documentId,
      });
      documentForContext = ctx.document;

      if (
        typeof draftRevision === "number" &&
        documentForContext.draftRevision !== draftRevision
      ) {
        throw new RuntimeError({
          code: "AI_PROPOSAL_CONFLICT",
          message:
            "Provided draftRevision does not match the live draft revision.",
          statusCode: 409,
          details: {
            documentId,
            providedDraftRevision: draftRevision,
            currentDraftRevision: documentForContext.draftRevision,
          },
        });
      }
    }

    const envelope: AiProposalEnvelope = {
      project,
      environment,
      type: documentForContext?.type ?? "page",
      locale: documentForContext?.locale ?? "en",
      ...(documentForContext
        ? {
            documentId: documentForContext.documentId,
            baseDraftRevision: documentForContext.draftRevision,
          }
        : {}),
    };

    const instruction = buildInstruction(action, body);
    const result = await options.orchestrator.runTask({
      taskKind,
      envelope,
      input: {
        instruction,
        locale: envelope.locale,
        ...(selectedText !== undefined ? { selectionText: selectedText } : {}),
        ...(selectionId !== undefined ? { selectionId } : {}),
        ...(documentForContext
          ? {
              documentBody: documentForContext.body,
              frontmatter: documentForContext.frontmatter,
            }
          : {}),
        ...(action === "change_tone" && body.tone
          ? { tone: ensureNonEmptyString(body.tone, "tone") }
          : {}),
      },
    });

    for (const proposal of result.proposals) {
      options.proposalStore.insert({
        proposal,
        actorId: aiAuth.actorId,
      });
    }

    emitAudit(options.emitAudit, {
      ...result.audit,
      project,
      environment,
      actorId: aiAuth.actorId,
      ...(documentId ? { documentId } : {}),
    });

    return new Response(
      JSON.stringify({
        data: { proposals: result.proposals },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    const failureAudit = getOrchestratorFailureAudit(error);
    if (failureAudit) {
      emitAudit(options.emitAudit, failureAudit);
    }
    const runtimeError = getOrchestratorFailureRuntimeError(error) ?? error;
    return toRuntimeErrorResponse(runtimeError);
  }
}

function ensureProposalCanBeApplied(
  record: AiProposalRecord | undefined,
  proposalId: string,
): asserts record is AiProposalRecord {
  if (!record) {
    throw new RuntimeError({
      code: "NOT_FOUND",
      message: "AI proposal not found.",
      statusCode: 404,
      details: { proposalId },
    });
  }

  if (record.status === "expired") {
    throw new RuntimeError({
      code: "AI_PROPOSAL_EXPIRED",
      message: "AI proposal has expired.",
      statusCode: 410,
      details: { proposalId, status: record.status },
    });
  }

  if (record.status !== "pending") {
    throw new RuntimeError({
      code: "AI_PROPOSAL_CONFLICT",
      message: "AI proposal has already been resolved.",
      statusCode: 409,
      details: { proposalId, status: record.status },
    });
  }

  if (record.proposal.validation.status !== "valid") {
    throw new RuntimeError({
      code: "AI_OUTPUT_INVALID",
      message: "AI proposal failed validation and cannot be applied.",
      statusCode: 422,
      details: {
        proposalId,
        errors: record.proposal.validation.errors,
      },
    });
  }
}

function ensureSchemaHashMatch(
  expected: string | undefined,
  provided: string,
): string {
  if (!expected) {
    throw new RuntimeError({
      code: "SCHEMA_NOT_SYNCED",
      message:
        'Target project/environment has no synced schema. Run "cms schema sync" before applying AI proposals.',
      statusCode: 409,
    });
  }

  if (expected !== provided) {
    throw new RuntimeError({
      code: "SCHEMA_HASH_MISMATCH",
      message:
        "Client schema hash does not match the server schema hash for the target project/environment.",
      statusCode: 409,
      details: {
        clientSchemaHash: provided,
        serverSchemaHash: expected,
      },
    });
  }

  return expected;
}

function buildLifecycleAudit(input: {
  proposal: AiProposal;
  outcome: AiAuditRecord["outcome"];
  occurredAt: Date;
  actorId: string;
  errorCode?: string;
  errorMessage?: string;
}): AiAuditRecord {
  const taskKind = mapKindToTask(input.proposal.kind);

  return buildAuditRecord({
    taskKind,
    providerId: input.proposal.provider.providerId,
    model: input.proposal.provider.model,
    promptTemplateId: input.proposal.provider.promptTemplateId,
    occurredAt: input.occurredAt,
    outcome: input.outcome,
    validation: input.proposal.validation,
    proposals: [input.proposal],
    actorId: input.actorId,
    project: input.proposal.project,
    environment: input.proposal.environment,
    ...(input.proposal.documentId
      ? { documentId: input.proposal.documentId }
      : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
  });
}

function mapKindToTask(kind: AiProposalKind): AiTaskKind {
  for (const [task, mapped] of Object.entries(KIND_BY_TASK) as [
    AiTaskKind,
    AiProposalKind,
  ][]) {
    if (mapped === kind) {
      return task;
    }
  }

  return "copy_improvement";
}

async function handleProposalApply(
  request: Request,
  proposalId: string,
  options: MountAiRoutesOptions,
): Promise<Response> {
  const occurredAt = new Date();
  let observedRecord: AiProposalRecord | undefined;

  try {
    await options.requireCsrf(request);
    assertRequestTargetRouting(request, "project_environment");
    const body = await readJsonBody<ProposalApplyRequestBody>(request);
    const schemaHash = ensureNonEmptyString(body.schemaHash, "schemaHash");
    const requestDraftRevision = ensureOptionalNonNegativeInteger(
      body.draftRevision,
      "draftRevision",
    );

    observedRecord = options.proposalStore.observe(proposalId);

    if (observedRecord && observedRecord.status === "expired") {
      const audit = buildLifecycleAudit({
        proposal: observedRecord.proposal,
        outcome: "expired",
        occurredAt,
        actorId: observedRecord.createdByActorId,
        errorCode: "AI_PROPOSAL_EXPIRED",
      });
      emitAudit(options.emitAudit, audit);
    }

    ensureProposalCanBeApplied(observedRecord, proposalId);
    const proposal = observedRecord.proposal;

    if (
      typeof requestDraftRevision === "number" &&
      typeof proposal.baseDraftRevision === "number" &&
      requestDraftRevision !== proposal.baseDraftRevision
    ) {
      throw new RuntimeError({
        code: "AI_PROPOSAL_CONFLICT",
        message:
          "Request draftRevision does not match the proposal base draft revision.",
        statusCode: 409,
        details: {
          requestDraftRevision,
          proposalBaseDraftRevision: proposal.baseDraftRevision,
        },
      });
    }

    const aiAuth = await options.authorize(request, {
      requiredScope: "content:write",
      project: proposal.project,
      environment: proposal.environment,
    });

    const expected = await options.schemaHashLookup({
      project: proposal.project,
      environment: proposal.environment,
    });
    ensureSchemaHashMatch(expected, schemaHash);

    const document = await applyAiProposal({
      proposal,
      expectedSchemaHash: schemaHash,
      actorId: aiAuth.actorId,
      store: options.contentStore,
    });

    const accepted = options.proposalStore.markAccepted({
      proposalId,
      actorId: aiAuth.actorId,
    });

    const audit = buildLifecycleAudit({
      proposal: accepted.proposal,
      outcome: "accepted",
      occurredAt,
      actorId: aiAuth.actorId,
    });
    emitAudit(options.emitAudit, audit);

    return new Response(
      JSON.stringify({
        data: { proposal: accepted.proposal, document },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    if (observedRecord && observedRecord.status === "pending") {
      const code =
        error instanceof RuntimeError ? error.code : "INTERNAL_ERROR";
      const isValidationFailure =
        code === "AI_OUTPUT_INVALID" || code === "SCHEMA_HASH_MISMATCH";
      const isAlreadyExpired = code === "AI_PROPOSAL_EXPIRED";
      const lifecycleOutcome: AiAuditRecord["outcome"] = isAlreadyExpired
        ? "expired"
        : isValidationFailure
          ? "validation_failed"
          : "apply_failed";
      const audit = buildLifecycleAudit({
        proposal: observedRecord.proposal,
        outcome: lifecycleOutcome,
        occurredAt,
        actorId: observedRecord.createdByActorId,
        errorCode: code,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      emitAudit(options.emitAudit, audit);
    }

    return toRuntimeErrorResponse(error);
  }
}

async function handleProposalReject(
  request: Request,
  proposalId: string,
  options: MountAiRoutesOptions,
): Promise<Response> {
  const occurredAt = new Date();

  try {
    await options.requireCsrf(request);
    assertRequestTargetRouting(request, "project_environment");

    const observed = options.proposalStore.observe(proposalId);

    if (!observed) {
      throw new RuntimeError({
        code: "NOT_FOUND",
        message: "AI proposal not found.",
        statusCode: 404,
        details: { proposalId },
      });
    }

    if (observed.status === "expired") {
      emitAudit(
        options.emitAudit,
        buildLifecycleAudit({
          proposal: observed.proposal,
          outcome: "expired",
          occurredAt,
          actorId: observed.createdByActorId,
          errorCode: "AI_PROPOSAL_EXPIRED",
        }),
      );

      throw new RuntimeError({
        code: "AI_PROPOSAL_EXPIRED",
        message: "AI proposal has expired.",
        statusCode: 410,
        details: { proposalId, status: observed.status },
      });
    }

    if (observed.status !== "pending") {
      throw new RuntimeError({
        code: "AI_PROPOSAL_CONFLICT",
        message: "AI proposal has already been resolved.",
        statusCode: 409,
        details: { proposalId, status: observed.status },
      });
    }

    const aiAuth = await options.authorize(request, {
      requiredScope: "ai:use",
      project: observed.proposal.project,
      environment: observed.proposal.environment,
    });

    const rejected = options.proposalStore.markRejected({
      proposalId,
      actorId: aiAuth.actorId,
    });

    emitAudit(
      options.emitAudit,
      buildLifecycleAudit({
        proposal: rejected.proposal,
        outcome: "rejected",
        occurredAt,
        actorId: aiAuth.actorId,
      }),
    );

    return new Response(
      JSON.stringify({
        data: { proposal: rejected.proposal },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    return toRuntimeErrorResponse(error);
  }
}

export function mountAiRoutes(
  app: unknown,
  options: MountAiRoutesOptions,
): void {
  const aiApp = app as AiRouteApp;

  aiApp.post?.("/api/v1/ai/inline-transform", ({ request }: any) =>
    handleInlineTransform(request, options),
  );

  aiApp.post?.(
    "/api/v1/ai/proposals/:proposalId/apply",
    ({ request, params }: any) =>
      handleProposalApply(
        request,
        ensureNonEmptyString(params.proposalId, "proposalId"),
        options,
      ),
  );

  aiApp.post?.(
    "/api/v1/ai/proposals/:proposalId/reject",
    ({ request, params }: any) =>
      handleProposalReject(
        request,
        ensureNonEmptyString(params.proposalId, "proposalId"),
        options,
      ),
  );
}
