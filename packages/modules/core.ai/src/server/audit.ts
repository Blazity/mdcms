import type {
  AiErrorCode,
  AiProposal,
  AiProposalKind,
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
  /**
   * Proposal kind for the call. Set when at least one proposal was
   * produced (creation flow) or when the audit describes the
   * lifecycle of a known proposal (apply/reject/expired). SPEC-014
   * §Observability lists this as a required audit field.
   */
  proposalKind?: AiProposalKind;
  /**
   * For inline-transform calls, the user-facing action name ("rewrite",
   * "shorten", etc.). For chat calls, the allowed action used. Empty
   * for orchestrator-direct callers. Spec §Observability lists this
   * as "action name or chat allowed action".
   */
  action?: string;
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
  /**
   * Explicit proposal kind override. When omitted, the kind is taken
   * from the first entry of `proposals`. Set explicitly for lifecycle
   * audits that describe a single known proposal whose record may
   * already have moved to `expired`.
   */
  proposalKind?: AiProposalKind;
  action?: string;
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

  // proposalKind: prefer the explicit override, otherwise derive from
  // the first generated proposal. The orchestrator's task definitions
  // emit single-kind proposal sets today, so the first kind is
  // representative; if a future task ever mixes kinds, the explicit
  // override at the call site is the authoritative source.
  const derivedProposalKind = input.proposalKind ?? input.proposals?.[0]?.kind;
  if (derivedProposalKind) {
    record.proposalKind = derivedProposalKind;
  }

  if (input.action) {
    record.action = input.action;
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
