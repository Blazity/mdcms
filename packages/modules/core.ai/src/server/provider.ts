import type { LanguageModelV3 } from "@ai-sdk/provider";

export type AiProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

/**
 * AiProvider wraps an AI SDK language model so the orchestrator can
 * run any provider supported by the Vercel AI SDK behind a single
 * seam.
 *
 * `languageModel === null` represents the disabled state — the
 * orchestrator translates that into AI_DISABLED before constructing a
 * provider request.
 */
export type AiProvider = {
  readonly id: string;
  readonly languageModel: LanguageModelV3 | null;
};

export type AiProviderEnv = Record<string, string | undefined>;

export type AiProviderFactoryDeps = {
  env: AiProviderEnv;
};
