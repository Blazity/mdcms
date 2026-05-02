import type {
  AiErrorCode,
  AiProposal,
  AiProposalValidation,
  AiTaskKind,
} from "@mdcms/shared";

import type { AiProviderUsage } from "./provider.js";

export type AiAuditOutcome =
  | "succeeded"
  | "invalid_output"
  | "provider_error"
  | "accepted"
  | "rejected"
  | "expired"
  | "apply_failed"
  | "validation_failed";

export type AiAuditRecord = {
  taskKind: AiTaskKind;
  providerId: string;
  /** Empty string when the call failed before the model identified itself. */
  model: string;
  promptTemplateId: string;
  outcome: AiAuditOutcome;
  validation: AiProposalValidation;
  proposalIds?: string[];
  errorCode?: string;
  errorMessage?: string;
  usage?: AiProviderUsage;
  /** Actor identifier when known at apply/reject time. */
  actorId?: string;
  /** Project/environment captured for lifecycle events. */
  project?: string;
  environment?: string;
  /** Document id touched by the lifecycle event (apply only). */
  documentId?: string;
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
  errorCode?: AiErrorCode | string;
  errorMessage?: string;
  usage?: AiProviderUsage;
  actorId?: string;
  project?: string;
  environment?: string;
  documentId?: string;
};

const DEFAULT_VALIDATION: AiProposalValidation = Object.freeze({
  status: "valid",
}) as AiProposalValidation;

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

  if (input.actorId) {
    record.actorId = input.actorId;
  }

  if (input.project) {
    record.project = input.project;
  }

  if (input.environment) {
    record.environment = input.environment;
  }

  if (input.documentId) {
    record.documentId = input.documentId;
  }

  return record;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function sanitizeUsage(usage: AiProviderUsage): AiProviderUsage | undefined {
  const result: AiProviderUsage = {};

  if (isFiniteNonNegative(usage.inputTokens)) {
    result.inputTokens = usage.inputTokens;
  }

  if (isFiniteNonNegative(usage.outputTokens)) {
    result.outputTokens = usage.outputTokens;
  }

  if (isFiniteNonNegative(usage.totalTokens)) {
    result.totalTokens = usage.totalTokens;
  }

  if (isFiniteNonNegative(usage.costUsd)) {
    result.costUsd = usage.costUsd;
  }

  return Object.keys(result).length === 0 ? undefined : result;
}
