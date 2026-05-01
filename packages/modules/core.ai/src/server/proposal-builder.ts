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

export type ProposalBuilderClock = () => Date;
export type ProposalIdFactory = () => string;

export type AiProposalBuilderDeps = {
  clock: ProposalBuilderClock;
  idFactory: ProposalIdFactory;
  /** Proposal lifetime in milliseconds. */
  ttlMs: number;
};

export type BuildProposalsInput = {
  taskKind: AiTaskKind;
  promptTemplateId: string;
  providerId: string;
  model: string;
  envelope: AiProposalEnvelope;
  output: AiTaskOutput;
};

const PROPOSAL_KIND_BY_OPERATION: Record<
  AiProposalOperation["op"],
  AiProposalKind
> = {
  replace_selection: "replace_selection",
  insert_block: "insert_block",
  update_frontmatter: "update_frontmatter",
  create_document: "create_document",
};

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
 * Build one or more validated AiProposal objects from a parsed
 * task output. Multi-op outputs that mix operation kinds are split
 * into one proposal per kind so Studio can render homogenous
 * accept/reject controls per surface (inline edit vs. frontmatter
 * edit vs. block insertion vs. new document).
 */
export function buildProposalsFromOutput(
  input: BuildProposalsInput,
  deps: AiProposalBuilderDeps,
): AiProposal[] {
  if (input.output.operations.length === 0) {
    throw aiError("AI_OUTPUT_INVALID", "Task output produced no operations.");
  }

  const expiresAt = new Date(deps.clock().getTime() + deps.ttlMs).toISOString();
  const groups = groupOperationsByKind(input.output.operations);

  const proposals: AiProposal[] = groups.map((group) => {
    const proposal: AiProposal = {
      proposalId: deps.idFactory(),
      kind: deriveProposalKind(group),
      project: input.envelope.project,
      environment: input.envelope.environment,
      type: input.envelope.type,
      locale: input.envelope.locale,
      summary: input.output.summary,
      operations: group,
      validation: { status: "valid" },
      expiresAt,
      provider: {
        providerId: input.providerId,
        model: input.model,
        promptTemplateId: input.promptTemplateId,
      },
      ...(input.envelope.documentId !== undefined
        ? { documentId: input.envelope.documentId }
        : {}),
      ...(input.envelope.baseDraftRevision !== undefined
        ? { baseDraftRevision: input.envelope.baseDraftRevision }
        : {}),
    };

    const parsed = aiProposalSchema.safeParse(proposal);

    if (!parsed.success) {
      const validation: AiProposalValidation = {
        status: "invalid",
        errors: parsed.error.issues.map((issue) => ({
          code: issue.code ?? "invalid",
          message: issue.message,
          path: issue.path?.join(".") || undefined,
        })),
      };

      throw aiError(
        "AI_OUTPUT_INVALID",
        "Generated proposal failed schema validation.",
        { validation },
      );
    }

    return parsed.data;
  });

  // When mixed, only the actually-grouped result reflects the split.
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
