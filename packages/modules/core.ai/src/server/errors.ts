import { AI_ERROR_CODES, RuntimeError, type AiErrorCode } from "@mdcms/shared";

const DEFAULT_STATUS_BY_CODE: Record<AiErrorCode, number> = {
  AI_DISABLED: 403,
  AI_PROVIDER_UNAVAILABLE: 503,
  AI_RATE_LIMITED: 429,
  AI_CONTEXT_TOO_LARGE: 413,
  AI_OUTPUT_INVALID: 422,
  AI_UNSUPPORTED_TASK: 400,
};

const AI_ERROR_CODE_SET: ReadonlySet<AiErrorCode> = new Set(AI_ERROR_CODES);

export function aiError(
  code: AiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  statusCode?: number,
): RuntimeError {
  return new RuntimeError({
    code,
    message,
    statusCode: statusCode ?? DEFAULT_STATUS_BY_CODE[code],
    details,
  });
}

export function isAiErrorCode(value: string): value is AiErrorCode {
  return AI_ERROR_CODE_SET.has(value as AiErrorCode);
}

const PROVIDER_FAILURE_MESSAGE = "AI provider request failed.";

/**
 * Map any thrown value from a provider call to a deterministic
 * RuntimeError. Existing AI_* RuntimeErrors pass through; everything
 * else collapses to AI_PROVIDER_UNAVAILABLE so callers never see raw
 * provider response bodies or env values in error output.
 */
export function mapProviderError(error: unknown): RuntimeError {
  if (error instanceof RuntimeError && isAiErrorCode(error.code)) {
    return error;
  }

  if (error instanceof Error) {
    return aiError("AI_PROVIDER_UNAVAILABLE", PROVIDER_FAILURE_MESSAGE, {
      cause: error.name,
    });
  }

  return aiError("AI_PROVIDER_UNAVAILABLE", PROVIDER_FAILURE_MESSAGE);
}
