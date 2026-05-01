import {
  RuntimeError,
  type AiErrorCode,
  type AiProposal,
  type AiTaskKind,
} from "@mdcms/shared";

import { buildAuditRecord, type AiAuditRecord } from "./audit.js";
import { aiError, isAiErrorCode, mapProviderError } from "./errors.js";
import {
  buildProposalsFromOutput,
  type AiProposalEnvelope,
} from "./proposal-builder.js";
import type { AiProvider, AiProviderResponse } from "./provider.js";
import {
  AI_TASK_DEFINITIONS,
  type AiTaskDefinition,
  type AiTaskInput,
  type AiTaskOutput,
} from "./tasks.js";

export const DEFAULT_PROPOSAL_TTL_MS = 5 * 60 * 1000;

export type AiOrchestratorClock = () => Date;
export type AiOrchestratorIdFactory = () => string;

export type AiOrchestratorDeps = {
  provider: AiProvider;
  clock?: AiOrchestratorClock;
  idFactory?: AiOrchestratorIdFactory;
  proposalTtlMs?: number;
};

export type AiOrchestrationInput = {
  taskKind: AiTaskKind;
  envelope: AiProposalEnvelope;
  input: AiTaskInput;
  /** Hard ceiling forwarded to the provider when supported. */
  maxOutputTokens?: number;
};

export type AiOrchestrationResult = {
  proposals: AiProposal[];
  audit: AiAuditRecord;
};

export type AiOrchestrator = {
  readonly providerId: string;
  runTask(input: AiOrchestrationInput): Promise<AiOrchestrationResult>;
};

export function createAiOrchestrator(deps: AiOrchestratorDeps): AiOrchestrator {
  const clock = deps.clock ?? (() => new Date());
  const idFactory = deps.idFactory ?? defaultIdFactory;
  const ttlMs = deps.proposalTtlMs ?? DEFAULT_PROPOSAL_TTL_MS;

  return {
    providerId: deps.provider.id,
    async runTask(call) {
      const definition = resolveTaskDefinition(call.taskKind);
      const occurredAt = clock();

      const parsedInput = parseTaskInput(definition, call.input);
      const providerResponse = await callProvider(
        deps.provider,
        definition,
        parsedInput,
        call.maxOutputTokens,
        {
          taskKind: definition.kind,
          providerId: deps.provider.id,
          promptTemplateId: definition.promptTemplateId,
          occurredAt,
        },
      );

      const parsedOutput = parseTaskOutput(
        definition,
        providerResponse.output,
        {
          taskKind: definition.kind,
          providerId: deps.provider.id,
          model: providerResponse.model,
          promptTemplateId: definition.promptTemplateId,
          occurredAt,
          usage: providerResponse.usage,
        },
      );

      const proposals = buildProposals(
        definition,
        parsedOutput,
        providerResponse,
        call.envelope,
        idFactory,
        clock,
        ttlMs,
        {
          taskKind: definition.kind,
          providerId: deps.provider.id,
          model: providerResponse.model,
          promptTemplateId: definition.promptTemplateId,
          occurredAt,
          usage: providerResponse.usage,
        },
      );

      const audit = buildAuditRecord({
        taskKind: definition.kind,
        providerId: deps.provider.id,
        model: providerResponse.model,
        promptTemplateId: definition.promptTemplateId,
        occurredAt,
        outcome: "succeeded",
        validation: { status: "valid" },
        proposals,
        usage: providerResponse.usage,
      });

      return { proposals, audit };
    },
  };
}

function resolveTaskDefinition(taskKind: AiTaskKind): AiTaskDefinition {
  const definition = AI_TASK_DEFINITIONS[taskKind];

  if (!definition) {
    throw aiError(
      "AI_UNSUPPORTED_TASK",
      `AI task "${taskKind}" is not supported.`,
      { taskKind },
    );
  }

  return definition;
}

function parseTaskInput(
  definition: AiTaskDefinition,
  raw: AiTaskInput,
): AiTaskInput {
  const parsed = definition.inputSchema.safeParse(raw);

  if (!parsed.success) {
    const [first] = parsed.error.issues;

    throw aiError(
      "AI_OUTPUT_INVALID",
      first?.message ?? "Invalid task input.",
      {
        path: first?.path?.join(".") || undefined,
        issues: parsed.error.issues,
      },
      400,
    );
  }

  return parsed.data;
}

type ErrorAuditContext = {
  taskKind: AiTaskKind;
  providerId: string;
  promptTemplateId: string;
  occurredAt: Date;
  model?: string;
  usage?: AiProviderResponse["usage"];
};

async function callProvider(
  provider: AiProvider,
  definition: AiTaskDefinition,
  input: AiTaskInput,
  maxOutputTokens: number | undefined,
  context: ErrorAuditContext,
): Promise<AiProviderResponse> {
  try {
    return await provider.complete({
      taskKind: definition.kind,
      promptTemplateId: definition.promptTemplateId,
      system: definition.system,
      user: definition.buildUserPrompt(input),
      maxOutputTokens,
    });
  } catch (error) {
    const mapped = mapProviderError(error);
    throw new OrchestratorFailure(
      mapped,
      buildAuditRecord({
        ...context,
        outcome: "provider_error",
        validation: { status: "valid" },
        errorCode: isAiErrorCode(mapped.code)
          ? (mapped.code as AiErrorCode)
          : "AI_PROVIDER_UNAVAILABLE",
        errorMessage: mapped.message,
      }),
    );
  }
}

function parseTaskOutput(
  definition: AiTaskDefinition,
  rawOutput: string,
  context: ErrorAuditContext,
): AiTaskOutput {
  const json = tryParseJson(rawOutput);

  if (json.kind === "error") {
    throw invalidOutputFailure(
      "Task output was not valid JSON.",
      { reason: json.message },
      context,
    );
  }

  const parsed = definition.outputSchema.safeParse(json.value);

  if (!parsed.success) {
    const [first] = parsed.error.issues;

    throw invalidOutputFailure(
      first?.message ?? "Task output failed schema validation.",
      {
        path: first?.path?.join(".") || undefined,
        issues: parsed.error.issues,
      },
      context,
    );
  }

  return parsed.data;
}

function buildProposals(
  definition: AiTaskDefinition,
  output: AiTaskOutput,
  providerResponse: AiProviderResponse,
  envelope: AiProposalEnvelope,
  idFactory: AiOrchestratorIdFactory,
  clock: AiOrchestratorClock,
  ttlMs: number,
  context: ErrorAuditContext,
): AiProposal[] {
  try {
    return buildProposalsFromOutput(
      {
        taskKind: definition.kind,
        promptTemplateId: definition.promptTemplateId,
        providerId: providerResponse.model
          ? context.providerId
          : context.providerId,
        model: providerResponse.model,
        envelope,
        output,
      },
      { clock, idFactory, ttlMs },
    );
  } catch (error) {
    if (
      error instanceof RuntimeError &&
      isAiErrorCode(error.code) &&
      error.code === "AI_OUTPUT_INVALID"
    ) {
      throw invalidOutputFailure(error.message, error.details, {
        ...context,
        model: providerResponse.model,
        usage: providerResponse.usage,
      });
    }

    throw error;
  }
}

function invalidOutputFailure(
  message: string,
  details: Record<string, unknown> | undefined,
  context: ErrorAuditContext,
): OrchestratorFailure {
  const error = aiError("AI_OUTPUT_INVALID", message, details);

  return new OrchestratorFailure(
    error,
    buildAuditRecord({
      ...context,
      outcome: "invalid_output",
      validation: {
        status: "invalid",
        errors: [
          {
            code: "AI_OUTPUT_INVALID",
            message,
          },
        ],
      },
      errorCode: "AI_OUTPUT_INVALID",
      errorMessage: message,
    }),
  );
}

type ParseJsonResult =
  | { kind: "ok"; value: unknown }
  | { kind: "error"; message: string };

function tryParseJson(raw: string): ParseJsonResult {
  try {
    return { kind: "ok", value: JSON.parse(raw) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON parse error";

    return { kind: "error", message };
  }
}

/**
 * OrchestratorFailure pairs the public RuntimeError with the audit
 * record describing the failure. The orchestrator throws it; callers
 * that catch the error can read the audit record via
 * `getOrchestratorFailureAudit()` to record the outcome.
 */
export class OrchestratorFailure extends Error {
  override readonly cause: RuntimeError;
  readonly audit: AiAuditRecord;

  constructor(cause: RuntimeError, audit: AiAuditRecord) {
    super(cause.message);
    this.name = "OrchestratorFailure";
    this.cause = cause;
    this.audit = audit;
  }
}

export function getOrchestratorFailureAudit(
  error: unknown,
): AiAuditRecord | undefined {
  return error instanceof OrchestratorFailure ? error.audit : undefined;
}

export function getOrchestratorFailureRuntimeError(
  error: unknown,
): RuntimeError | undefined {
  return error instanceof OrchestratorFailure ? error.cause : undefined;
}

let nextProposalCounter = 0;

function defaultIdFactory(): string {
  nextProposalCounter += 1;
  const random = Math.random().toString(36).slice(2, 10);

  return `prop_${Date.now().toString(36)}_${nextProposalCounter}_${random}`;
}
