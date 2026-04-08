import { RuntimeError, type EnvironmentSummary } from "@mdcms/shared";

import {
  applyStudioAuthToRequestInit,
  type StudioRuntimeAuth,
} from "./request-auth.js";

export type StudioEnvironmentApiConfig = {
  project: string;
  environment: string;
  serverUrl: string;
};

export type StudioEnvironmentApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioEnvironmentApi = {
  list: () => Promise<EnvironmentSummary[]>;
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

export function createStudioEnvironmentApi(
  config: StudioEnvironmentApiConfig,
  options: StudioEnvironmentApiOptions = {},
): StudioEnvironmentApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    async list() {
      const url = new URL("/api/v1/environments", config.serverUrl);
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
            : "ENVIRONMENT_REQUEST_FAILED";
        const message =
          typeof parsed.message === "string" && parsed.message.trim().length > 0
            ? parsed.message
            : "Environment list request failed.";

        throw new RuntimeError({
          code,
          message,
          statusCode: response.status,
          details: { status: response.status, payload },
        });
      }

      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        return [];
      }

      return payload.data as EnvironmentSummary[];
    },
  };
}
