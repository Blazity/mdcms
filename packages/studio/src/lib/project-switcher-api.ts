import { RuntimeError } from "@mdcms/shared";

import {
  applyStudioAuthToRequestInit,
  type StudioRuntimeAuth,
} from "./request-auth.js";

export type ProjectSwitcherSummary = {
  id: string;
  slug: string;
  name: string;
  environmentCount: number;
  createdAt: string;
};

export type StudioProjectSwitcherApiConfig = {
  serverUrl: string;
};

export type StudioProjectSwitcherApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioProjectSwitcherApi = {
  list: () => Promise<ProjectSwitcherSummary[]>;
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

export function createStudioProjectSwitcherApi(
  config: StudioProjectSwitcherApiConfig,
  options: StudioProjectSwitcherApiOptions = {},
): StudioProjectSwitcherApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    async list() {
      const url = new URL("/api/v1/me/projects", config.serverUrl);
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "GET",
          headers: {},
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const parsed = isRecord(payload) ? payload : {};
        const code =
          typeof parsed.code === "string" && parsed.code.trim().length > 0
            ? parsed.code
            : "PROJECT_SWITCHER_REQUEST_FAILED";
        const message =
          typeof parsed.message === "string" &&
          parsed.message.trim().length > 0
            ? parsed.message
            : "Project list request failed.";

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

      return payload.data as ProjectSwitcherSummary[];
    },
  };
}
