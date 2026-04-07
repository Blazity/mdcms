"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createStudioDocumentRouteApi } from "../../document-route-api.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";
import { useRouter } from "../navigation.js";

export function buildCreatePayload(
  typeId: string,
  input: { path: string; locale?: string; schemaHash?: string },
) {
  return {
    type: typeId,
    path: input.path,
    locale: input.locale,
    format: "mdx" as const,
    schemaHash: input.schemaHash,
  };
}

export function useCreateDocument(typeId: string) {
  const mountInfo = useStudioMountInfo();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const api = useMemo(() => {
    if (!mountInfo.project || !mountInfo.environment || !mountInfo.apiBaseUrl) {
      return null;
    }
    return createStudioDocumentRouteApi(
      {
        project: mountInfo.project,
        environment: mountInfo.environment,
        serverUrl: mountInfo.apiBaseUrl,
      },
      { auth: mountInfo.auth },
    );
  }, [
    mountInfo.project,
    mountInfo.environment,
    mountInfo.apiBaseUrl,
    mountInfo.auth,
  ]);

  const mutation = useMutation({
    mutationFn: async (input: {
      path: string;
      locale?: string;
      schemaHash?: string;
    }) => {
      if (!api) throw new Error("API not available.");
      const payload = buildCreatePayload(typeId, input);
      return api.create(payload);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["content-list", typeId],
      });
      setIsOpen(false);
      router.push(`/admin/content/${typeId}/${data.documentId}`);
    },
  });

  const { reset } = mutation;
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  return {
    isOpen,
    isSubmitting: mutation.isPending,
    error: mutation.error?.message,
    open,
    close,
    submit: mutation.mutateAsync,
  };
}
