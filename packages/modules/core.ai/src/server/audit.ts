import type {
  AiErrorCode,
  AiProposal,
  AiProposalValidation,
  AiTaskKind,
} from "@mdcms/shared";

import type { AiProviderUsage } from "./provider.js";

export type AiAuditOutcome = "succeeded" | "invalid_output" | "provider_error";

export type AiAuditRecord = {
  taskKind: AiTaskKind;
  providerId: string;
  /** Empty string when the call failed before the model identified itself. */
  model: string;
  promptTemplateId: string;
  outcome: AiAuditOutcome;
  validation: AiProposalValidation;
  proposalIds?: string[];
  errorCode?: AiErrorCode;
  errorMessage?: string;
  usage?: AiProviderUsage;
  /** ISO-8601 timestamp captured by the orchestrator. */
  occurredAt: string;
};

export type BuildAuditRecordInput = {
  taskKind: AiTaskKind;
  providerId: string;
  model?: string;
  promptTemplateId: string;
  occurredAt: Date;
  outcome: AiAuditOutcome;
  validation?: AiProposalValidation;
  proposals?: AiProposal[];
  errorCode?: AiErrorCode;
  errorMessage?: string;
  usage?: AiProviderUsage;
};

const DEFAULT_VALIDATION: AiProposalValidation = { status: "valid" };

/**
 * Build a structured audit record describing a single orchestration
 * outcome. This module does not persist the record; downstream
 * consumers (audit log writer, observability sinks) are responsible
 * for forwarding it. Producing the record server-side keeps fields
 * stable across consumers.
 */
export function buildAuditRecord(input: BuildAuditRecordInput): AiAuditRecord {
  const record: AiAuditRecord = {
    taskKind: input.taskKind,
    providerId: input.providerId,
    model: input.model ?? "",
    promptTemplateId: input.promptTemplateId,
    outcome: input.outcome,
    validation: input.validation ?? DEFAULT_VALIDATION,
    occurredAt: input.occurredAt.toISOString(),
  };

  if (input.proposals && input.proposals.length > 0) {
    record.proposalIds = input.proposals.map((proposal) => proposal.proposalId);
  }

  if (input.errorCode) {
    record.errorCode = input.errorCode;
  }

  if (input.errorMessage) {
    record.errorMessage = input.errorMessage;
  }

  if (input.usage) {
    const usage = sanitizeUsage(input.usage);

    if (usage) {
      record.usage = usage;
    }
  }

  return record;
}

function sanitizeUsage(usage: AiProviderUsage): AiProviderUsage | undefined {
  const result: AiProviderUsage = {};

  if (typeof usage.inputTokens === "number") {
    result.inputTokens = usage.inputTokens;
  }

  if (typeof usage.outputTokens === "number") {
    result.outputTokens = usage.outputTokens;
  }

  if (typeof usage.totalTokens === "number") {
    result.totalTokens = usage.totalTokens;
  }

  if (typeof usage.costUsd === "number") {
    result.costUsd = usage.costUsd;
  }

  return Object.keys(result).length === 0 ? undefined : result;
}
