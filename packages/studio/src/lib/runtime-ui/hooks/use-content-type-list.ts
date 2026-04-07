"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ContentDocumentResponse,
  ContentUserSummary,
  PaginationMetadata,
} from "@mdcms/shared";
import { RuntimeError } from "@mdcms/shared";

import {
  createStudioContentListApi,
  type StudioContentListQuery,
} from "../../content-list-api.js";
import { useStudioMountInfo } from "../app/admin/mount-info-context.js";

export type DocumentStatus = "published" | "draft" | "changed";

export type MappedContentDocument = {
  documentId: string;
  title: string;
  path: string;
  locale: string;
  status: DocumentStatus;
  updatedAt: string;
  createdBy: string;
};

export type ContentTypeListFilters = {
  q?: string;
  status?: "all" | "published" | "draft" | "changed";
  sort?: string;
};

export type ContentTypeListStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "forbidden";

export const PAGE_SIZE = 20;

export function deriveDocumentStatus(
  publishedVersion: number | null,
  hasUnpublishedChanges: boolean,
): DocumentStatus {
  if (publishedVersion === null) return "draft";
  if (hasUnpublishedChanges) return "changed";
  return "published";
}

export function extractDocumentTitle(
  frontmatter: Record<string, unknown>,
  path: string,
): string {
  const title = frontmatter.title;
  if (typeof title === "string" && title.trim().length > 0) {
    return title;
  }
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

export function mapContentDocument(
  doc: ContentDocumentResponse,
): MappedContentDocument {
  return {
    documentId: doc.documentId,
    title: extractDocumentTitle(doc.frontmatter, doc.path),
    path: doc.path,
    locale: doc.locale,
    status: deriveDocumentStatus(
      doc.publishedVersion,
      doc.hasUnpublishedChanges,
    ),
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
  };
}

type ContentListFilterQuery = Omit<
  StudioContentListQuery,
  "type" | "limit" | "offset" | "isDeleted" | "draft"
>;

export function mapFiltersToQuery(
  filters: ContentTypeListFilters,
): ContentListFilterQuery {
  const query: ContentListFilterQuery = {};

  if (filters.q) {
    query.q = filters.q;
  }

  switch (filters.status) {
    case "published":
      query.published = true;
      query.hasUnpublishedChanges = false;
      break;
    case "draft":
      query.published = false;
      break;
    case "changed":
      query.published = true;
      query.hasUnpublishedChanges = true;
      break;
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

function hasActiveFilters(filters: ContentTypeListFilters): boolean {
  return Boolean(filters.q || (filters.status && filters.status !== "all"));
}

export function useContentTypeList(typeId: string) {
  const mountInfo = useStudioMountInfo();
  const [filters, setFiltersState] = useState<ContentTypeListFilters>({});
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

  const queryParams = useMemo(() => mapFiltersToQuery(filters), [filters]);

  const query = useQuery({
    queryKey: ["content-list", typeId, queryParams, offset],
    queryFn: async () => {
      const result = await api!.list({
        type: typeId,
        ...queryParams,
        isDeleted: false,
        limit: PAGE_SIZE,
        offset,
      });
      return result;
    },
    enabled: api !== null,
  });

  const documents = useMemo(
    () => (query.data?.data ?? []).map(mapContentDocument),
    [query.data?.data],
  );

  const pagination: PaginationMetadata | null = query.data?.pagination ?? null;
  const users: Record<string, ContentUserSummary> = query.data?.users ?? {};

  const status: ContentTypeListStatus = useMemo(() => {
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
      : "Failed to load content list.";
  }, [query.error]);

  const setFilters = useCallback((next: Partial<ContentTypeListFilters>) => {
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
    users,
    filters,
    errorMessage,
    setFilters,
    setPage,
    refresh,
  };
}
