import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";

import type { AiProvider, AiProviderUsage } from "../provider.js";

export const ECHO_PROVIDER_ID = "echo" as const;
export const ECHO_PROVIDER_DEFAULT_MODEL = "echo-1" as const;

export type EchoAiProviderOptions = {
  model?: string;
  /**
   * Returns the model output text for a given call. The returned
   * string must be valid JSON matching the task's output schema for
   * `generateObject` to succeed; tests can intentionally return
   * malformed text to exercise the AI_OUTPUT_INVALID path.
   */
  respond?: (options: LanguageModelV3CallOptions) => string;
  usage?: AiProviderUsage;
  /**
   * If set, every doGenerate call rejects with this error. Used in
   * tests to exercise AI_PROVIDER_UNAVAILABLE handling.
   */
  throwOnGenerate?: Error;
};

/**
 * Deterministic in-memory provider for unit tests and local
 * development. Wraps `MockLanguageModelV3` from the AI SDK and
 * lets callers control output text, usage, or failure injection.
 */
export function createEchoAiProvider(
  options: EchoAiProviderOptions = {},
): AiProvider {
  const modelId = options.model ?? ECHO_PROVIDER_DEFAULT_MODEL;

  const languageModel = new MockLanguageModelV3({
    provider: ECHO_PROVIDER_ID,
    modelId,
    doGenerate: async (callOptions) => {
      if (options.throwOnGenerate) {
        throw options.throwOnGenerate;
      }

      const text = options.respond
        ? options.respond(callOptions)
        : extractUserPrompt(callOptions);

      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: {
            total: options.usage?.inputTokens,
            noCache: options.usage?.inputTokens,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: options.usage?.outputTokens,
            text: options.usage?.outputTokens,
            reasoning: undefined,
          },
        },
        warnings: [],
      };
    },
  });

  return {
    id: ECHO_PROVIDER_ID,
    languageModel,
  };
}

function extractUserPrompt(options: LanguageModelV3CallOptions): string {
  for (const message of options.prompt) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.content) {
      if (part.type === "text") {
        return part.text;
      }
    }
  }

  return "";
}
