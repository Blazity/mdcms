import { z } from "zod";

import {
  AI_TASK_KINDS,
  aiProposalOperationSchemaByOp,
  type AiProposalOperation,
  type AiTaskKind,
} from "@mdcms/shared";

import {
  renderProjectKnowledgeBlock,
  type ProjectKnowledgeInput,
} from "./project-knowledge.js";

export type AiTaskAdditionalContextDoc = {
  path: string;
  type: string;
  locale: string;
  body?: string;
  frontmatter?: Record<string, unknown>;
};

export type AiTaskConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

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
  /**
   * Additional documents (`@`-mentioned in the chat composer) that the
   * model should treat as read-only context for the active edit. Path
   * + body excerpt let the model reference them in proposal text but
   * never propose direct writes to them.
   */
  additionalContextDocs?: AiTaskAdditionalContextDoc[];
  /**
   * Prior conversation turns, oldest first, so the model can resolve
   * anaphora across multi-turn chats. The orchestrator caps how many
   * turns it sends to keep the prompt budget bounded.
   */
  conversationHistory?: AiTaskConversationTurn[];
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

const additionalContextDocSchema = z
  .object({
    path: z.string().trim().min(1),
    type: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    body: z.string().optional(),
    frontmatter: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const conversationTurnSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    text: z.string().trim().min(1),
  })
  .strict();

const baseInputSchema = z
  .object({
    instruction: z.string().trim().min(1).optional(),
    selectionText: z.string().optional(),
    selectionId: z.string().trim().min(1).optional(),
    documentBody: z.string().optional(),
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    locale: z.string().trim().min(1),
    tone: z.string().trim().min(1).optional(),
    additionalContextDocs: z.array(additionalContextDocSchema).optional(),
    conversationHistory: z.array(conversationTurnSchema).optional(),
  })
  .strict();

function makeOutputSchema(
  allowedOps: readonly AiProposalOperation["op"][],
): z.ZodType<AiTaskOutput> {
  if (allowedOps.length === 0) {
    throw new Error(
      "Task definition must declare at least one allowed operation kind.",
    );
  }

  // Compose only the schemas for the variants this task actually
  // emits. The full union (`aiProposalOperationSchema`) is still used
  // at the proposal-builder layer to validate provider output, but
  // the JSON Schema we send to the provider via `generateObject` must
  // not advertise variants the model would never produce — strict
  // JSON-Schema modes (e.g. Groq, OpenAI Structured Outputs) reject
  // unions that contain variants with optional fields that aren't
  // listed in `required`.
  //
  // z.discriminatedUnion fails opaquely on duplicate discriminator
  // values; surface a clear error so misconfigured task definitions
  // don't show up as a confusing zod runtime crash.
  const uniqueOps = new Set(allowedOps);
  if (uniqueOps.size !== allowedOps.length) {
    const duplicates = allowedOps.filter(
      (op, idx) => allowedOps.indexOf(op) !== idx,
    );
    throw new Error(
      `makeOutputSchema: allowedOps must be unique. Duplicate op(s): ${[...new Set(duplicates)].join(", ")}.`,
    );
  }
  const variantSchemas = allowedOps.map(
    (op) => aiProposalOperationSchemaByOp[op],
  );
  const operationSchema =
    variantSchemas.length === 1
      ? variantSchemas[0]!
      : (z.discriminatedUnion(
          "op",
          variantSchemas as unknown as [
            (typeof variantSchemas)[number],
            (typeof variantSchemas)[number],
            ...(typeof variantSchemas)[number][],
          ],
        ) as z.ZodType<AiProposalOperation>);

  return z
    .object({
      summary: z.string().trim().min(1),
      operations: z.array(operationSchema).min(1),
    })
    .strict() as z.ZodType<AiTaskOutput>;
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

const MAX_ADDITIONAL_DOC_BODY = 1500;
const MAX_CONVERSATION_HISTORY_TURNS = 10;

const formatConversationHistory = (input: AiTaskInput): string | null => {
  const history = input.conversationHistory;
  if (!history || history.length === 0) return null;
  const recent = history.slice(-MAX_CONVERSATION_HISTORY_TURNS);
  const lines = recent.map((turn) => {
    const speaker = turn.role === "user" ? "User" : "Assistant";
    return `${speaker}: ${turn.text}`;
  });
  return ["Prior conversation:", ...lines].join("\n");
};

const formatAdditionalContextDocs = (input: AiTaskInput): string | null => {
  const docs = input.additionalContextDocs;
  if (!docs || docs.length === 0) return null;
  const blocks = docs.map((doc) => {
    const header = `- ${doc.path} (${doc.type}, ${doc.locale})`;
    const bodySnippet = doc.body
      ? `\n  Excerpt:\n  ${doc.body.slice(0, MAX_ADDITIONAL_DOC_BODY).replace(/\n/g, "\n  ")}`
      : "";
    return `${header}${bodySnippet}`;
  });
  return [
    "Additional documents referenced in this conversation (read-only context, do not propose writes against these):",
    ...blocks,
  ].join("\n");
};

const definitions: Record<AiTaskKind, AiTaskDefinition> = {
  copy_improvement: {
    kind: "copy_improvement",
    promptTemplateId: "copy_improvement.v1",
    system:
      "You revise selected document copy. The input selection may be either: (a) standalone Markdown spanning complete blocks (bullet lists, headings, paragraphs) — preserve that block structure unless the requested action implies collapsing it (e.g., 'shorten' may merge bullets); or (b) a plain-text fragment from inside a single block (a partial sentence or partial bullet) — in that case respond with plain text only, never add Markdown block markers like '- ', '* ', '# ', or '> ', because the host editor will insert your reply inline within the surrounding block. If the input has no Markdown markers, treat it as plain text. Echo the original input exactly into `originalText` and write the new content into `replacementText`. Return only valid JSON matching the requested schema. Do not invent facts or alter unrelated content.",
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        input.tone ? `Tone: ${input.tone}.` : null,
        input.instruction ? `Instruction: ${input.instruction}.` : null,
        `Original selection (Markdown):\n${input.selectionText ?? ""}`,
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
      "You propose edits to the current draft document. Return JSON with replace_selection, insert_block, or update_frontmatter operations. The replace_selection target is the caller's selectionId; do not address other locations. When the conversation includes prior turns, resolve anaphora (e.g. \"it\", \"the same\") against them.",
    // selectionId is required by currentDocumentEditInputSchema, so
    // every replace_selection operation gets a server-trusted
    // anchor stamped by the proposal builder.
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        formatConversationHistory(input),
        input.instruction ? `Instruction: ${input.instruction}.` : null,
        input.selectionText ? `Selection:\n${input.selectionText}` : null,
        input.documentBody ? `Body:\n${input.documentBody}` : null,
        formatAdditionalContextDocs(input),
      ]
        .filter((line): line is string => line !== null)
        .join("\n\n"),
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
      "You draft a new MDCMS document from a brief. Output a single create_document operation as JSON. Do not include unsupported frontmatter fields. When the conversation includes prior turns, resolve anaphora and follow-up requests against them.",
    buildUserPrompt: (input) =>
      [
        formatLocaleHint(input),
        formatConversationHistory(input),
        `Instruction: ${input.instruction ?? ""}`,
        formatAdditionalContextDocs(input),
      ]
        .filter((line): line is string => line !== null)
        .join("\n\n"),
    allowedOperationOps: ["create_document"],
    inputSchema: newDocumentDraftInputSchema,
    outputSchema: makeOutputSchema(["create_document"]),
  },
};

export const AI_TASK_DEFINITIONS: Readonly<
  Record<AiTaskKind, AiTaskDefinition>
> = Object.freeze(definitions);

/**
 * Tool-calling chat mode — used by `AiOrchestrator.runChat`. The model
 * gets a capability-gated toolset (see `chat-tools.ts`) and decides
 * which tool, if any, to invoke. The prompt template id is recorded
 * in audit records the same way task-driven calls are.
 */
export function buildChatSystemPrompt(input: {
  hasActiveDocument: boolean;
  hasAttachedSelection: boolean;
  capabilities: {
    canEditDocument: boolean;
    canCreateDocument: boolean;
    canDeleteDocument: boolean;
  };
  registeredToolNames: string[];
  projectKnowledge: ProjectKnowledgeInput;
}): string {
  const lines: string[] = [
    "You are the MDCMS Studio AI assistant — an in-product helper for content editors.",
    "",
    "Decide what the user wants and act:",
    "- If they want a content change, call the matching tool (one tool per change, multiple tools allowed per turn).",
    "- If they're chatting or asking a question, just reply in text. Never call a tool the user didn't ask for.",
    "",
  ];

  // Project knowledge: the real list of content types + their
  // schemas + supported locales + current user identity. Cache-friendly
  // position: the static portion of the system prompt lands first for
  // future provider-level prompt caching.
  lines.push(renderProjectKnowledgeBlock(input.projectKnowledge), "");

  if (input.registeredToolNames.length > 0) {
    lines.push("Tools available this turn:");
    for (const name of input.registeredToolNames) {
      lines.push(`- ${name}`);
    }
    lines.push("");
  } else {
    lines.push(
      "No content-change tools are available this turn — answer the user in text only.",
      "",
    );
  }

  // Per-action capability + context block. Each row tells the model
  // exactly WHY the corresponding tool is or isn't available so the
  // model can explain the situation when the user asks for something
  // it can't do (e.g., "delete this draft" → no `content:delete` cap
  // → model says "you don't have delete permissions" instead of a
  // generic refusal). Order matters: capability denial wins over
  // missing context because the user can't fix the capability
  // themselves; missing-context messages are actionable.
  const reasons: string[] = [];

  // Edit (replace_selection)
  if (!input.capabilities.canEditDocument) {
    reasons.push(
      "- Edit selection (`propose_edit_selection`): UNAVAILABLE — the signed-in user does not have edit permission (`content:write`). If they ask to rewrite/tighten/edit content, explain they need write access and suggest contacting an admin or switching to a role that has it.",
    );
  } else if (!input.hasActiveDocument) {
    reasons.push(
      "- Edit selection (`propose_edit_selection`): UNAVAILABLE — no document is attached this turn. Ask them to `@`-mention a document or open one in the editor.",
    );
  } else if (!input.hasAttachedSelection) {
    reasons.push(
      "- Edit selection (`propose_edit_selection`): UNAVAILABLE — no text is currently selected. Ask them to highlight the span they want rewritten. For whole-document edits use `propose_insert_block` / `propose_update_frontmatter` instead.",
    );
  } else {
    reasons.push(
      "- Edit selection (`propose_edit_selection`): available. Rewrites the highlighted span; the selectionId is server-supplied — don't invent one.",
    );
  }

  // Insert / update frontmatter
  if (!input.capabilities.canEditDocument) {
    reasons.push(
      "- Insert block / update frontmatter: UNAVAILABLE — same reason as edit (no `content:write`). If the user asks to add content or change metadata, explain the permission gap.",
    );
  } else if (!input.hasActiveDocument) {
    reasons.push(
      "- Insert block / update frontmatter: UNAVAILABLE — no document attached. Ask them to `@`-mention or open one.",
    );
  } else {
    reasons.push(
      "- Insert block / update frontmatter: available against the active draft.",
    );
  }

  // Create
  if (!input.capabilities.canCreateDocument) {
    reasons.push(
      "- Create document (`propose_create_document`): UNAVAILABLE — the signed-in user does not have create permission (`content:write`). Explain the permission gap if asked to draft a new post.",
    );
  } else {
    reasons.push(
      "- Create document (`propose_create_document`): available. Use for new posts/articles/docs — don't use it for edits to existing drafts.",
    );
  }

  // Delete
  if (!input.capabilities.canDeleteDocument) {
    reasons.push(
      "- Delete document (`propose_delete_document`): UNAVAILABLE — the signed-in user does not have delete permission (`content:delete`). If they ask to delete/remove/archive content, say so plainly: \"You don't have delete permission in this role — ask an editor with `content:delete` or have an admin grant the capability.\" Do not propose any other destructive action as a substitute.",
    );
  } else if (!input.hasActiveDocument) {
    reasons.push(
      "- Delete document (`propose_delete_document`): UNAVAILABLE this turn — no document attached. Ask the user to open the draft they want deleted.",
    );
  } else {
    reasons.push(
      "- Delete document (`propose_delete_document`): available. Use ONLY when the user explicitly asks to delete THIS draft. Documents with a published version cannot be deleted.",
    );
  }

  lines.push("Per-action availability + reasons:");
  for (const r of reasons) lines.push(r);
  lines.push("");

  lines.push(
    "Hard limits (the server does not expose tools for these — they are out of scope for the assistant entirely, regardless of role):",
    "- Publishing or unpublishing drafts.",
    "- Schema, role/permission, environment, project, or provider changes.",
    "- Browsing or searching the document library autonomously (no such tool yet — direct the user to `@`-mention).",
    "",
    "When you cannot act (any UNAVAILABLE above): explain the SPECIFIC reason from the per-action list, in one short sentence. Do not pretend you can do it, do not call a different tool as a workaround, and do not invent permission names not listed here.",
    "",
    "Tone: short, helpful, conversational. No emoji. Never claim you've DONE something — your tool calls create proposals that the user accepts manually. After calling a tool, follow up with one short sentence summarizing what you proposed.",
  );

  return lines.join("\n");
}

export function buildChatUserPrompt(input: {
  message: string;
  locale: string;
  activeDocument?: {
    path: string;
    type: string;
    locale: string;
  };
  attachedSelection?: { selectionId: string; text: string };
  additionalContextDocs?: AiTaskAdditionalContextDoc[];
  conversationHistory?: AiTaskConversationTurn[];
}): string {
  const lines: (string | null)[] = [
    `Target locale: ${input.locale}.`,
  ];

  if (input.activeDocument) {
    lines.push(
      `Active draft: ${input.activeDocument.path} (${input.activeDocument.type}, ${input.activeDocument.locale}).`,
    );
  }

  if (input.attachedSelection) {
    lines.push(
      `Selected text:\n${input.attachedSelection.text}`,
    );
  }

  lines.push(
    formatConversationHistory({
      locale: input.locale,
      conversationHistory: input.conversationHistory,
    }),
  );
  lines.push(
    formatAdditionalContextDocs({
      locale: input.locale,
      additionalContextDocs: input.additionalContextDocs,
    }),
  );
  lines.push(`User: ${input.message}`);

  return lines
    .filter((line): line is string => line !== null && line.length > 0)
    .join("\n\n");
}

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
