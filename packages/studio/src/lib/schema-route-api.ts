import {
  RuntimeError,
  assertSchemaRegistrySyncPayload,
  validateSchemaRegistryListResponse,
  type SchemaRegistryListResponse,
  type SchemaRegistrySyncPayload,
} from "@mdcms/shared";

import type { MdcmsConfig } from "./studio-component.js";
import {
  applyStudioAuthToRequestInit,
  isStudioCookieAuth,
  type StudioRuntimeAuth,
} from "./request-auth.js";
import { resolveStudioRelativeUrl } from "./url-resolution.js";

export type StudioSchemaRouteConfig = Pick<
  MdcmsConfig,
  "project" | "environment" | "serverUrl"
>;

export type StudioSchemaRouteApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioSchemaRouteSyncResult = {
  schemaHash: string;
  syncedAt: string;
  affectedTypes: string[];
};

export type StudioSchemaRouteApi = {
  list: () => Promise<SchemaRegistryListResponse>;
  sync: (
    payload: SchemaRegistrySyncPayload,
  ) => Promise<StudioSchemaRouteSyncResult>;
};

type SchemaRoutePayload = {
  code?: unknown;
  message?: unknown;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isArrayOfStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function mergeHeaders(
  ...headerSets: Array<HeadersInit | undefined>
): HeadersInit | undefined {
  const headers = new Headers();

  for (const headerSet of headerSets) {
    if (!headerSet) {
      continue;
    }

    new Headers(headerSet).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return Array.from(headers.entries()).length > 0
    ? Object.fromEntries(headers.entries())
    : undefined;
}

function buildUrl(config: StudioSchemaRouteConfig, path: string): URL {
  return resolveStudioRelativeUrl(path, config.serverUrl);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function extractRoutePayload(payload: unknown): SchemaRoutePayload {
  if (!isRecord(payload)) {
    return {};
  }

  return {
    code: payload.code,
    message: payload.message,
    data: payload.data,
  };
}

function toRouteFailureError(
  operation: string,
  response: Response,
  payload: unknown,
  fallbackMessage: string,
): RuntimeError {
  const parsed = extractRoutePayload(payload);
  const code =
    typeof parsed.code === "string" && parsed.code.trim().length > 0
      ? parsed.code
      : "SCHEMA_ROUTE_REQUEST_FAILED";
  const message =
    typeof parsed.message === "string" && parsed.message.trim().length > 0
      ? parsed.message
      : fallbackMessage;

  return new RuntimeError({
    code,
    message,
    statusCode: response.status,
    details: {
      operation,
      status: response.status,
      payload,
    },
  });
}

function toInvalidRouteResponseError(
  operation: string,
  fallbackMessage: string,
  payload: unknown,
): RuntimeError {
  return new RuntimeError({
    code: "SCHEMA_ROUTE_RESPONSE_INVALID",
    message: fallbackMessage,
    statusCode: 500,
    details: {
      operation,
      payload,
    },
  });
}

function validateSchemaRegistryListRoutePayload(
  operation: string,
  payload: unknown,
): SchemaRegistryListResponse {
  const parsed = extractRoutePayload(payload);

  if (!isRecord(parsed.data)) {
    throw toInvalidRouteResponseError(
      operation,
      "Schema registry response is invalid.",
      payload,
    );
  }

  try {
    return validateSchemaRegistryListResponse(
      `${operation}.data`,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof RuntimeError) {
      throw toInvalidRouteResponseError(
        operation,
        "Schema registry response is invalid.",
        payload,
      );
    }
    throw error;
  }
}

function validateSchemaRegistrySyncResponse(
  operation: string,
  payload: unknown,
): StudioSchemaRouteSyncResult {
  const parsed = extractRoutePayload(payload);

  if (!isRecord(parsed.data)) {
    throw toInvalidRouteResponseError(
      operation,
      "Schema sync response is invalid.",
      payload,
    );
  }

  const data = parsed.data;

  if (
    !isNonEmptyString(data.schemaHash) ||
    !isNonEmptyString(data.syncedAt) ||
    !isArrayOfStrings(data.affectedTypes)
  ) {
    throw toInvalidRouteResponseError(
      operation,
      "Schema sync response is invalid.",
      payload,
    );
  }

  return {
    schemaHash: data.schemaHash,
    syncedAt: data.syncedAt,
    affectedTypes: data.affectedTypes,
  };
}

async function requestSchemaRouteJson(
  options: StudioSchemaRouteApiOptions,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    input,
    applyStudioAuthToRequestInit(options.auth, init),
  );
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw toRouteFailureError(
      init.method ?? "GET",
      response,
      payload,
      "Schema route request failed.",
    );
  }

  return payload;
}

async function bootstrapStudioSessionCsrfToken(
  config: StudioSchemaRouteConfig,
  options: StudioSchemaRouteApiOptions,
): Promise<string | undefined> {
  if (!isStudioCookieAuth(options.auth)) {
    return undefined;
  }

  const payload = await requestSchemaRouteJson(
    options,
    buildUrl(config, "/api/v1/auth/session"),
    {
      method: "GET",
    },
  );

  const parsed = extractRoutePayload(payload);
  const csrfToken =
    isRecord(parsed.data) && typeof parsed.data.csrfToken === "string"
      ? parsed.data.csrfToken
      : undefined;

  if (!csrfToken) {
    throw new RuntimeError({
      code: "SCHEMA_ROUTE_RESPONSE_INVALID",
      message: "Studio auth/session response did not include a CSRF token.",
      statusCode: 500,
      details: {
        operation: "GET /api/v1/auth/session",
        payload,
      },
    });
  }

  return csrfToken;
}

/**
 * createStudioSchemaRouteApi centralizes Studio schema registry requests for
 * read-only browsing and explicit schema sync actions.
 */
export function createStudioSchemaRouteApi(
  config: StudioSchemaRouteConfig,
  options: StudioSchemaRouteApiOptions = {},
): StudioSchemaRouteApi {
  return {
    async list() {
      const payload = await requestSchemaRouteJson(
        options,
        buildUrl(config, "/api/v1/schema"),
        {
          method: "GET",
          headers: mergeHeaders({
            "x-mdcms-project": config.project,
            "x-mdcms-environment": config.environment,
          }),
        },
      );

      return validateSchemaRegistryListRoutePayload(
        "GET /api/v1/schema",
        payload,
      );
    },
    async sync(payload) {
      assertSchemaRegistrySyncPayload(payload);

      const csrfToken = await bootstrapStudioSessionCsrfToken(config, options);
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-mdcms-project": config.project,
        "x-mdcms-environment": config.environment,
      };

      if (csrfToken) {
        headers["x-mdcms-csrf-token"] = csrfToken;
      }

      const responsePayload = await requestSchemaRouteJson(
        options,
        buildUrl(config, "/api/v1/schema"),
        {
          method: "PUT",
          headers: mergeHeaders(headers),
          body: JSON.stringify(payload),
        },
      );

      return validateSchemaRegistrySyncResponse(
        "PUT /api/v1/schema",
        responsePayload,
      );
    },
  };
}
