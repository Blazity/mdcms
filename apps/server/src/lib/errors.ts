import {
  RuntimeError,
  serializeError,
  type ErrorEnvelope,
} from "@mdcms/shared";

export type ServerErrorResponse = {
  statusCode: number;
  body: ErrorEnvelope;
};

export type ServerErrorContext = {
  requestId?: string;
  now?: Date;
};

function resolveStatusCode(error: unknown): number {
  if (error instanceof RuntimeError) {
    return error.statusCode;
  }

  if (typeof error !== "object" || error === null) {
    return 500;
  }

  const candidate = error as { statusCode?: unknown };

  return typeof candidate.statusCode === "number" ? candidate.statusCode : 500;
}

/**
 * toServerErrorResponse maps unknown errors into the shared envelope and
 * a stable HTTP status code.
 */
export function toServerErrorResponse(
  error: unknown,
  context: ServerErrorContext = {},
): ServerErrorResponse {
  const statusCode = resolveStatusCode(error);

  return {
    statusCode,
    body: serializeError(error, {
      requestId: context.requestId,
      now: context.now,
    }),
  };
}
