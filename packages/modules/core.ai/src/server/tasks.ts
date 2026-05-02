import { z } from "zod";

import {
  AI_TASK_KINDS,
  aiProposalOperationSchema,
  type AiProposalOperation,
  type AiTaskKind,
} from "@mdcms/shared";

export type AiTaskInput = {
  /**
   * Free-form caller-supplied instruction or topic. Required for chat
   * and SEO tasks; ignored otherwise.
   */
  instruction?: string;
  /** Selected text in the editor, when relevant to the task. */
  selectionText?: string;
  /**
   * Server-trusted selection identifier. The orchestrator stamps this
   * onto every generated `replace_selection` operation, so the model
   * never has to invent a selection id (and any value the model
   * supplies for that field is ignored).
   */
  selectionId?: string;
  /** Document body content for context-bearing tasks. */
  documentBody?: string;
  /** Frontmatter snapshot for SEO and current-document edits. */
  frontmatter?: Record<string, unknown>;
  /** Locale of the target document, used to anchor the response. */
  locale: string;
  /** Tone hint for tone-changing copy edits. */
  tone?: string;
};

export type AiTaskOutput = {
  summary: string;
  operations: AiProposalOperation[];
};

export type AiTaskDefinition = {
  kind: AiTaskKind;
  promptTemplateId: string;
  system: string;
  buildUserPrompt: (input: AiTaskInput) => string;
  /** Operation kinds this task is allowed to emit. */
  allowedOperationOps: AiProposalOperation["op"][];
  inputSchema: z.ZodType<AiTaskInput>;
  outputSchema: z.ZodType<AiTaskOutput>;
};

const baseInputSchema = z
  .object({
    instruction: z.string().trim().min(1).optional(),
    selectionText: z.string().optional(),
    selectionId: z.string().trim().min(1).optional(),
    documentBody: z.string().optional(),
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    locale: z.string().trim().min(1),
    tone: z.string().trim().min(1).optional(),
  })
  .strict();

function makeOutputSchema(
  allowedOps: readonly AiProposalOperation["op"][],
): z.ZodType<AiTaskOutput> {
  const allowed = new Set<string>(allowedOps);

  const operationSchema = aiProposalOperationSchema.refine(
    (op) => allowed.has(op.op),
    {
      message: `operation kind not allowed for this task.`,
    },
  );

  return z
    .object({
      summary: z.string().trim().min(1),
      operations: z.array(operationSchema).min(1),
    })
    .strict();
}

const copyImprovementInputSchema = baseInputSchema
  .refine(
    (input) =>
      typeof input.selectionText === "string" && input.selectionText.length > 0,
    {
      path: ["selectionText"],
      message: "must include selected text for copy improvement.",
    },
  )
  .refine(
    (input) =>
      typeof input.selectionId === "string" && input.selectionId.length > 0,
    {
      path: ["selectionId"],
      message: "must include a selectionId for copy improvement.",
    },
  );

const seoImprovementInputSchema = baseInputSchema.refine(
  (input) => Boolean(input.documentBody) || Boolean(input.frontmatter),
  {
    path: ["documentBody"],
    message: "must include document body or frontmatter for SEO improvement.",
  },
);

const mdxInsertionInputSchema = baseInputSchema.refine(
  (input) =>
    typeof input.instruction === "string" && input.instruction.length > 0,
  {
    path: ["instruction"],
    message: "must include an instruction for MDX component insertion.",
  },
);

const currentDocumentEditInputSchema = baseInputSchema
  .refine(
    (input) => Boolean(input.documentBody) || Boolean(input.selectionText),
    {
      path: ["documentBody"],
      message:
        "must include document body or a selection for current-document edit.",
    },
  )
  .refine(
    (input) =>
      typeof input.selectionId === "string" && input.selectionId.length > 0,
    {
      path: ["selectionId"],
      message:
        "must include a selectionId for current-document edit so replace_selection proposals can be anchored server-side.",
    },
  );

const newDocumentDraftInputSchema = baseInputSchema.refine(
  (input) =>
    typeof input.instruction === "string" && input.instruction.length > 0,
  {
    path: ["instruction"],
    message: "must include an instruction for new-document creation.",
  },
);

const formatLocaleHint = (input: AiTaskInput): string =>
  `Target locale: ${input.locale}.`;

const definitions: Record<AiTaskKind, AiTaskDefinition> = {
  copy_improvement: {
    kind: "copy_improvement",
    promptTemplateId: "copy_improvement.v1",
    system:
      "You revise selected document copy. Return only valid JSON matching the requested schema. Do not invent facts or alter unrelated content.",
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        input.tone ? `Tone: ${input.tone}.` : null,
        input.instruction ? `Instruction: ${input.instruction}.` : null,
        `Original selection:\n${input.selectionText ?? ""}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    allowedOperationOps: ["replace_selection"],
    inputSchema: copyImprovementInputSchema,
    outputSchema: makeOutputSchema(["replace_selection"]),
  },
  seo_improvement: {
    kind: "seo_improvement",
    promptTemplateId: "seo_improvement.v1",
    system:
      "You suggest SEO edits to an MDCMS document by updating frontmatter only. Return JSON describing update_frontmatter operations.",
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        input.instruction ? `Goal: ${input.instruction}.` : null,
        input.frontmatter
          ? `Frontmatter:\n${JSON.stringify(input.frontmatter, null, 2)}`
          : null,
        input.documentBody ? `Body:\n${input.documentBody}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    // replace_selection is intentionally excluded: SEO is invoked
    // doc-level (no trusted selection anchor), so we cannot stamp a
    // server-trusted selectionId. Body rewrites for SEO go through
    // copy_improvement (inline) or current_document_edit (chat), both
    // of which require a selectionId in input.
    allowedOperationOps: ["update_frontmatter"],
    inputSchema: seoImprovementInputSchema,
    outputSchema: makeOutputSchema(["update_frontmatter"]),
  },
  mdx_component_insertion: {
    kind: "mdx_component_insertion",
    promptTemplateId: "mdx_component_insertion.v1",
    system:
      "You compose MDX content using only registered MDX components and valid props. Output a single insert_block operation as JSON.",
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        `Instruction: ${input.instruction ?? ""}`,
        input.documentBody ? `Surrounding body:\n${input.documentBody}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    allowedOperationOps: ["insert_block"],
    inputSchema: mdxInsertionInputSchema,
    outputSchema: makeOutputSchema(["insert_block"]),
  },
  current_document_edit: {
    kind: "current_document_edit",
    promptTemplateId: "current_document_edit.v1",
    system:
      "You propose edits to the current draft document. Return JSON with replace_selection, insert_block, or update_frontmatter operations. The replace_selection target is the caller's selectionId; do not address other locations.",
    // selectionId is required by currentDocumentEditInputSchema, so
    // every replace_selection operation gets a server-trusted
    // anchor stamped by the proposal builder.
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        input.instruction ? `Instruction: ${input.instruction}.` : null,
        input.selectionText ? `Selection:\n${input.selectionText}` : null,
        input.documentBody ? `Body:\n${input.documentBody}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    allowedOperationOps: [
      "replace_selection",
      "insert_block",
      "update_frontmatter",
    ],
    inputSchema: currentDocumentEditInputSchema,
    outputSchema: makeOutputSchema([
      "replace_selection",
      "insert_block",
      "update_frontmatter",
    ]),
  },
  new_document_draft: {
    kind: "new_document_draft",
    promptTemplateId: "new_document_draft.v1",
    system:
      "You draft a new MDCMS document from a brief. Output a single create_document operation as JSON. Do not include unsupported frontmatter fields.",
    buildUserPrompt: (input) =>
      [formatLocaleHint(input), `Instruction: ${input.instruction ?? ""}`].join(
        "\n",
      ),
    allowedOperationOps: ["create_document"],
    inputSchema: newDocumentDraftInputSchema,
    outputSchema: makeOutputSchema(["create_document"]),
  },
};

export const AI_TASK_DEFINITIONS: Readonly<
  Record<AiTaskKind, AiTaskDefinition>
> = Object.freeze(definitions);

export function getAiTaskDefinition(
  kind: AiTaskKind,
): AiTaskDefinition | undefined {
  return AI_TASK_DEFINITIONS[kind];
}

/**
 * Public list of supported task kinds. Source of truth is the shared
 * AI_TASK_KINDS constant; this re-export keeps callers from touching
 * the registry directly when they only need the discrete set.
 */
export const SUPPORTED_AI_TASK_KINDS: readonly AiTaskKind[] = AI_TASK_KINDS;
