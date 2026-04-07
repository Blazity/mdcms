"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ContentDocumentResponse,
  PaginationMetadata,
} from "@mdcms/shared";
import { RuntimeError } from "@mdcms/shared";

import {
  createStudioContentListApi,
  type StudioContentListQuery,
} from "../../content-list-api.js";
import { extractDocumentTitle } from "./use-content-type-list.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";

export type MappedTrashDocument = {
  documentId: string;
  title: string;
  path: string;
  locale: string;
  type: string;
  deletedAt: string;
  deletedBy: string;
};

export type TrashListFilters = {
  q?: string;
  type?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export type TrashListStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "forbidden";

export const TRASH_PAGE_SIZE = 20;

export function mapTrashDocument(
  doc: ContentDocumentResponse,
): MappedTrashDocument {
  return {
    documentId: doc.documentId,
    title: extractDocumentTitle(doc.frontmatter, doc.path),
    path: doc.path,
    locale: doc.locale,
    type: doc.type,
    deletedAt: doc.updatedAt,
    deletedBy: doc.createdBy,
  };
}

type TrashFilterQuery = Omit<
  StudioContentListQuery,
  | "isDeleted"
  | "limit"
  | "offset"
  | "draft"
  | "published"
  | "hasUnpublishedChanges"
>;

export function mapTrashFiltersToQuery(
  filters: TrashListFilters,
): TrashFilterQuery {
  const query: TrashFilterQuery = {};

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.q) {
    query.q = filters.q;
  }

  switch (filters.sort) {
    case "updated":
      query.sort = "updatedAt";
      query.order = "desc";
      break;
    case "created":
      query.sort = "createdAt";
      query.order = "desc";
      break;
    case "path-asc":
      query.sort = "path";
      query.order = "asc";
      break;
    case "path-desc":
      query.sort = "path";
      query.order = "desc";
      break;
  }

  return query;
}

function hasActiveFilters(filters: TrashListFilters): boolean {
  return Boolean(filters.q || filters.type);
}

export function useTrashList() {
  const mountInfo = useStudioMountInfo();
  const [filters, setFiltersState] = useState<TrashListFilters>({});
  const [offset, setOffset] = useState(0);

  const api = useMemo(() => {
    if (!mountInfo.project || !mountInfo.environment || !mountInfo.apiBaseUrl) {
      return null;
    }
    return createStudioContentListApi(
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

  const queryParams = useMemo(() => mapTrashFiltersToQuery(filters), [filters]);

  const query = useQuery({
    queryKey: ["trash-list", queryParams, offset],
    queryFn: async () => {
      const result = await api!.list({
        ...queryParams,
        isDeleted: true,
        draft: true,
        limit: TRASH_PAGE_SIZE,
        offset,
      });
      return result;
    },
    enabled: api !== null,
  });

  const documents = useMemo(
    () => (query.data?.data ?? []).map(mapTrashDocument),
    [query.data?.data],
  );

  const pagination: PaginationMetadata | null = query.data?.pagination ?? null;

  const status: TrashListStatus = useMemo(() => {
    if (query.isLoading) return "loading";
    if (query.error) {
      if (
        query.error instanceof RuntimeError &&
        (query.error.statusCode === 401 || query.error.statusCode === 403)
      ) {
        return "forbidden";
      }
      return "error";
    }
    if (documents.length === 0 && !hasActiveFilters(filters)) return "empty";
    return "ready";
  }, [query.isLoading, query.error, documents.length, filters]);

  const errorMessage = useMemo(() => {
    if (!query.error) return undefined;
    return query.error instanceof Error
      ? query.error.message
      : "Failed to load trash list.";
  }, [query.error]);

  const setFilters = useCallback((next: Partial<TrashListFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
    setOffset(0);
  }, []);

  const setPage = useCallback((nextOffset: number) => {
    setOffset(nextOffset);
  }, []);

  const refresh = useCallback(() => {
    query.refetch();
  }, [query.refetch]);

  return {
    status,
    documents,
    pagination,
    filters,
    errorMessage,
    setFilters,
    setPage,
    refresh,
  };
}
