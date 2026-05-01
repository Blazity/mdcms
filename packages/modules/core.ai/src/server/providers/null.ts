import { aiError } from "../errors.js";
import type { AiProvider } from "../provider.js";

export const NULL_PROVIDER_ID = "null" as const;

/**
 * Disabled provider. Every call surfaces AI_DISABLED with a stable
 * error code, used when no provider is configured for the deployment.
 */
export function createNullAiProvider(): AiProvider {
  return {
    id: NULL_PROVIDER_ID,
    async complete() {
      throw aiError(
        "AI_DISABLED",
        "AI provider is not configured for this deployment.",
      );
    },
  };
}
