import { RuntimeError } from "@mdcms/shared";

import {
  applyStudioAuthToRequestInit,
  type StudioRuntimeAuth,
} from "./request-auth.js";
import { resolveStudioRelativeUrl } from "./url-resolution.js";

export type UserGrant = {
  id: string;
  role: string;
  scopeKind: string;
  project: string | null;
  environment: string | null;
  pathPrefix: string | null;
  createdAt: string;
};

export type UserWithGrants = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  grants: UserGrant[];
};

export type InviteUserInput = {
  email: string;
  grants: Array<{
    role: string;
    scopeKind: string;
    project?: string;
    environment?: string;
    pathPrefix?: string;
  }>;
};

export type InviteResult = {
  id: string;
  email: string;
  expiresAt: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  grants: Array<{
    role: string;
    scopeKind: string;
    project?: string;
    environment?: string;
    pathPrefix?: string;
  }>;
  createdAt: string;
  expiresAt: string;
};

export type StudioUsersApiConfig = {
  serverUrl: string;
};

export type StudioUsersApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

export type StudioUsersApi = {
  list: () => Promise<UserWithGrants[]>;
  get: (userId: string) => Promise<UserWithGrants>;
  invite: (input: InviteUserInput, csrfToken: string) => Promise<InviteResult>;
  listInvites: () => Promise<PendingInvite[]>;
  revokeInvite: (
    inviteId: string,
    csrfToken: string,
  ) => Promise<{ revoked: true }>;
  updateGrants: (
    userId: string,
    grants: InviteUserInput["grants"],
    csrfToken: string,
  ) => Promise<UserWithGrants>;
  remove: (userId: string, csrfToken: string) => Promise<{ removed: true }>;
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

function toRouteFailureError(
  operation: string,
  response: Response,
  payload: unknown,
  fallbackMessage: string,
): RuntimeError {
  const parsed = isRecord(payload) ? payload : {};
  const code =
    typeof parsed.code === "string" && parsed.code.trim().length > 0
      ? parsed.code
      : "USERS_REQUEST_FAILED";
  const message =
    typeof parsed.message === "string" && parsed.message.trim().length > 0
      ? parsed.message
      : fallbackMessage;

  return new RuntimeError({
    code,
    message,
    statusCode: response.status,
    details: { operation, status: response.status, payload },
  });
}

function toInvalidResponseError(
  operation: string,
  payload: unknown,
): RuntimeError {
  return new RuntimeError({
    code: "USERS_RESPONSE_INVALID",
    message: "Users response is invalid.",
    statusCode: 500,
    details: { operation, payload },
  });
}

function isGrantArray(value: unknown): value is UserGrant[] {
  return (
    Array.isArray(value) &&
    value.every(
      (g) =>
        isRecord(g) &&
        typeof g.role === "string" &&
        typeof g.scopeKind === "string",
    )
  );
}

function isUserWithGrants(value: unknown): value is UserWithGrants {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    typeof value.createdAt === "string" &&
    isGrantArray(value.grants)
  );
}

function isPendingInvite(value: unknown): value is PendingInvite {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.expiresAt === "string" &&
    isGrantArray(value.grants)
  );
}

export function createStudioUsersApi(
  config: StudioUsersApiConfig,
  options: StudioUsersApiOptions = {},
): StudioUsersApi {
  const fetcher = options.fetcher ?? fetch;

  return {
    async list() {
      const url = resolveStudioRelativeUrl(
        "/api/v1/auth/users",
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, { method: "GET" }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          "GET /api/v1/auth/users",
          response,
          payload,
          "Users list request failed.",
        );
      }

      if (
        !isRecord(payload) ||
        !Array.isArray(payload.data) ||
        !payload.data.every(isUserWithGrants)
      ) {
        throw toInvalidResponseError("GET /api/v1/auth/users", payload);
      }

      return payload.data;
    },

    async get(userId: string): Promise<UserWithGrants> {
      const url = resolveStudioRelativeUrl(
        `/api/v1/auth/users/${encodeURIComponent(userId)}`,
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, { method: "GET" }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          `GET /api/v1/auth/users/${userId}`,
          response,
          payload,
          "User get request failed.",
        );
      }

      if (!isRecord(payload) || !isUserWithGrants(payload.data)) {
        throw toInvalidResponseError(
          `GET /api/v1/auth/users/${userId}`,
          payload,
        );
      }

      return payload.data;
    },

    async invite(
      input: InviteUserInput,
      csrfToken: string,
    ): Promise<InviteResult> {
      const url = resolveStudioRelativeUrl(
        "/api/v1/auth/users/invite",
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-mdcms-csrf-token": csrfToken,
          },
          body: JSON.stringify(input),
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          "POST /api/v1/auth/users/invite",
          response,
          payload,
          "User invite request failed.",
        );
      }

      if (
        !isRecord(payload) ||
        !isRecord(payload.data) ||
        typeof (payload.data as Record<string, unknown>).id !== "string"
      ) {
        throw toInvalidResponseError("POST /api/v1/auth/users/invite", payload);
      }

      return payload.data as InviteResult;
    },

    async listInvites(): Promise<PendingInvite[]> {
      const url = resolveStudioRelativeUrl(
        "/api/v1/auth/invites",
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, { method: "GET" }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          "GET /api/v1/auth/invites",
          response,
          payload,
          "Invites list request failed.",
        );
      }

      if (
        !isRecord(payload) ||
        !Array.isArray(payload.data) ||
        !payload.data.every(isPendingInvite)
      ) {
        throw toInvalidResponseError("GET /api/v1/auth/invites", payload);
      }

      return payload.data;
    },

    async revokeInvite(
      inviteId: string,
      csrfToken: string,
    ): Promise<{ revoked: true }> {
      const url = resolveStudioRelativeUrl(
        `/api/v1/auth/invites/${encodeURIComponent(inviteId)}`,
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "DELETE",
          headers: {
            "x-mdcms-csrf-token": csrfToken,
          },
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          `DELETE /api/v1/auth/invites/${inviteId}`,
          response,
          payload,
          "Invite revoke request failed.",
        );
      }

      if (
        !isRecord(payload) ||
        !isRecord(payload.data) ||
        (payload.data as Record<string, unknown>).revoked !== true
      ) {
        throw toInvalidResponseError(
          `DELETE /api/v1/auth/invites/${inviteId}`,
          payload,
        );
      }

      return payload.data as { revoked: true };
    },

    async updateGrants(
      userId: string,
      grants: InviteUserInput["grants"],
      csrfToken: string,
    ): Promise<UserWithGrants> {
      const url = resolveStudioRelativeUrl(
        `/api/v1/auth/users/${encodeURIComponent(userId)}/grants`,
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-mdcms-csrf-token": csrfToken,
          },
          body: JSON.stringify({ grants }),
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          `PATCH /api/v1/auth/users/${userId}/grants`,
          response,
          payload,
          "User grants update request failed.",
        );
      }

      if (!isRecord(payload) || !isUserWithGrants(payload.data)) {
        throw toInvalidResponseError(
          `PATCH /api/v1/auth/users/${userId}/grants`,
          payload,
        );
      }

      return payload.data;
    },

    async remove(
      userId: string,
      csrfToken: string,
    ): Promise<{ removed: true }> {
      const url = resolveStudioRelativeUrl(
        `/api/v1/auth/users/${encodeURIComponent(userId)}`,
        config.serverUrl,
      );
      const response = await fetcher(
        url,
        applyStudioAuthToRequestInit(options.auth, {
          method: "DELETE",
          headers: {
            "x-mdcms-csrf-token": csrfToken,
          },
        }),
      );
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw toRouteFailureError(
          `DELETE /api/v1/auth/users/${userId}`,
          response,
          payload,
          "User remove request failed.",
        );
      }

      if (
        !isRecord(payload) ||
        !isRecord(payload.data) ||
        (payload.data as Record<string, unknown>).removed !== true
      ) {
        throw toInvalidResponseError(
          `DELETE /api/v1/auth/users/${userId}`,
          payload,
        );
      }

      return payload.data as { removed: true };
    },
  };
}
