import {
  RuntimeError,
  createConsoleLogger,
  type HealthzPayload,
  type Logger,
} from "@mdcms/shared";

import { parseServerEnv } from "./env.js";
import { toServerErrorResponse } from "./errors.js";
import { createHealthzPayload } from "./health.js";

export type ServerRequestHandler = (request: Request) => Promise<Response>;

export type CreateServerRequestHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  now?: () => Date;
  startedAtMs?: number;
  healthCheck?: () => HealthzPayload;
};

function createJsonResponse(body: unknown, statusCode: number): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/**
 * createServerRequestHandler provides the shared runtime surface for CMS-2,
 * including `/healthz` and unified error envelope responses.
 */
export function createServerRequestHandler(
  options: CreateServerRequestHandlerOptions = {},
): ServerRequestHandler {
  const env = parseServerEnv(options.env ?? process.env);
  const startedAtMs = options.startedAtMs ?? Date.now();
  const now = options.now ?? (() => new Date());
  const logger =
    options.logger ??
    createConsoleLogger({
      level: env.LOG_LEVEL,
      context: {
        service: env.SERVICE_NAME,
      },
    });
  const healthCheck =
    options.healthCheck ??
    (() => createHealthzPayload(env, startedAtMs, now()));

  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? undefined;
    let url: URL;

    try {
      url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/healthz") {
        return createJsonResponse(healthCheck(), 200);
      }

      throw new RuntimeError({
        code: "NOT_FOUND",
        message: "Route not found.",
        statusCode: 404,
        details: {
          method: request.method,
          path: url.pathname,
        },
      });
    } catch (error) {
      const errorResponse = toServerErrorResponse(error, {
        requestId,
        now: now(),
      });

      logger.error("request_failed", {
        method: request.method,
        url: request.url,
        statusCode: errorResponse.statusCode,
        code: errorResponse.body.code,
      });

      return createJsonResponse(errorResponse.body, errorResponse.statusCode);
    }
  };
}
