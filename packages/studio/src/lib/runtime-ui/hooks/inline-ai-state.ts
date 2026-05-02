import { RuntimeError } from "@mdcms/shared";

import type {
  StudioAiInlineAction,
  StudioAiProposal,
} from "../../ai-route-api.js";
import type {
  InlineAiState,
  InlineAiTransformIntent,
} from "./use-inline-ai-transform.js";

export type InlineAiTransformInput = {
  documentId?: string;
  draftRevision?: number;
  selectionId: string;
  selectedText: string;
  action: StudioAiInlineAction;
  instruction?: string;
  tone?: string;
  keyword?: string;
  componentIntent?: string;
};

export type InlineAiClassifiedError =
  | { kind: "forbidden"; message: string }
  | { kind: "stale"; message: string }
  | { kind: "error"; code: string; message: string };

export function classifyInlineAiError(error: unknown): InlineAiClassifiedError {
  if (error instanceof RuntimeError) {
    if (error.code === "AI_DISABLED" || error.code === "FORBIDDEN") {
      return { kind: "forbidden", message: error.message };
    }

    if (
      error.code === "AI_PROPOSAL_EXPIRED" ||
      error.code === "AI_PROPOSAL_CONFLICT"
    ) {
      return { kind: "stale", message: error.message };
    }

    return { kind: "error", code: error.code, message: error.message };
  }

  return {
    kind: "error",
    code: "AI_REQUEST_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function classifiedToTopLevelInlineAiState(
  classified: InlineAiClassifiedError,
): InlineAiState {
  if (classified.kind === "forbidden") {
    return { status: "forbidden", message: classified.message };
  }

  if (classified.kind === "stale") {
    return {
      status: "error",
      code: "AI_PROPOSAL_CONFLICT",
      message: classified.message,
    };
  }

  return {
    status: "error",
    code: classified.code,
    message: classified.message,
  };
}

export function inlineAiTransformResultToState(input: {
  intent: InlineAiTransformIntent;
  proposals: StudioAiProposal[];
}): InlineAiState {
  const [proposal] = input.proposals;

  if (!proposal) {
    return { status: "empty", intent: input.intent };
  }

  if (proposal.validation.status === "invalid") {
    return {
      status: "validation_invalid",
      proposal,
      intent: input.intent,
    };
  }

  return { status: "proposal", proposal, intent: input.intent };
}

export function selectionRequiredForAction(
  action: StudioAiInlineAction,
): boolean {
  return action !== "improve_seo" && action !== "insert_mdx_component";
}

export function intentForAction(
  action: StudioAiInlineAction,
  detail: string,
): InlineAiTransformIntent {
  if (action === "change_tone") {
    return { action, tone: detail };
  }

  if (action === "improve_seo") {
    return { action, keyword: detail };
  }

  if (action === "insert_mdx_component") {
    return { action, componentIntent: detail };
  }

  return { action };
}
