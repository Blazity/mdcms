import {
  RuntimeError,
  type ApiPaginatedEnvelope,
  type ContentDocumentResponse,
  type ContentVersionDocumentResponse,
  type ContentVersionSummaryResponse,
} from "@mdcms/shared";

import type { MdcmsConfig } from "./studio-component.js";
import {
  applyStudioAuthToRequestInit,
  isStudioCookieAuth,
  type StudioRuntimeAuth,
} from "./request-auth.js";

export type StudioDocumentRouteConfig = Pick<
  MdcmsConfig,
  "project" | "environment" | "serverUrl"
>;

export type StudioDocumentRouteWritePayload = {
  path?: string;
  type?: string;
  locale?: string;
  format?: "md" | "mdx";
  frontmatter?: Record<string, unknown>;
  body?: string;
  sourceDocumentId?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type StudioDocumentRoutePublishPayload = {
  changeSummary?: string;
  actorId?: string;
};

export type StudioDocumentRouteLoadInput = {
  documentId: string;
  type: string;
  locale?: string;
};

export type StudioDocumentRouteMutationInput = {
  documentId: string;
  locale?: string;
  signal?: AbortSignal;
};

export type StudioDocumentRouteVersionListInput =
  StudioDocumentRouteMutationInput & {
    limit?: number;
    offset?: number;
  };

export type StudioDocumentRouteVersionDetailInput =
  StudioDocumentRouteMutationInput & {
    version: number;
    resolve?: string | string[];
  };

export type StudioDocumentRouteApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioDocumentRouteApi = {
  loadDraft: (
    input: StudioDocumentRouteLoadInput,
  ) => Promise<ContentDocumentResponse>;
  bootstrapSessionCsrf: () => Promise<string | undefined>;
  updateDraft: (
    input: StudioDocumentRouteMutationInput & {
      payload: StudioDocumentRouteWritePayload;
    },
  ) => Promise<ContentDocumentResponse>;
  publish: (
    input: StudioDocumentRouteMutationInput & {
      changeSummary?: string;
      actorId?: string;
    },
  ) => Promise<ContentDocumentResponse>;
  listVersions: (
    input: StudioDocumentRouteVersionListInput,
  ) => Promise<ApiPaginatedEnvelope<ContentVersionSummaryResponse>>;
  getVersion: (
    input: StudioDocumentRouteVersionDetailInput,
  ) => Promise<ContentVersionDocumentResponse>;
};

type StudioDocumentRoutePayload = {
  code?: unknown;
  message?: unknown;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function buildUrl(
  config: StudioDocumentRouteConfig,
  path: string,
  query?: Record<string, string | number | string[] | undefined>,
): URL {
  const url = new URL(path, config.serverUrl);

  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function extractRoutePayload(payload: unknown): StudioDocumentRoutePayload {
  if (!isRecord(payload)) {
    return {};
  }

  const data = payload.data;
  const code = payload.code;
  const message = payload.message;

  return {
    code,
    message,
    data,
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
      : "DOCUMENT_ROUTE_REQUEST_FAILED";
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
    code: "DOCUMENT_ROUTE_RESPONSE_INVALID",
    message: fallbackMessage,
    statusCode: 500,
    details: {
      operation,
      payload,
    },
  });
}

function getEnvelopeData<T>(
  operation: string,
  payload: unknown,
  fallbackMessage: string,
): T {
  const parsed = extractRoutePayload(payload);

  if (!isRecord(parsed.data)) {
    throw toInvalidRouteResponseError(operation, fallbackMessage, payload);
  }

  return parsed.data as T;
}

function getPaginatedEnvelopeData<T>(
  operation: string,
  payload: unknown,
  fallbackMessage: string,
): ApiPaginatedEnvelope<T> {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.data) ||
    !isRecord(payload.pagination)
  ) {
    throw toInvalidRouteResponseError(operation, fallbackMessage, payload);
  }

  return {
    data: payload.data as T[],
    pagination: payload.pagination as ApiPaginatedEnvelope<T>["pagination"],
  };
}

function toContentDocumentResponse(
  operation: string,
  payload: unknown,
  fallbackMessage: string,
): ContentDocumentResponse {
  const data = getEnvelopeData<ContentDocumentResponse>(
    operation,
    payload,
    fallbackMessage,
  );

  if (
    typeof data.documentId !== "string" ||
    typeof data.path !== "string" ||
    typeof data.type !== "string" ||
    typeof data.locale !== "string"
  ) {
    throw toInvalidRouteResponseError(operation, fallbackMessage, payload);
  }

  return data;
}

function toContentVersionDocumentResponse(
  operation: string,
  payload: unknown,
  fallbackMessage: string,
): ContentVersionDocumentResponse {
  const data = getEnvelopeData<ContentVersionDocumentResponse>(
    operation,
    payload,
    fallbackMessage,
  );

  if (
    typeof data.documentId !== "string" ||
    typeof data.path !== "string" ||
    typeof data.type !== "string" ||
    typeof data.locale !== "string" ||
    typeof data.version !== "number"
  ) {
    throw toInvalidRouteResponseError(operation, fallbackMessage, payload);
  }

  return data;
}

function toContentVersionSummaryResponse(
  operation: string,
  payload: unknown,
  fallbackMessage: string,
): ApiPaginatedEnvelope<ContentVersionSummaryResponse> {
  const data = getPaginatedEnvelopeData<ContentVersionSummaryResponse>(
    operation,
    payload,
    fallbackMessage,
  );

  return {
    data: data.data,
    pagination: data.pagination,
  };
}

async function requestRouteJson(
  config: StudioDocumentRouteConfig,
  options: StudioDocumentRouteApiOptions,
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
      "Document route request failed.",
    );
  }

  return payload;
}

async function bootstrapStudioSessionCsrfToken(
  config: StudioDocumentRouteConfig,
  options: StudioDocumentRouteApiOptions,
): Promise<string | undefined> {
  if (!isStudioCookieAuth(options.auth)) {
    return undefined;
  }

  const payload = await requestRouteJson(
    config,
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
      code: "DOCUMENT_ROUTE_RESPONSE_INVALID",
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

function withContentRouteHeaders(
  headers: HeadersInit | undefined,
  input: { locale?: string },
): HeadersInit | undefined {
  const nextHeaders = new Headers(headers);
  const locale = input.locale?.trim();

  if (locale) {
    nextHeaders.set("x-mdcms-locale", locale);
  }

  return Array.from(nextHeaders.entries()).length > 0
    ? Object.fromEntries(nextHeaders.entries())
    : undefined;
}

async function requestContentRouteJson(
  options: StudioDocumentRouteApiOptions,
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
      "Content route request failed.",
    );
  }

  return payload;
}

async function requestContentMutation(
  config: StudioDocumentRouteConfig,
  options: StudioDocumentRouteApiOptions,
  input: {
    method: "PUT" | "POST";
    path: string;
    locale?: string;
    payload: unknown;
    signal?: AbortSignal;
  },
): Promise<unknown> {
  const csrfToken = await bootstrapStudioSessionCsrfToken(config, options);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (csrfToken) {
    headers["x-mdcms-csrf-token"] = csrfToken;
  }

  const payload = await requestContentRouteJson(
    options,
    buildUrl(config, input.path),
    {
      method: input.method,
      signal: input.signal,
      headers: withContentRouteHeaders(
        mergeHeaders({
          ...headers,
          "x-mdcms-project": config.project,
          "x-mdcms-environment": config.environment,
        }),
        {
          locale: input.locale,
        },
      ),
      body: JSON.stringify(input.payload),
    },
  );

  return payload;
}

/**
 * createStudioDocumentRouteApi centralizes Studio document route requests for
 * draft reads, draft writes, publish actions, and version history reads.
 */
export function createStudioDocumentRouteApi(
  config: StudioDocumentRouteConfig,
  options: StudioDocumentRouteApiOptions = {},
): StudioDocumentRouteApi {
  return {
    async loadDraft(input) {
      const payload = await requestContentRouteJson(
        options,
        buildUrl(
          config,
          `/api/v1/content/${encodeURIComponent(input.documentId)}`,
          {
            draft: "true",
          },
        ),
        {
          method: "GET",
          headers: withContentRouteHeaders(
            mergeHeaders({
              "x-mdcms-project": config.project,
              "x-mdcms-environment": config.environment,
            }),
            {
              locale: input.locale ?? "en",
            },
          ),
        },
      );

      return toContentDocumentResponse(
        "GET /api/v1/content/:documentId?draft=true",
        payload,
        "Failed to load document draft.",
      );
    },
    async bootstrapSessionCsrf() {
      return bootstrapStudioSessionCsrfToken(config, options);
    },
    async updateDraft(input) {
      const payload = await requestContentMutation(config, options, {
        method: "PUT",
        path: `/api/v1/content/${encodeURIComponent(input.documentId)}`,
        locale: input.locale,
        signal: input.signal,
        payload: input.payload,
      });

      return toContentDocumentResponse(
        "PUT /api/v1/content/:documentId",
        payload,
        "Failed to update document draft.",
      );
    },
    async publish(input) {
      const payload = await requestContentMutation(config, options, {
        method: "POST",
        path: `/api/v1/content/${encodeURIComponent(input.documentId)}/publish`,
        locale: input.locale,
        signal: input.signal,
        payload: {
          changeSummary: input.changeSummary,
          actorId: input.actorId,
        },
      });

      return toContentDocumentResponse(
        "POST /api/v1/content/:documentId/publish",
        payload,
        "Failed to publish document.",
      );
    },
    async listVersions(input) {
      const payload = await requestContentRouteJson(
        options,
        buildUrl(
          config,
          `/api/v1/content/${encodeURIComponent(input.documentId)}/versions`,
          {
            limit: input.limit,
            offset: input.offset,
          },
        ),
        {
          method: "GET",
          signal: input.signal,
          headers: withContentRouteHeaders(
            mergeHeaders({
              "x-mdcms-project": config.project,
              "x-mdcms-environment": config.environment,
            }),
            {
              locale: input.locale,
            },
          ),
        },
      );

      return toContentVersionSummaryResponse(
        "GET /api/v1/content/:documentId/versions",
        payload,
        "Failed to load document version history.",
      );
    },
    async getVersion(input) {
      const payload = await requestContentRouteJson(
        options,
        buildUrl(
          config,
          `/api/v1/content/${encodeURIComponent(input.documentId)}/versions/${encodeURIComponent(String(input.version))}`,
          {
            resolve: input.resolve,
          },
        ),
        {
          method: "GET",
          signal: input.signal,
          headers: withContentRouteHeaders(
            mergeHeaders({
              "x-mdcms-project": config.project,
              "x-mdcms-environment": config.environment,
            }),
            {
              locale: input.locale,
            },
          ),
        },
      );

      return toContentVersionDocumentResponse(
        "GET /api/v1/content/:documentId/versions/:version",
        payload,
        "Failed to load document version.",
      );
    },
  };
}
