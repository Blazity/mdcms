import { isRuntimeErrorLike, serializeError } from "@mdcms/shared";

export function createJsonResponse(
  body: unknown,
  statusCode: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function resolvePathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

export function toRuntimeErrorResponse(
  error: unknown,
  request: Request,
): Response {
  if (!isRuntimeErrorLike(error)) {
    throw error;
  }

  const requestId = request.headers.get("x-request-id") ?? undefined;
  const envelope = serializeError(error, { requestId });
  return createJsonResponse(envelope, error.statusCode);
}

export async function executeWithRuntimeErrorsHandled(
  request: Request,
  run: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return toRuntimeErrorResponse(error, request);
  }
}
