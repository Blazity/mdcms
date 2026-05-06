import { createGroq } from "@ai-sdk/groq";

import { aiError } from "../errors.js";
import type { AiProvider } from "../provider.js";

export const GROQ_PROVIDER_ID = "groq" as const;
/**
 * Default Groq model used when `AI_MODEL` is not set. `llama-3.3-70b-versatile`
 * supports the JSON-mode structured-output path that the orchestrator's
 * `generateObject` calls require.
 */
export const GROQ_PROVIDER_DEFAULT_MODEL = "llama-3.3-70b-versatile" as const;

export type GroqProviderOptions = {
  apiKey: string;
  model?: string;
  /** Optional override of the Groq base URL (e.g. for proxies). */
  baseURL?: string;
};

/**
 * Build a Groq-backed AiProvider. The orchestrator drives generation
 * through the Vercel AI SDK, so once the language model instance is
 * resolved Groq is treated identically to any other SDK provider —
 * task definitions and proposal builders remain provider-agnostic.
 */
export function createGroqAiProvider(options: GroqProviderOptions): AiProvider {
  const trimmedKey = options.apiKey.trim();

  if (trimmedKey.length === 0) {
    throw aiError(
      "AI_PROVIDER_UNAVAILABLE",
      "Groq provider requires a non-empty GROQ_API_KEY.",
      { providerId: GROQ_PROVIDER_ID },
    );
  }

  const groq = createGroq({
    apiKey: trimmedKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  });
  const modelId = options.model?.trim() || GROQ_PROVIDER_DEFAULT_MODEL;

  return {
    id: GROQ_PROVIDER_ID,
    languageModel: groq(modelId),
  };
}
