import { aiError } from "../errors.js";
import type { AiProvider, AiProviderFactoryDeps } from "../provider.js";
import { createEchoAiProvider, ECHO_PROVIDER_ID } from "./echo.js";
import { createGroqAiProvider, GROQ_PROVIDER_ID } from "./groq.js";
import { createNullAiProvider, NULL_PROVIDER_ID } from "./null.js";

export const AI_PROVIDER_ENV_KEY = "AI_PROVIDER" as const;
export const AI_MODEL_ENV_KEY = "AI_MODEL" as const;
export const GROQ_API_KEY_ENV_KEY = "GROQ_API_KEY" as const;
export const GROQ_BASE_URL_ENV_KEY = "GROQ_BASE_URL" as const;

/**
 * Resolve an AiProvider from environment configuration.
 *
 * Behavior:
 * - Missing or "disabled" → null provider (orchestrator surfaces
 *   AI_DISABLED).
 * - "echo" → in-memory Vercel AI SDK mock model for tests and local
 *   dev.
 * - "groq" → real Groq adapter via `@ai-sdk/groq`. Reads
 *   `GROQ_API_KEY` (required), optional `AI_MODEL`
 *   (defaults to `llama-3.3-70b-versatile`), and optional
 *   `GROQ_BASE_URL` for proxies.
 * - Any other id is reserved for future AI SDK provider package
 *   adapters and currently throws `AI_PROVIDER_UNAVAILABLE` so callers
 *   surface a stable error instead of silently degrading.
 */
export function resolveAiProvider(deps: AiProviderFactoryDeps): AiProvider {
  const raw = deps.env[AI_PROVIDER_ENV_KEY];
  const id = raw?.trim().toLowerCase();
  const model = deps.env[AI_MODEL_ENV_KEY]?.trim();

  if (!id || id === "disabled") {
    return createNullAiProvider();
  }

  if (id === ECHO_PROVIDER_ID) {
    return createEchoAiProvider();
  }

  if (id === NULL_PROVIDER_ID) {
    return createNullAiProvider();
  }

  if (id === GROQ_PROVIDER_ID) {
    const apiKey = deps.env[GROQ_API_KEY_ENV_KEY]?.trim();

    if (!apiKey) {
      throw aiError(
        "AI_PROVIDER_UNAVAILABLE",
        `Groq provider requires ${GROQ_API_KEY_ENV_KEY} to be set.`,
        { providerId: GROQ_PROVIDER_ID },
      );
    }

    const baseURL = deps.env[GROQ_BASE_URL_ENV_KEY]?.trim();

    return createGroqAiProvider({
      apiKey,
      ...(model ? { model } : {}),
      ...(baseURL ? { baseURL } : {}),
    });
  }

  throw aiError(
    "AI_PROVIDER_UNAVAILABLE",
    `AI provider "${id}" is not implemented in this build.`,
    { providerId: id },
  );
}
