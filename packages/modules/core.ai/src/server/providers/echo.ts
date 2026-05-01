import type {
  AiProvider,
  AiProviderRequest,
  AiProviderResponse,
  AiProviderUsage,
} from "../provider.js";

export const ECHO_PROVIDER_ID = "echo" as const;
export const ECHO_PROVIDER_DEFAULT_MODEL = "echo-1" as const;

export type EchoAiProviderOptions = {
  model?: string;
  /**
   * Synchronous override for the response output. Receives the prompt
   * payload so tests can return shape-specific JSON per task kind.
   */
  respond?: (request: AiProviderRequest) => string;
  usage?: AiProviderUsage;
  /**
   * If set, every call rejects with this error. Used in tests to
   * exercise the provider-failure path.
   */
  throwOnComplete?: Error;
};

/**
 * Deterministic in-memory provider for unit tests and local
 * development. By default it echoes the user prompt back as the
 * model output so downstream parsing can be exercised without a
 * real provider.
 */
export function createEchoAiProvider(
  options: EchoAiProviderOptions = {},
): AiProvider {
  const model = options.model ?? ECHO_PROVIDER_DEFAULT_MODEL;

  return {
    id: ECHO_PROVIDER_ID,
    async complete(request): Promise<AiProviderResponse> {
      if (options.throwOnComplete) {
        throw options.throwOnComplete;
      }

      const output = options.respond ? options.respond(request) : request.user;

      return {
        output,
        model,
        usage: options.usage,
      };
    },
  };
}
