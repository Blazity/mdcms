"use client";

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RuntimeError } from "@mdcms/shared";

import {
  createStudioApiKeysApi,
  type ApiKeyCreateInput,
  type ApiKeyCreateResult,
  type ApiKeyMetadata,
} from "../../api-keys-api.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";
import { useStudioSession } from "../app/admin/session-context.js";

export type ApiKeyListStatus = "loading" | "ready" | "empty" | "error";

export function useApiKeyList() {
  const mountInfo = useStudioMountInfo();
  const session = useStudioSession();
  const queryClient = useQueryClient();

  const api = useMemo(() => {
    if (!mountInfo.apiBaseUrl) {
      return null;
    }
    return createStudioApiKeysApi(
      { serverUrl: mountInfo.apiBaseUrl },
      { auth: mountInfo.auth },
    );
  }, [mountInfo.apiBaseUrl, mountInfo.auth]);

  const csrfToken =
    session.status === "authenticated" ? session.csrfToken : null;

  const query = useQuery({
    queryKey: ["api-keys", mountInfo.apiBaseUrl],
    queryFn: async () => {
      return api!.list();
    },
    enabled: api !== null,
  });

  const keys: ApiKeyMetadata[] = query.data ?? [];

  const status: ApiKeyListStatus = useMemo(() => {
    if (query.isLoading) return "loading";
    if (query.error) return "error";
    if (keys.length === 0) return "empty";
    return "ready";
  }, [query.isLoading, query.error, keys.length]);

  const errorMessage = useMemo(() => {
    if (!query.error) return undefined;
    return query.error instanceof Error
      ? query.error.message
      : "Failed to load API keys.";
  }, [query.error]);

  const refresh = useCallback(() => {
    query.refetch();
  }, [query.refetch]);

  const createMutation = useMutation({
    mutationFn: async (
      input: ApiKeyCreateInput,
    ): Promise<ApiKeyCreateResult> => {
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
      return api.create(input, csrfToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["api-keys", mountInfo.apiBaseUrl],
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string): Promise<ApiKeyMetadata> => {
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
      return api.revoke(keyId, csrfToken);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["api-keys", mountInfo.apiBaseUrl],
      });
    },
  });

  const createKey = useCallback(
    (input: ApiKeyCreateInput) => createMutation.mutateAsync(input),
    [createMutation.mutateAsync],
  );

  const revokeKey = useCallback(
    (keyId: string) => revokeMutation.mutateAsync(keyId),
    [revokeMutation.mutateAsync],
  );

  return {
    status,
    keys,
    errorMessage,
    refresh,
    createKey,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    revokeKey,
    isRevoking: revokeMutation.isPending,
    revokeError: revokeMutation.error,
  };
}
