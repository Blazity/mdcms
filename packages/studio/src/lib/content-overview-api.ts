import {
  RuntimeError,
  type ContentOverviewCountsResponse,
} from "@mdcms/shared";

import type { MdcmsConfig } from "./studio-component.js";
import {
  applyStudioAuthToRequestInit,
  type StudioRuntimeAuth,
} from "./request-auth.js";
import { resolveStudioRelativeUrl } from "./url-resolution.js";

export type StudioContentOverviewConfig = Pick<
  MdcmsConfig,
  "project" | "environment" | "serverUrl"
>;

export type StudioContentOverviewApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioContentOverviewApi = {
  get: (input: { types: string[] }) => Promise<ContentOverviewCountsResponse[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createStudioContentOverviewApi(
  config: StudioContentOverviewConfig,
  options: StudioContentOverviewApiOptions = {},
): StudioContentOverviewApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    async get(input) {
      if (input.types.length === 0) {
        return [];
      }

      const url = resolveStudioRelativeUrl(
        "/api/v1/content/overview",
        config.serverUrl,
      );

      for (const type of input.types) {
        url.searchParams.append("type", type);
      }

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
            : "CONTENT_OVERVIEW_REQUEST_FAILED";
        const message =
          typeof parsed.message === "string" && parsed.message.trim().length > 0
            ? parsed.message
            : "Content overview request failed.";

        throw new RuntimeError({
          code,
          message,
          statusCode: response.status,
          details: { status: response.status, payload },
        });
      }

      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        return input.types.map((type) => ({
          type,
          total: 0,
          published: 0,
          drafts: 0,
        }));
      }

      const countsByType = new Map<string, ContentOverviewCountsResponse>();

      for (const row of payload.data) {
        if (!isRecord(row) || !isNonEmptyString(row.type)) {
          continue;
        }

        countsByType.set(row.type, {
          type: row.type,
          total: isFiniteNumber(row.total) ? row.total : 0,
          published: isFiniteNumber(row.published) ? row.published : 0,
          drafts: isFiniteNumber(row.drafts) ? row.drafts : 0,
        });
      }

      return input.types.map((type) => {
        const counts = countsByType.get(type);

        return (
          counts ?? {
            type,
            total: 0,
            published: 0,
            drafts: 0,
          }
        );
      });
    },
  };
}
