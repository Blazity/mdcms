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
import {
  resolveStudioRuntimePublicationByBuildId,
  selectStudioBootstrapReadyResponse,
  type StudioBootstrapRetryContext,
  type StudioRuntimePublicationInput,
} from "./studio-bootstrap.js";

export type ServerRequestHandler = (request: Request) => Promise<Response>;

export type ServerAppConfigurator = (app: unknown) => void;

export type CreateServerRequestHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  now?: () => Date;
  startedAtMs?: number;
  healthCheck?: () => HealthzPayload;
  actions?: ActionCatalogItem[];
  studioRuntimePublication?: StudioRuntimePublicationInput;
  isActionVisible?: ActionCatalogVisibilityPolicy;
  configureApp?: ServerAppConfigurator;
};

export type ActionCatalogVisibilityPolicy = (
  context: ActionCatalogVisibilityPolicyContext,
) => boolean | Promise<boolean>;

const DEFAULT_ACTION_VISIBILITY_POLICY: ActionCatalogVisibilityPolicy = () =>
  true;

const STUDIO_CORS_ALLOW_METHODS =
  "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const STUDIO_CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-MDCMS-Project",
  "X-MDCMS-Environment",
  "X-MDCMS-Locale",
  "X-MDCMS-Schema-Hash",
  "X-MDCMS-CSRF-Token",
].join(", ");
const STUDIO_BROWSER_ROUTE_PREFIXES = [
  "/api/v1/studio",
  "/api/v1/actions",
  "/api/v1/auth",
  "/api/v1/me",
  "/api/v1/content",
  "/api/v1/schema",
  "/api/v1/environments",
  "/api/v1/media",
  "/api/v1/search",
  "/api/v1/webhooks",
] as const;

function matchesScopedPathPrefix(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) {
    return false;
  }

  if (pathname.length === prefix.length) {
    return true;
  }

  return pathname.charAt(prefix.length) === "/";
}

function isStudioBrowserRoute(pathname: string): boolean {
  return STUDIO_BROWSER_ROUTE_PREFIXES.some((prefix) =>
    matchesScopedPathPrefix(pathname, prefix),
  );
}

function createForbiddenOriginError(
  origin: string,
  pathname: string,
): RuntimeError {
  return new RuntimeError({
    code: "FORBIDDEN_ORIGIN",
    message: "Browser origin is not allowed for Studio requests.",
    statusCode: 403,
    details: {
      origin,
      path: pathname,
    },
  });
}

function createStudioCorsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": STUDIO_CORS_ALLOW_METHODS,
    "access-control-allow-headers": STUDIO_CORS_ALLOW_HEADERS,
    vary: "Origin",
  };
}

function appendResponseHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  const mergedHeaders = new Headers(response.headers);

  for (const [name, value] of Object.entries(headers)) {
    mergedHeaders.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mergedHeaders,
  });
}

function resolveStudioCorsContext(
  request: Request,
  allowedOrigins: readonly string[],
): { headers: Record<string, string> } | null {
  const pathname = resolvePathname(request);

  if (!isStudioBrowserRoute(pathname)) {
    return null;
  }

  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return null;
  }

  const requestOrigin = new URL(request.url).origin;

  if (origin !== requestOrigin && !allowedOrigins.includes(origin)) {
    throw createForbiddenOriginError(origin, pathname);
  }

  return {
    headers: createStudioCorsHeaders(origin),
  };
}

function isStudioPreflightRequest(request: Request): boolean {
  return (
    request.method.toUpperCase() === "OPTIONS" &&
    request.headers.has("access-control-request-method")
  );
}

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

function createRuntimeErrorResponse(
  error: RuntimeError,
  request: Request,
): Response {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const errorResponse = toServerErrorResponse(error, {
    requestId,
    now: new Date(),
  });

  return createJsonResponse(errorResponse.body, errorResponse.statusCode);
}

function createInvalidStudioBootstrapQueryError(details: {
  field: string;
  value: unknown;
}): RuntimeError {
  return new RuntimeError({
    code: "INVALID_QUERY_PARAM",
    message:
      'Query parameters "rejectedBuildId" and "rejectionReason" must be provided together, and "rejectionReason" must be one of integrity, signature, or compatibility.',
    statusCode: 400,
    details,
  });
}

function createStudioRuntimeDisabledError(): RuntimeError {
  return new RuntimeError({
    code: "STUDIO_RUNTIME_DISABLED",
    message: "Studio runtime publication is disabled by configuration.",
    statusCode: 503,
  });
}

function createStudioRuntimeUnavailableError(): RuntimeError {
  return new RuntimeError({
    code: "STUDIO_RUNTIME_UNAVAILABLE",
    message: "No safe Studio runtime publication is available.",
    statusCode: 503,
  });
}

function parseStudioBootstrapRetryContext(
  request: Request,
): StudioBootstrapRetryContext | undefined {
  const searchParams = new URL(request.url).searchParams;
  const rejectedBuildIds = searchParams
    .getAll("rejectedBuildId")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const rejectionReasons = searchParams
    .getAll("rejectionReason")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (rejectedBuildIds.length === 0 && rejectionReasons.length === 0) {
    return undefined;
  }

  if (rejectedBuildIds.length !== 1 || rejectionReasons.length !== 1) {
    throw createInvalidStudioBootstrapQueryError({
      field: "rejectedBuildId|rejectionReason",
      value: request.url,
    });
  }

  const rejectedBuildId = rejectedBuildIds[0];
  const rejectionReason = rejectionReasons[0];

  if (!rejectedBuildId) {
    throw createInvalidStudioBootstrapQueryError({
      field: "rejectedBuildId",
      value: rejectedBuildIds,
    });
  }

  if (
    rejectionReason !== "integrity" &&
    rejectionReason !== "signature" &&
    rejectionReason !== "compatibility"
  ) {
    throw createInvalidStudioBootstrapQueryError({
      field: "rejectionReason",
      value: rejectionReason,
    });
  }

  return {
    rejectedBuildId,
    rejectionReason,
  };
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
  studioRuntimePublication?: StudioRuntimePublicationInput;
  studioRuntimeDisabled: boolean;
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
    .get("/api/v1/studio/bootstrap", ({ request }) => {
      let retryContext: ReturnType<typeof parseStudioBootstrapRetryContext>;

      try {
        retryContext = parseStudioBootstrapRetryContext(request);
      } catch (error) {
        if (error instanceof RuntimeError) {
          return createRuntimeErrorResponse(error, request);
        }

        throw error;
      }

      if (options.studioRuntimeDisabled) {
        return createRuntimeErrorResponse(
          createStudioRuntimeDisabledError(),
          request,
        );
      }

      const readyResponse = selectStudioBootstrapReadyResponse(
        options.studioRuntimePublication,
        retryContext,
      );

      if (!readyResponse) {
        return createRuntimeErrorResponse(
          createStudioRuntimeUnavailableError(),
          request,
        );
      }

      return readyResponse;
    })
    .get("/api/v1/studio/assets/:buildId/*", async ({ params }) => {
      const buildId = params.buildId;
      const assetPath =
        (params as unknown as Record<string, string>)["*"] ?? "";

      if (!assetPath) {
        return createNotFoundResponse();
      }

      const publication = resolveStudioRuntimePublicationByBuildId(
        options.studioRuntimePublication,
        buildId,
      );

      if (!publication) {
        return createNotFoundResponse();
      }

      const asset = await publication.getAsset({
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
    studioRuntimeDisabled: env.MDCMS_STUDIO_RUNTIME_DISABLED,
    isActionVisible,
    configureApp: options.configureApp,
  });

  return async (request: Request): Promise<Response> => {
    let corsContext: { headers: Record<string, string> } | null = null;

    try {
      corsContext = resolveStudioCorsContext(
        request,
        env.MDCMS_STUDIO_ALLOWED_ORIGINS,
      );

      if (corsContext && isStudioPreflightRequest(request)) {
        return new Response(null, {
          status: 204,
          headers: corsContext.headers,
        });
      }

      targetRoutingGuard(request);
      const response = await app.fetch(request);

      const normalizedResponse = await normalizeElysiaErrorResponse({
        response,
        request,
        now: now(),
        logger,
      });

      return corsContext
        ? appendResponseHeaders(normalizedResponse, corsContext.headers)
        : normalizedResponse;
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

      const response = createJsonResponse(
        errorResponse.body,
        errorResponse.statusCode,
      );

      return corsContext
        ? appendResponseHeaders(response, corsContext.headers)
        : response;
    }
  };
}
