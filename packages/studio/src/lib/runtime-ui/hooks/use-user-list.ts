"use client";

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RuntimeError } from "@mdcms/shared";

import {
  createStudioUsersApi,
  type InviteUserInput,
  type InviteResult,
  type PendingInvite,
  type UserWithGrants,
} from "../../users-api.js";
import { applyStudioAuthToRequestInit } from "../../request-auth.js";
import { resolveStudioRelativeUrl } from "../../url-resolution.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";
import { useStudioSession } from "../app/admin/session-context.js";

export type UserListStatus = "loading" | "ready" | "empty" | "error";

export function useUserList() {
  const mountInfo = useStudioMountInfo();
  const session = useStudioSession();
  const queryClient = useQueryClient();

  const api = useMemo(() => {
    if (!mountInfo.apiBaseUrl) {
      return null;
    }
    return createStudioUsersApi(
      { serverUrl: mountInfo.apiBaseUrl },
      { auth: mountInfo.auth },
    );
  }, [mountInfo.apiBaseUrl, mountInfo.auth]);

  const csrfToken =
    session.status === "authenticated" ? session.csrfToken : null;

  const query = useQuery({
    queryKey: ["users", mountInfo.apiBaseUrl],
    queryFn: async () => {
      return api!.list();
    },
    enabled: api !== null,
  });

  const users: UserWithGrants[] = query.data ?? [];

  const invitesQuery = useQuery({
    queryKey: ["invites", mountInfo.apiBaseUrl],
    queryFn: async () => {
      return api!.listInvites();
    },
    enabled: api !== null,
  });

  const pendingInvites: PendingInvite[] = invitesQuery.data ?? [];

  const status: UserListStatus = useMemo(() => {
    if (query.isLoading) return "loading";
    if (query.error) return "error";
    if (users.length === 0) return "empty";
    return "ready";
  }, [query.isLoading, query.error, users.length]);

  const errorMessage = useMemo(() => {
    if (!query.error) return undefined;
    return query.error instanceof Error
      ? query.error.message
      : "Failed to load users.";
  }, [query.error]);

  const refresh = useCallback(() => {
    query.refetch();
  }, [query.refetch]);

  const inviteMutation = useMutation({
    mutationFn: async (input: InviteUserInput): Promise<InviteResult> => {
      if (!api) {
        throw new RuntimeError({
          code: "API_NOT_AVAILABLE",
          message: "API client is not available.",
          statusCode: 0,
        });
      }
      if (!csrfToken) {
        throw new RuntimeError({
          code: "CSRF_TOKEN_MISSING",
          message: "CSRF token is not available. You must be authenticated.",
          statusCode: 0,
        });
      }
      return api.invite(input, csrfToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["users", mountInfo.apiBaseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["invites", mountInfo.apiBaseUrl],
      });
    },
  });

  const updateGrantsMutation = useMutation({
    mutationFn: async ({
      userId,
      grants,
    }: {
      userId: string;
      grants: InviteUserInput["grants"];
    }): Promise<UserWithGrants> => {
      if (!api) {
        throw new RuntimeError({
          code: "API_NOT_AVAILABLE",
          message: "API client is not available.",
          statusCode: 0,
        });
      }
      if (!csrfToken) {
        throw new RuntimeError({
          code: "CSRF_TOKEN_MISSING",
          message: "CSRF token is not available. You must be authenticated.",
          statusCode: 0,
        });
      }
      return api.updateGrants(userId, grants, csrfToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["users", mountInfo.apiBaseUrl],
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string): Promise<{ removed: true }> => {
      if (!api) {
        throw new RuntimeError({
          code: "API_NOT_AVAILABLE",
          message: "API client is not available.",
          statusCode: 0,
        });
      }
      if (!csrfToken) {
        throw new RuntimeError({
          code: "CSRF_TOKEN_MISSING",
          message: "CSRF token is not available. You must be authenticated.",
          statusCode: 0,
        });
      }
      return api.remove(userId, csrfToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["users", mountInfo.apiBaseUrl],
      });
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async (userId: string): Promise<unknown> => {
      if (!mountInfo.apiBaseUrl) {
        throw new RuntimeError({
          code: "API_NOT_AVAILABLE",
          message: "API client is not available.",
          statusCode: 0,
        });
      }
      if (!csrfToken) {
        throw new RuntimeError({
          code: "CSRF_TOKEN_MISSING",
          message: "CSRF token is not available. You must be authenticated.",
          statusCode: 0,
        });
      }

      const url = resolveStudioRelativeUrl(
        `/api/v1/auth/users/${encodeURIComponent(userId)}/sessions/revoke-all`,
        mountInfo.apiBaseUrl,
      );

      const response = await fetch(
        url,
        applyStudioAuthToRequestInit(mountInfo.auth, {
          method: "POST",
          headers: {
            "x-mdcms-csrf-token": csrfToken,
          },
        }),
      );

      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }

        const parsed =
          typeof payload === "object" && payload !== null
            ? (payload as Record<string, unknown>)
            : {};
        const code =
          typeof parsed.code === "string" && parsed.code.trim().length > 0
            ? parsed.code
            : "REVOKE_SESSIONS_FAILED";
        const message =
          typeof parsed.message === "string" && parsed.message.trim().length > 0
            ? parsed.message
            : "Failed to revoke user sessions.";

        throw new RuntimeError({
          code,
          message,
          statusCode: response.status,
        });
      }

      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["users", mountInfo.apiBaseUrl],
      });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string): Promise<{ revoked: true }> => {
      if (!api) {
        throw new RuntimeError({
          code: "API_NOT_AVAILABLE",
          message: "API client is not available.",
          statusCode: 0,
        });
      }
      if (!csrfToken) {
        throw new RuntimeError({
          code: "CSRF_TOKEN_MISSING",
          message: "CSRF token is not available. You must be authenticated.",
          statusCode: 0,
        });
      }
      return api.revokeInvite(inviteId, csrfToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["invites", mountInfo.apiBaseUrl],
      });
    },
  });

  const inviteUser = useCallback(
    (input: InviteUserInput) => inviteMutation.mutateAsync(input),
    [inviteMutation.mutateAsync],
  );

  const updateGrants = useCallback(
    (userId: string, grants: InviteUserInput["grants"]) =>
      updateGrantsMutation.mutateAsync({ userId, grants }),
    [updateGrantsMutation.mutateAsync],
  );

  const removeUser = useCallback(
    (userId: string) => removeMutation.mutateAsync(userId),
    [removeMutation.mutateAsync],
  );

  const revokeSessions = useCallback(
    (userId: string) => revokeSessionsMutation.mutateAsync(userId),
    [revokeSessionsMutation.mutateAsync],
  );

  const revokeInvite = useCallback(
    (inviteId: string) => revokeInviteMutation.mutateAsync(inviteId),
    [revokeInviteMutation.mutateAsync],
  );

  return {
    status,
    users,
    pendingInvites,
    errorMessage,
    refresh,
    inviteUser,
    isInviting: inviteMutation.isPending,
    inviteError: inviteMutation.error,
    updateGrants,
    isUpdatingGrants: updateGrantsMutation.isPending,
    updateGrantsError: updateGrantsMutation.error,
    removeUser,
    isRemoving: removeMutation.isPending,
    removeError: removeMutation.error,
    revokeSessions,
    isRevokingSessions: revokeSessionsMutation.isPending,
    revokeInvite,
    isRevokingInvite: revokeInviteMutation.isPending,
  };
}
