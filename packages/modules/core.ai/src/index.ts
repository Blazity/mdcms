import type { MdcmsModulePackage } from "@mdcms/shared";

import { coreAiManifest } from "./manifest.js";
import { coreAiServerSurface } from "./server/index.js";

export const coreAiModule: MdcmsModulePackage<
  unknown,
  Record<string, unknown>
> = {
  manifest: coreAiManifest,
  server: coreAiServerSurface,
};

export {
  createAiOrchestrator,
  DEFAULT_PROPOSAL_TTL_MS,
  getOrchestratorFailureAudit,
  getOrchestratorFailureRuntimeError,
  OrchestratorFailure,
  type AiOrchestrationInput,
  type AiOrchestrationResult,
  type AiOrchestrator,
  type AiOrchestratorDeps,
} from "./server/orchestrator.js";
export {
  createAiOrchestratorFromEnv,
  type CreateAiOrchestratorFromEnvDeps,
} from "./server/index.js";
export { aiError, isAiErrorCode, mapProviderError } from "./server/errors.js";
export {
  buildProposalsFromOutput,
  type AiProposalBuilderDeps,
  type AiProposalEnvelope,
  type BuildProposalsInput,
} from "./server/proposal-builder.js";
export {
  buildAuditRecord,
  type AiAuditOutcome,
  type AiAuditRecord,
  type BuildAuditRecordInput,
} from "./server/audit.js";
export {
  AI_TASK_DEFINITIONS,
  getAiTaskDefinition,
  SUPPORTED_AI_TASK_KINDS,
  type AiTaskDefinition,
  type AiTaskInput,
  type AiTaskOutput,
} from "./server/tasks.js";
export {
  AI_PROVIDER_ENV_KEY,
  resolveAiProvider,
} from "./server/providers/factory.js";
export {
  createNullAiProvider,
  NULL_PROVIDER_ID,
} from "./server/providers/null.js";
export {
  createEchoAiProvider,
  ECHO_PROVIDER_DEFAULT_MODEL,
  ECHO_PROVIDER_ID,
  type EchoAiProviderOptions,
} from "./server/providers/echo.js";
export type {
  AiProvider,
  AiProviderEnv,
  AiProviderFactoryDeps,
  AiProviderUsage,
} from "./server/provider.js";
