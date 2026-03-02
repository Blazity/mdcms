import { treaty } from "@elysiajs/eden";
import {
  RuntimeError,
  assertActionCatalogItem,
  assertActionCatalogList,
  type ActionCatalogItem,
} from "@mdcms/shared";
import type { ActionCatalogContractApp } from "@mdcms/server";

export type ActionCatalogHeaders = Record<string, string>;

export type ActionCatalogRequestOptions = {
  headers?: ActionCatalogHeaders;
  signal?: AbortSignal;
};

export type StudioActionCatalogAdapterOptions = {
  headers?: ActionCatalogHeaders;
  fetcher?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
};

export type StudioActionCatalogAdapter = {
  list: (options?: ActionCatalogRequestOptions) => Promise<ActionCatalogItem[]>;
  getById: (
    id: string,
    options?: ActionCatalogRequestOptions,
  ) => Promise<ActionCatalogItem>;
};

function mergeHeaders(
  defaultHeaders?: ActionCatalogHeaders,
  requestHeaders?: ActionCatalogHeaders,
): ActionCatalogHeaders | undefined {
  if (!defaultHeaders && !requestHeaders) {
    return undefined;
  }

  return {
    ...(defaultHeaders ?? {}),
    ...(requestHeaders ?? {}),
  };
}

function toAdapterError(
  action: "list" | "get",
  status: number,
  error: unknown,
): RuntimeError {
  return new RuntimeError({
    code: "ACTION_CATALOG_REQUEST_FAILED",
    message: `Studio action catalog ${action} request failed.`,
    statusCode: status,
    details: {
      status,
      error,
    },
  });
}

/**
 * createStudioActionCatalogAdapter resolves `/api/v1/actions` contract data
 * through Eden/Treaty with shared runtime schema validation.
 */
export function createStudioActionCatalogAdapter(
  baseUrl: string,
  options: StudioActionCatalogAdapterOptions = {},
): StudioActionCatalogAdapter {
  const client = treaty<ActionCatalogContractApp>(baseUrl, {
    fetcher: options.fetcher,
  });

  return {
    async list(requestOptions = {}) {
      const response = await client.api.v1.actions.get({
        headers: mergeHeaders(options.headers, requestOptions.headers),
        fetch: {
          signal: requestOptions.signal,
        },
      });

      if (response.error) {
        throw toAdapterError("list", response.status, response.error);
      }

      assertActionCatalogList(response.data, "response.data");
      return response.data;
    },
    async getById(id, requestOptions = {}) {
      const response = await client.api.v1.actions({ id }).get({
        headers: mergeHeaders(options.headers, requestOptions.headers),
        fetch: {
          signal: requestOptions.signal,
        },
      });

      if (response.error) {
        throw toAdapterError("get", response.status, response.error);
      }

      assertActionCatalogItem(response.data, "response.data");
      return response.data;
    },
  };
}
