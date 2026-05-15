import {
  aiProposalSchema,
  type AiProposal,
  type AiProposalKind,
  type AiProposalOperation,
  type AiProposalValidation,
  type AiTaskKind,
} from "@mdcms/shared";

import { aiError } from "./errors.js";
import type { AiTaskOutput } from "./tasks.js";

export type AiProposalEnvelope = {
  project: string;
  environment: string;
  type: string;
  locale: string;
  documentId?: string;
  baseDraftRevision?: number;
};

/**
 * Server-trusted anchors that callers stamp onto the generated
 * operations so the model never has to invent them. The orchestrator
 * forwards values from `AiTaskInput` here.
 */
export type AiProposalAnchors = {
  /** Forced selectionId on every `replace_selection` operation. */
  selectionId?: string;
};

export type AiProposalCandidate = Omit<AiProposal, "validation">;

/**
 * Domain validator hook. Receives a candidate proposal (envelope +
 * operations) and returns the validation status that should land on
 * the final proposal. The foundation defaults to `{ status: "valid" }`
 * when no validator is provided, which means callers without a
 * validator are explicitly opting into shape-only validation —
 * future endpoints that wire MDX/schema/frontmatter checks must pass
 * a real validator so Studio's accept/reject controls reflect actual
 * apply-time correctness.
 *
 * The validator is async because real implementations need to look up
 * the project schema from the DB to decide whether the frontmatter is
 * valid for the proposed content type.
 */
export type AiProposalValidator = (
  candidate: AiProposalCandidate,
) => Promise<AiProposalValidation>;

export type ProposalBuilderClock = () => Date;
export type ProposalIdFactory = () => string;

export type AiProposalBuilderDeps = {
  clock: ProposalBuilderClock;
  idFactory: ProposalIdFactory;
  /** Proposal lifetime in milliseconds. */
  ttlMs: number;
  validator?: AiProposalValidator;
};

export type BuildProposalsInput = {
  taskKind: AiTaskKind;
  promptTemplateId: string;
  providerId: string;
  model: string;
  envelope: AiProposalEnvelope;
  output: AiTaskOutput;
  anchors?: AiProposalAnchors;
};

const PROPOSAL_KIND_BY_OPERATION: Record<
  AiProposalOperation["op"],
  AiProposalKind
> = {
  replace_selection: "replace_selection",
  insert_block: "insert_block",
  update_frontmatter: "update_frontmatter",
  create_document: "create_document",
  delete_document: "delete_document",
};

const SHAPE_VALID: AiProposalValidation = Object.freeze({
  status: "valid",
}) as AiProposalValidation;

function deriveProposalKind(
  operations: readonly AiProposalOperation[],
): AiProposalKind {
  const [first] = operations;

  if (!first) {
    throw aiError("AI_OUTPUT_INVALID", "Task output produced no operations.");
  }

  return PROPOSAL_KIND_BY_OPERATION[first.op];
}

function mixedOperationKinds(
  operations: readonly AiProposalOperation[],
): boolean {
  if (operations.length <= 1) {
    return false;
  }

  const [head, ...tail] = operations;

  return tail.some((operation) => operation.op !== head.op);
}

/**
 * Apply server-trusted anchors to the model's operations. The model's
 * value for any anchored field is discarded; the input value wins.
 */
function applyAnchors(
  operations: readonly AiProposalOperation[],
  anchors: AiProposalAnchors | undefined,
): AiProposalOperation[] {
  if (!anchors) {
    return operations.slice();
  }

  return operations.map((op) => {
    if (op.op === "replace_selection" && anchors.selectionId) {
      return { ...op, selectionId: anchors.selectionId };
    }

    return op;
  });
}

/**
 * Build one or more validated AiProposal objects from a parsed
 * task output. Multi-op outputs that mix operation kinds are split
 * into one proposal per kind so Studio can render homogenous
 * accept/reject controls per surface (inline edit vs. frontmatter
 * edit vs. block insertion vs. new document).
 */
export async function buildProposalsFromOutput(
  input: BuildProposalsInput,
  deps: AiProposalBuilderDeps,
): Promise<AiProposal[]> {
  if (input.output.operations.length === 0) {
    throw aiError("AI_OUTPUT_INVALID", "Task output produced no operations.");
  }

  const expiresAt = new Date(deps.clock().getTime() + deps.ttlMs).toISOString();
  const stamped = applyAnchors(input.output.operations, input.anchors);
  const groups = groupOperationsByKind(stamped);

  const proposals: AiProposal[] = [];
  for (const group of groups) {
    const kind = deriveProposalKind(group);
    // create_document targets a NEW document, so source-document
    // anchors from the envelope must not leak in. The other kinds
    // mutate an existing draft, so they keep documentId and
    // baseDraftRevision when supplied.
    const carriesSourceDocument = kind !== "create_document";
    const candidate: AiProposalCandidate = {
      proposalId: deps.idFactory(),
      kind,
      project: input.envelope.project,
      environment: input.envelope.environment,
      type: input.envelope.type,
      locale: input.envelope.locale,
      summary: input.output.summary,
      operations: group,
      expiresAt,
      provider: {
        providerId: input.providerId,
        model: input.model,
        promptTemplateId: input.promptTemplateId,
      },
      ...(carriesSourceDocument && input.envelope.documentId !== undefined
        ? { documentId: input.envelope.documentId }
        : {}),
      ...(carriesSourceDocument &&
      input.envelope.baseDraftRevision !== undefined
        ? { baseDraftRevision: input.envelope.baseDraftRevision }
        : {}),
    };

    const validation = deps.validator
      ? await deps.validator(candidate)
      : SHAPE_VALID;
    const proposal: AiProposal = { ...candidate, validation };

    const parsed = aiProposalSchema.safeParse(proposal);

    if (!parsed.success) {
      throw aiError(
        "AI_OUTPUT_INVALID",
        "Generated proposal failed schema validation.",
        {
          issues: parsed.error.issues.map((issue) => ({
            code: issue.code ?? "invalid",
            message: issue.message,
            path: issue.path?.join(".") || undefined,
          })),
        },
      );
    }

    proposals.push(parsed.data);
  }

  if (proposals.length === 0) {
    throw aiError(
      "AI_OUTPUT_INVALID",
      "Task output produced no usable proposals.",
    );
  }

  return proposals;
}

function groupOperationsByKind(
  operations: readonly AiProposalOperation[],
): AiProposalOperation[][] {
  if (!mixedOperationKinds(operations)) {
    return [operations.slice()];
  }

  const buckets = new Map<AiProposalOperation["op"], AiProposalOperation[]>();
  const order: AiProposalOperation["op"][] = [];

  for (const operation of operations) {
    if (!buckets.has(operation.op)) {
      buckets.set(operation.op, []);
      order.push(operation.op);
    }

    buckets.get(operation.op)!.push(operation);
  }

  return order.map((op) => buckets.get(op)!);
}
