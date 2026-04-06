import {
  RuntimeError,
  type ApiPaginatedEnvelope,
  type ContentDocumentResponse,
} from "@mdcms/shared";

import type { MdcmsConfig } from "./studio-component.js";
import {
  applyStudioAuthToRequestInit,
  type StudioRuntimeAuth,
} from "./request-auth.js";
import { resolveStudioRelativeUrl } from "./url-resolution.js";

export type StudioContentListConfig = Pick<
  MdcmsConfig,
  "project" | "environment" | "serverUrl"
>;

export type StudioContentListApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioContentListQuery = {
  type?: string;
  q?: string;
  draft?: boolean;
  published?: boolean;
  hasUnpublishedChanges?: boolean;
  isDeleted?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type StudioContentListApi = {
  list: (
    query?: StudioContentListQuery,
  ) => Promise<ApiPaginatedEnvelope<ContentDocumentResponse>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createStudioContentListApi(
  config: StudioContentListConfig,
  options: StudioContentListApiOptions = {},
): StudioContentListApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    async list(query = {}) {
      const url = resolveStudioRelativeUrl("/api/v1/content", config.serverUrl);

      if (query.type) url.searchParams.set("type", query.type);
      const trimmedQ = query.q?.trim();
      if (trimmedQ) url.searchParams.set("q", trimmedQ);
      if (query.draft !== undefined)
        url.searchParams.set("draft", String(query.draft));
      if (query.published !== undefined)
        url.searchParams.set("published", String(query.published));
      if (query.hasUnpublishedChanges !== undefined)
        url.searchParams.set(
          "hasUnpublishedChanges",
          String(query.hasUnpublishedChanges),
        );
      if (query.isDeleted !== undefined)
        url.searchParams.set("isDeleted", String(query.isDeleted));
      if (query.sort) url.searchParams.set("sort", query.sort);
      if (query.order) url.searchParams.set("order", query.order);
      if (query.limit !== undefined)
        url.searchParams.set("limit", String(query.limit));
      if (query.offset !== undefined)
        url.searchParams.set("offset", String(query.offset));

      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "GET",
          headers: {
            "x-mdcms-project": config.project,
            "x-mdcms-environment": config.environment,
          },
        }),
      );

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const parsed = isRecord(payload) ? payload : {};
        const code =
          typeof parsed.code === "string" && parsed.code.trim().length > 0
            ? parsed.code
            : "CONTENT_LIST_REQUEST_FAILED";
        const message =
          typeof parsed.message === "string" && parsed.message.trim().length > 0
            ? parsed.message
            : "Content list request failed.";

        throw new RuntimeError({
          code,
          message,
          statusCode: response.status,
          details: { status: response.status, payload },
        });
      }

      if (
        !isRecord(payload) ||
        !Array.isArray(payload.data) ||
        !isRecord(payload.pagination)
      ) {
        return {
          data: [],
          pagination: { total: 0, limit: 1, offset: 0, hasMore: false },
        };
      }

      const pagination = payload.pagination;

      return {
        data: payload.data as ContentDocumentResponse[],
        pagination: {
          total: isFiniteNumber(pagination.total) ? pagination.total : 0,
          limit: isFiniteNumber(pagination.limit) ? pagination.limit : 1,
          offset: isFiniteNumber(pagination.offset) ? pagination.offset : 0,
          hasMore: isBoolean(pagination.hasMore) ? pagination.hasMore : false,
        },
      };
    },
  };
}
