import { z } from "zod";

import { RuntimeError } from "../runtime/error.js";

export const AI_TASK_KINDS = [
  "copy_improvement",
  "seo_improvement",
  "mdx_component_insertion",
  "current_document_edit",
  "new_document_draft",
] as const;

export type AiTaskKind = (typeof AI_TASK_KINDS)[number];

export const AI_PROPOSAL_KINDS = [
  "replace_selection",
  "insert_block",
  "update_frontmatter",
  "create_document",
] as const;

export type AiProposalKind = (typeof AI_PROPOSAL_KINDS)[number];

export const AI_ERROR_CODES = [
  "AI_DISABLED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_RATE_LIMITED",
  "AI_CONTEXT_TOO_LARGE",
  "AI_OUTPUT_INVALID",
  "AI_UNSUPPORTED_TASK",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

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

export type AiProposalProviderMetadata = {
  providerId: string;
  model: string;
  promptTemplateId: string;
};

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
  provider: AiProposalProviderMetadata;
};

const nonEmptyString = z.string().trim().min(1, {
  message: "must be a non-empty string.",
});

const isoDateString = z.iso.datetime({
  message: "must be an ISO-8601 datetime string.",
});

const recordOfUnknown = z.record(z.string(), z.unknown());

export const aiProposalOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("replace_selection"),
      selectionId: nonEmptyString,
      originalText: z.string(),
      replacementText: z.string(),
    })
    .strict(),
  z
    .object({
      op: z.literal("insert_block"),
      afterSelectionId: nonEmptyString.optional(),
      bodyMdx: z.string().min(1, {
        message: "must be a non-empty MDX block.",
      }),
    })
    .strict(),
  z
    .object({
      op: z.literal("update_frontmatter"),
      patch: recordOfUnknown,
    })
    .strict(),
  z
    .object({
      op: z.literal("create_document"),
      path: nonEmptyString,
      format: z.enum(["md", "mdx"]),
      frontmatter: recordOfUnknown,
      body: z.string(),
    })
    .strict(),
]);

export const aiProposalValidationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("valid") }).strict(),
  z
    .object({
      status: z.literal("invalid"),
      errors: z
        .array(
          z
            .object({
              code: nonEmptyString,
              message: nonEmptyString,
              path: nonEmptyString.optional(),
            })
            .strict(),
        )
        .min(1, { message: "must include at least one validation error." }),
    })
    .strict(),
]);

const aiProposalProviderMetadataSchema = z
  .object({
    providerId: nonEmptyString,
    model: nonEmptyString,
    promptTemplateId: nonEmptyString,
  })
  .strict();

export const aiProposalSchema = z
  .object({
    proposalId: nonEmptyString,
    kind: z.enum(AI_PROPOSAL_KINDS),
    project: nonEmptyString,
    environment: nonEmptyString,
    documentId: nonEmptyString.optional(),
    baseDraftRevision: z.number().int().nonnegative().optional(),
    type: nonEmptyString,
    locale: nonEmptyString,
    summary: nonEmptyString,
    operations: z.array(aiProposalOperationSchema).min(1, {
      message: "must include at least one operation.",
    }),
    validation: aiProposalValidationSchema,
    expiresAt: isoDateString,
    provider: aiProposalProviderMetadataSchema,
  })
  .strict()
  .superRefine((proposal, ctx) => {
    proposal.operations.forEach((operation, index) => {
      if (operation.op !== proposal.kind) {
        ctx.addIssue({
          code: "custom",
          path: ["operations", index, "op"],
          message: `operation.op "${operation.op}" must match proposal.kind "${proposal.kind}".`,
        });
      }
    });
  });

function formatPath(path: string, issuePath: readonly PropertyKey[]): string {
  if (issuePath.length === 0) {
    return path;
  }

  return issuePath.reduce<string>((acc, segment) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }

    if (typeof segment === "symbol") {
      return `${acc}.[${String(segment)}]`;
    }

    return `${acc}.${segment}`;
  }, path);
}

export function assertAiProposal(
  value: unknown,
  path = "proposal",
): asserts value is AiProposal {
  const parsed = aiProposalSchema.safeParse(value);

  if (parsed.success) {
    return;
  }

  const [first] = parsed.error.issues;
  const issuePath = first ? formatPath(path, first.path ?? []) : path;
  const message = first
    ? `${issuePath} ${first.message ?? "is invalid."}`
    : `${path} is invalid.`;

  throw new RuntimeError({
    code: "AI_OUTPUT_INVALID",
    message,
    statusCode: 422,
    details: {
      path: issuePath,
      issues: parsed.error.issues,
    },
  });
}

export function isAiProposal(value: unknown): value is AiProposal {
  return aiProposalSchema.safeParse(value).success;
}
