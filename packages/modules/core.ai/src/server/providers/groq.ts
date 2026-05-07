import { createGroq } from "@ai-sdk/groq";

import { aiError } from "../errors.js";
import type { AiProvider } from "../provider.js";

export const GROQ_PROVIDER_ID = "groq" as const;
/**
 * Default Groq model used when `AI_MODEL` is not set. The orchestrator
 * relies on the AI SDK's `generateObject`, which (as of `ai@6`) drives
 * structured output through `response_format: json_schema`. Only a
 * subset of Groq models supports that mode; `openai/gpt-oss-120b` is
 * on the list and produces noticeably better copy edits than the 20b
 * variant on selection-anchored rewrites, so it's the default. See
 * https://console.groq.com/docs/structured-outputs#supported-models
 * for the full set. Operators can override via `AI_MODEL` (e.g. drop
 * to `openai/gpt-oss-20b` for lower latency / cost), but picking a
 * model outside that set will surface `AI_PROVIDER_UNAVAILABLE` at
 * proposal time.
 */
export const GROQ_PROVIDER_DEFAULT_MODEL = "openai/gpt-oss-120b" as const;

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
