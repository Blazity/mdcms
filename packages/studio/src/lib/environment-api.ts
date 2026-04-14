import {
  RuntimeError,
  assertEnvironmentCreateInput,
  assertEnvironmentListResponse,
  assertEnvironmentSummary,
  type EnvironmentCreateInput,
  type EnvironmentListResponse,
  type EnvironmentSummary,
} from "@mdcms/shared";

import {
  applyStudioAuthToRequestInit,
  type StudioRuntimeAuth,
} from "./request-auth.js";
import { resolveStudioRelativeUrl } from "./url-resolution.js";

export type StudioEnvironmentApiConfig = {
  project: string;
  environment: string;
  serverUrl: string;
};

export type StudioEnvironmentApiOptions = {
  auth?: StudioRuntimeAuth;
  csrfToken?: string;
  fetcher?: typeof fetch;
};

export type StudioEnvironmentApi = {
  list: () => Promise<EnvironmentListResponse>;
  create: (input: EnvironmentCreateInput) => Promise<EnvironmentSummary>;
  delete: (environmentId: string) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toRouteFailureError(
  response: Response,
  payload: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): RuntimeError {
  const parsed = isRecord(payload) ? payload : {};
  const code =
    typeof parsed.code === "string" && parsed.code.trim().length > 0
      ? parsed.code
      : fallbackCode;
  const message =
    typeof parsed.message === "string" && parsed.message.trim().length > 0
      ? parsed.message
      : fallbackMessage;

  return new RuntimeError({
    code,
    message,
    statusCode: response.status,
    details: { status: response.status, payload },
  });
}

function resolveRouteUrl(
  config: StudioEnvironmentApiConfig,
  pathname: string,
): URL {
  return resolveStudioRelativeUrl(pathname, config.serverUrl);
}

function requireCsrfToken(
  csrfToken: string | undefined,
  operation: string,
): string {
  if (isNonEmptyString(csrfToken)) {
    return csrfToken;
  }

  throw new RuntimeError({
    code: "MISSING_CSRF_TOKEN",
    message: `${operation} requires a CSRF token.`,
    statusCode: 400,
  });
}

function parseEnvironmentSummaryFromPayload(
  payload: unknown,
  path: string,
): EnvironmentSummary {
  if (!isRecord(payload) || !("data" in payload)) {
    throw new RuntimeError({
      code: "ENVIRONMENT_RESPONSE_INVALID",
      message: "Environment response is invalid.",
      statusCode: 500,
      details: { payload, path },
    });
  }

  const data = payload.data;
  assertEnvironmentSummary(data, path);
  return data;
}

function parseEnvironmentListResponseFromPayload(
  payload: unknown,
  path: string,
): EnvironmentListResponse {
  assertEnvironmentListResponse(payload, path);
  return payload;
}

export function createStudioEnvironmentApi(
  config: StudioEnvironmentApiConfig,
  options: StudioEnvironmentApiOptions = {},
): StudioEnvironmentApi {
  const fetcher = options.fetcher ?? fetch;
  const scopedHeaders = {
    "x-mdcms-project": config.project,
    "x-mdcms-environment": config.environment,
  };

  return {
    async list() {
      const url = resolveRouteUrl(config, "/api/v1/environments");
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "GET",
          headers: scopedHeaders,
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          response,
          payload,
          "ENVIRONMENT_REQUEST_FAILED",
          "Environment list request failed.",
        );
      }

      return parseEnvironmentListResponseFromPayload(payload, "response");
    },

    async create(input) {
      assertEnvironmentCreateInput(input, "input");

      const url = resolveRouteUrl(config, "/api/v1/environments");
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "POST",
          headers: {
            ...scopedHeaders,
            "content-type": "application/json",
            "x-mdcms-csrf-token": requireCsrfToken(
              options.csrfToken,
              "Environment creation",
            ),
          },
          body: JSON.stringify(input),
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          response,
          payload,
          "ENVIRONMENT_CREATE_FAILED",
          "Environment creation failed.",
        );
      }

      return parseEnvironmentSummaryFromPayload(payload, "response.data");
    },

    async delete(environmentId) {
      if (!isNonEmptyString(environmentId)) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message: "Environment id is required.",
          statusCode: 400,
          details: { field: "environmentId" },
        });
      }

      const url = resolveRouteUrl(
        config,
        `/api/v1/environments/${encodeURIComponent(environmentId)}`,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "DELETE",
          headers: {
            ...scopedHeaders,
            "x-mdcms-csrf-token": requireCsrfToken(
              options.csrfToken,
              "Environment deletion",
            ),
          },
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          response,
          payload,
          "ENVIRONMENT_DELETE_FAILED",
          "Environment deletion failed.",
        );
      }
    },
  };
}
