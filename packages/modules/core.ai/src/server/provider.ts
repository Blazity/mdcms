import type { AiTaskKind } from "@mdcms/shared";

export type AiProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
};

export type AiProviderRequest = {
  taskKind: AiTaskKind;
  promptTemplateId: string;
  system: string;
  user: string;
  /**
   * JSON schema describing the expected output shape. Providers that
   * support structured outputs use this to constrain decoding; providers
   * that do not are expected to coerce to JSON and rely on the
   * orchestrator's output validation.
   */
  outputJsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
};

export type AiProviderResponse = {
  /** Raw model output. Always a string; orchestration parses to JSON. */
  output: string;
  model: string;
  usage?: AiProviderUsage;
};

export type AiProvider = {
  readonly id: string;
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
};

export type AiProviderEnv = Record<string, string | undefined>;

export type AiProviderFactoryDeps = {
  env: AiProviderEnv;
  /**
   * Injectable fetch so unit tests can stub network calls without
   * patching globals. Real provider adapters use this for HTTP I/O.
   */
  fetch?: typeof fetch;
};
