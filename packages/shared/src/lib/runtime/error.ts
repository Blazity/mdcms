/**
 * ErrorEnvelope is the shared error response contract across server and
 * runtime adapters.
 */
export type ErrorEnvelope = {
  status: "error";
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  timestamp: string;
};

export type RuntimeErrorOptions = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
};

export type SerializeErrorContext = {
  requestId?: string;
  now?: Date;
};

export function isRuntimeErrorLike(
  error: unknown,
): error is Pick<RuntimeError, "code" | "message" | "details" | "statusCode"> {
  if (error instanceof RuntimeError) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    statusCode?: unknown;
  };

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.statusCode === "number"
  );
}

/**
 * RuntimeError represents expected domain/runtime failures that should
 * keep a stable error code, details and HTTP status mapping.
 */
export class RuntimeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly statusCode: number;

  constructor(options: RuntimeErrorOptions) {
    super(options.message);
    this.name = "RuntimeError";
    this.code = options.code;
    this.details = options.details;
    this.statusCode = options.statusCode ?? 500;
  }
}

/**
 * serializeError converts unknown failures into the shared ErrorEnvelope
 * used by server and runtime adapters.
 */
export function serializeError(
  error: unknown,
  context: SerializeErrorContext = {},
): ErrorEnvelope {
  const timestamp = (context.now ?? new Date()).toISOString();
  const base: Omit<ErrorEnvelope, "code" | "message"> = {
    status: "error",
    requestId: context.requestId,
    timestamp,
  };

  if (isRuntimeErrorLike(error)) {
    return {
      ...base,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      ...base,
      code: "INTERNAL_ERROR",
      message: error.message || "Unexpected runtime error.",
    };
  }

  if (typeof error === "string" && error.length > 0) {
    return {
      ...base,
      code: "INTERNAL_ERROR",
      message: error,
    };
  }

  return {
    ...base,
    code: "INTERNAL_ERROR",
    message: "Unexpected runtime error.",
  };
}
