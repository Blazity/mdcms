import type { AiProvider } from "../provider.js";

export const NULL_PROVIDER_ID = "null" as const;

/**
 * Disabled provider. Carries a null language model so the orchestrator
 * surfaces AI_DISABLED before attempting any generation.
 */
export function createNullAiProvider(): AiProvider {
  return {
    id: NULL_PROVIDER_ID,
    languageModel: null,
  };
}
