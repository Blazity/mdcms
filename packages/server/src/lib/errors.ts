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

/**
 * toServerErrorResponse maps unknown errors into the shared envelope and
 * a stable HTTP status code.
 */
export function toServerErrorResponse(
  error: unknown,
  context: ServerErrorContext = {},
): ServerErrorResponse {
  const statusCode = error instanceof RuntimeError ? error.statusCode : 500;

  return {
    statusCode,
    body: serializeError(error, {
      requestId: context.requestId,
      now: context.now,
    }),
  };
}
