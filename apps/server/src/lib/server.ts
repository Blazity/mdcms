import {
  RuntimeError,
  assertActionCatalogItem,
  createConsoleLogger,
  type ActionCatalogItem,
  type ActionCatalogVisibilityPolicyContext,
  type HealthzPayload,
  type Logger,
} from "@mdcms/shared";
import { createActionCatalogContractApp } from "@mdcms/shared/action-catalog-contract";
import { Elysia } from "elysia";

import { parseServerEnv } from "./env.js";
import { toServerErrorResponse } from "./errors.js";
import { createHealthzPayload } from "./health.js";
import { createJsonResponse, resolvePathname } from "./http-utils.js";
import { createTargetRoutingGuard } from "./target-routing-guard.js";
import type { StudioRuntimePublication } from "./studio-bootstrap.js";

export type ServerRequestHandler = (request: Request) => Promise<Response>;

export type ServerAppConfigurator = (app: unknown) => void;

export type CreateServerRequestHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  now?: () => Date;
  startedAtMs?: number;
  healthCheck?: () => HealthzPayload;
  actions?: ActionCatalogItem[];
  studioRuntimePublication?: StudioRuntimePublication;
  isActionVisible?: ActionCatalogVisibilityPolicy;
  configureApp?: ServerAppConfigurator;
};

export type ActionCatalogVisibilityPolicy = (
  context: ActionCatalogVisibilityPolicyContext,
) => boolean | Promise<boolean>;

const DEFAULT_ACTION_VISIBILITY_POLICY: ActionCatalogVisibilityPolicy = () =>
  true;

function createNotFoundError(method: string, path: string): RuntimeError {
  return new RuntimeError({
    code: "NOT_FOUND",
    message: "Route not found.",
    statusCode: 404,
    details: {
      method,
      path,
    },
  });
}

function createNotFoundResponse(): Response {
  return new Response("Route not found.", { status: 404 });
}

function normalizeActionCatalog(
  actions: ActionCatalogItem[],
): ActionCatalogItem[] {
  const seenIds = new Set<string>();

  actions.forEach((action, index) => {
    assertActionCatalogItem(action, `actions[${index}]`);

    if (seenIds.has(action.id)) {
      throw new RuntimeError({
        code: "DUPLICATE_ACTION_ID",
        message: `Duplicate action id "${action.id}" was found in action catalog setup.`,
        statusCode: 500,
        details: {
          actionId: action.id,
        },
      });
    }

    seenIds.add(action.id);
  });

  return [...actions].sort((left, right) => left.id.localeCompare(right.id));
}

async function filterVisibleActions(
  actions: ActionCatalogItem[],
  request: Request,
  isActionVisible: ActionCatalogVisibilityPolicy,
): Promise<ActionCatalogItem[]> {
  const visible: ActionCatalogItem[] = [];

  for (const action of actions) {
    const isVisible = await isActionVisible({
      action,
      request,
    });

    if (isVisible) {
      visible.push(action);
    }
  }

  return visible;
}

function createServerApp(options: {
  healthCheck: () => HealthzPayload;
  actions: ActionCatalogItem[];
  studioRuntimePublication?: StudioRuntimePublication;
  isActionVisible: ActionCatalogVisibilityPolicy;
  configureApp?: ServerAppConfigurator;
}) {
  const actionsById = new Map(
    options.actions.map((action) => [action.id, action]),
  );
  const actionCatalogApp = createActionCatalogContractApp({
    list: async ({ request }) =>
      filterVisibleActions(options.actions, request, options.isActionVisible),
    getById: async ({ id, request }) => {
      const action = actionsById.get(id);

      if (!action) {
        return createNotFoundResponse();
      }

      const isVisible = await options.isActionVisible({
        action,
        request,
      });

      if (!isVisible) {
        return createNotFoundResponse();
      }

      return action;
    },
  });

  const app = new Elysia()
    .get("/healthz", () => options.healthCheck())
    .get("/api/v1/studio/bootstrap", () => {
      if (!options.studioRuntimePublication) {
        return createNotFoundResponse();
      }

      return {
        data: options.studioRuntimePublication.manifest,
      };
    })
    .get("/api/v1/studio/assets/:buildId/*", async ({ params }) => {
      if (!options.studioRuntimePublication) {
        return createNotFoundResponse();
      }

      const buildId = params.buildId;
      const assetPath =
        (params as unknown as Record<string, string>)["*"] ?? "";

      if (!assetPath) {
        return createNotFoundResponse();
      }

      const asset = await options.studioRuntimePublication.getAsset({
        buildId,
        assetPath,
      });

      if (!asset) {
        return createNotFoundResponse();
      }

      return new Response(asset.body, {
        status: 200,
        headers: {
          "content-type": asset.contentType,
        },
      });
    });

  options.configureApp?.(app);

  return app.use(actionCatalogApp);
}

async function normalizeElysiaErrorResponse(input: {
  response: Response;
  request: Request;
  now: Date;
  logger: Logger;
}): Promise<Response> {
  if (input.response.status < 400) {
    return input.response;
  }

  const contentType = input.response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return input.response;
  }

  const rawMessage = await input.response.text();
  const error =
    input.response.status === 404
      ? createNotFoundError(
          input.request.method,
          resolvePathname(input.request),
        )
      : new RuntimeError({
          code: input.response.status >= 500 ? "INTERNAL_ERROR" : "HTTP_ERROR",
          message: rawMessage || "Request failed.",
          statusCode: input.response.status,
        });
  const requestId = input.request.headers.get("x-request-id") ?? undefined;
  const errorResponse = toServerErrorResponse(error, {
    requestId,
    now: input.now,
  });

  input.logger.error("request_failed", {
    method: input.request.method,
    url: input.request.url,
    statusCode: errorResponse.statusCode,
    code: errorResponse.body.code,
  });

  return createJsonResponse(errorResponse.body, errorResponse.statusCode);
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
  const actions = normalizeActionCatalog(options.actions ?? []);
  const isActionVisible =
    options.isActionVisible ?? DEFAULT_ACTION_VISIBILITY_POLICY;
  const targetRoutingGuard = createTargetRoutingGuard();
  const app = createServerApp({
    healthCheck,
    actions,
    studioRuntimePublication: options.studioRuntimePublication,
    isActionVisible,
    configureApp: options.configureApp,
  });

  return async (request: Request): Promise<Response> => {
    try {
      targetRoutingGuard(request);
      const response = await app.fetch(request);

      return normalizeElysiaErrorResponse({
        response,
        request,
        now: now(),
        logger,
      });
    } catch (error) {
      const requestId = request.headers.get("x-request-id") ?? undefined;
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
