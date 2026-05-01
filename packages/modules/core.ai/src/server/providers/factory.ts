import { aiError } from "../errors.js";
import type { AiProvider, AiProviderFactoryDeps } from "../provider.js";
import { createEchoAiProvider, ECHO_PROVIDER_ID } from "./echo.js";
import { createNullAiProvider, NULL_PROVIDER_ID } from "./null.js";

export const AI_PROVIDER_ENV_KEY = "AI_PROVIDER" as const;

/**
 * Resolve an AiProvider from environment configuration.
 *
 * Behavior:
 * - Missing or "disabled" → null provider (returns AI_DISABLED on use).
 * - "echo" → in-memory echo provider for tests/local dev.
 * - Any other id (e.g. "anthropic", "openai") is reserved for future
 *   adapters. This ticket throws AI_PROVIDER_UNAVAILABLE so callers
 *   surface a stable error instead of silently degrading.
 */
export function resolveAiProvider(deps: AiProviderFactoryDeps): AiProvider {
  const raw = deps.env[AI_PROVIDER_ENV_KEY];
  const id = raw?.trim().toLowerCase();

  if (!id || id === "disabled") {
    return createNullAiProvider();
  }

  if (id === ECHO_PROVIDER_ID) {
    return createEchoAiProvider();
  }

  if (id === NULL_PROVIDER_ID) {
    return createNullAiProvider();
  }

  throw aiError(
    "AI_PROVIDER_UNAVAILABLE",
    `AI provider "${id}" is not implemented in this build.`,
    { providerId: id },
  );
}
