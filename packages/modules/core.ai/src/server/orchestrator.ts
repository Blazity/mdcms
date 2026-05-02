import { generateObject } from "ai";
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
import type { AiProvider, AiProviderUsage } from "./provider.js";
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
      const occurredAt = clock();
      const definition = resolveTaskDefinitionOrFail(
        call.taskKind,
        deps.provider.id,
        occurredAt,
      );
      const baseContext: ErrorAuditContext = {
        taskKind: definition.kind,
        providerId: deps.provider.id,
        promptTemplateId: definition.promptTemplateId,
        occurredAt,
      };

      const parsedInput = parseTaskInput(definition, call.input, baseContext);

      const generation = await generateForTask(
        deps.provider,
        definition,
        parsedInput,
        call.maxOutputTokens,
        baseContext,
      );

      const enrichedContext: ErrorAuditContext = {
        ...baseContext,
        model: generation.model,
        usage: generation.usage,
      };

      const proposals = buildProposals(
        definition,
        generation.output,
        deps.provider.id,
        generation.model,
        call.envelope,
        idFactory,
        clock,
        ttlMs,
        enrichedContext,
      );

      const audit = buildAuditRecord({
        taskKind: definition.kind,
        providerId: deps.provider.id,
        model: generation.model,
        promptTemplateId: definition.promptTemplateId,
        occurredAt,
        outcome: "succeeded",
        validation: { status: "valid" },
        proposals,
        usage: generation.usage,
      });

      return { proposals, audit };
    },
  };
}

function resolveTaskDefinitionOrFail(
  taskKind: AiTaskKind,
  providerId: string,
  occurredAt: Date,
): AiTaskDefinition {
  const definition = AI_TASK_DEFINITIONS[taskKind];

  if (definition) {
    return definition;
  }

  const message = `AI task "${taskKind}" is not supported.`;

  throw new OrchestratorFailure(
    aiError("AI_UNSUPPORTED_TASK", message, { taskKind }),
    buildAuditRecord({
      taskKind,
      providerId,
      promptTemplateId: `unknown:${taskKind}`,
      occurredAt,
      outcome: "provider_error",
      validation: { status: "valid" },
      errorCode: "AI_UNSUPPORTED_TASK",
      errorMessage: message,
    }),
  );
}

function parseTaskInput(
  definition: AiTaskDefinition,
  raw: AiTaskInput,
  context: ErrorAuditContext,
): AiTaskInput {
  const parsed = definition.inputSchema.safeParse(raw);

  if (parsed.success) {
    return parsed.data;
  }

  const [first] = parsed.error.issues;
  throw new OrchestratorFailure(
    aiError(
      "AI_OUTPUT_INVALID",
      first?.message ?? "Invalid task input.",
      {
        path: first?.path?.join(".") || undefined,
        issues: parsed.error.issues,
      },
      400,
    ),
    buildAuditRecord({
      ...context,
      outcome: "invalid_output",
      validation: {
        status: "invalid",
        errors: [
          {
            code: "AI_OUTPUT_INVALID",
            message: first?.message ?? "Invalid task input.",
          },
        ],
      },
      errorCode: "AI_OUTPUT_INVALID",
      errorMessage: first?.message ?? "Invalid task input.",
    }),
  );
}

type ErrorAuditContext = {
  taskKind: AiTaskKind;
  providerId: string;
  promptTemplateId: string;
  occurredAt: Date;
  model?: string;
  usage?: AiProviderUsage;
};

type GenerationResult = {
  output: AiTaskOutput;
  model: string;
  usage?: AiProviderUsage;
};

async function generateForTask(
  provider: AiProvider,
  definition: AiTaskDefinition,
  input: AiTaskInput,
  maxOutputTokens: number | undefined,
  context: ErrorAuditContext,
): Promise<GenerationResult> {
  if (provider.languageModel === null) {
    throw new OrchestratorFailure(
      aiError(
        "AI_DISABLED",
        "AI provider is not configured for this deployment.",
      ),
      buildAuditRecord({
        ...context,
        outcome: "provider_error",
        validation: { status: "valid" },
        errorCode: "AI_DISABLED",
        errorMessage: "AI provider is not configured for this deployment.",
      }),
    );
  }

  try {
    const result = await generateObject({
      model: provider.languageModel,
      schema: definition.outputSchema,
      schemaName: `Ai${pascalCase(definition.kind)}Output`,
      system: definition.system,
      prompt: definition.buildUserPrompt(input),
      maxOutputTokens,
    });

    return {
      output: result.object as AiTaskOutput,
      model: provider.languageModel.modelId,
      usage: normalizeUsage(result.usage),
    };
  } catch (error) {
    const mapped = mapProviderError(error);
    const outcome: "invalid_output" | "provider_error" =
      mapped.code === "AI_OUTPUT_INVALID" ? "invalid_output" : "provider_error";

    throw new OrchestratorFailure(
      mapped,
      buildAuditRecord({
        ...context,
        model: provider.languageModel.modelId,
        outcome,
        validation:
          outcome === "invalid_output"
            ? {
                status: "invalid",
                errors: [{ code: mapped.code, message: mapped.message }],
              }
            : { status: "valid" },
        errorCode: isAiErrorCode(mapped.code)
          ? (mapped.code as AiErrorCode)
          : "AI_PROVIDER_UNAVAILABLE",
        errorMessage: mapped.message,
      }),
    );
  }
}

function buildProposals(
  definition: AiTaskDefinition,
  output: AiTaskOutput,
  providerId: string,
  model: string,
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
        providerId,
        model,
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
      throw new OrchestratorFailure(
        error,
        buildAuditRecord({
          ...context,
          outcome: "invalid_output",
          validation: {
            status: "invalid",
            errors: [{ code: "AI_OUTPUT_INVALID", message: error.message }],
          },
          errorCode: "AI_OUTPUT_INVALID",
          errorMessage: error.message,
        }),
      );
    }

    throw error;
  }
}

/**
 * Map AI SDK's LanguageModelUsage shape onto our internal AiProviderUsage,
 * dropping undefined fields so audit records stay tidy.
 */
function normalizeUsage(
  usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    | undefined,
): AiProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }

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

  return Object.keys(result).length === 0 ? undefined : result;
}

function pascalCase(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .map((segment) =>
      segment.length === 0 ? "" : segment[0].toUpperCase() + segment.slice(1),
    )
    .join("");
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
