"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "../../../../adapters/next-navigation.js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
  Send,
  FileText,
  AlertCircle,
  ShieldAlert,
  ArrowUpFromLine,
} from "lucide-react";
import { Button } from "../../../../components/ui/button.js";
import { Input } from "../../../../components/ui/input.js";
import { Badge } from "../../../../components/ui/badge.js";
import { Avatar, AvatarFallback } from "../../../../components/ui/avatar.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../../../components/ui/pagination.js";
import { PageHeader } from "../../../../components/layout/page-header.js";
import { Skeleton } from "../../../../components/ui/skeleton.js";

import { useAdminCapabilities } from "../../capabilities-context.js";
import { useStudioMountInfo } from "../../mount-info-context.js";
import {
  getContentTypeListQueryKey,
  useContentTypeList,
  PAGE_SIZE,
  type ContentTypeTranslationCoverageStatus,
  type MappedContentDocument,
  type ContentTypeListFilters,
} from "../../../../hooks/use-content-type-list.js";
import { useCreateDocument } from "../../../../hooks/use-create-document.js";
import { CreateDocumentDialog } from "../../../../components/create-document-dialog.js";
import { createStudioSchemaRouteApi } from "../../../../../schema-route-api.js";
import { createStudioDocumentRouteApi } from "../../../../../document-route-api.js";
import { useToast } from "../../../../components/toast.js";
import {
  formatContentTranslationCoverageLabel,
  getContentTranslationCoverageQueryKey,
  type ContentTranslationCoverage,
} from "../../../../lib/content-translation-coverage.js";

const statusConfig = {
  published: {
    label: "Published",
    className: "bg-success/10 text-success",
  },
  draft: {
    label: "Draft",
    className: "bg-warning/10 text-warning",
  },
  changed: {
    label: "Changed",
    className: "bg-warning/10 text-warning",
  },
};

type TranslationCoverageSummaryProps = {
  status: ContentTypeTranslationCoverageStatus;
  coverage?: ContentTranslationCoverage;
};

type ContentTypeTableColumn = {
  key: "title" | "translations" | "status" | "updated" | "author" | "actions";
  label: string;
  className?: string;
};

export function getContentTypeTableColumns(
  showTranslationCoverage: boolean,
): ContentTypeTableColumn[] {
  return [
    { key: "title", label: "Title / Path" },
    ...(showTranslationCoverage
      ? ([
          {
            key: "translations",
            label: "Translations",
            className: "w-40",
          },
        ] satisfies ContentTypeTableColumn[])
      : []),
    { key: "status", label: "Status", className: "w-28" },
    { key: "updated", label: "Updated", className: "w-32" },
    { key: "author", label: "Author", className: "w-28" },
    { key: "actions", label: "", className: "w-14" },
  ];
}

export function TranslationCoverageSummary({
  status,
  coverage,
}: TranslationCoverageSummaryProps) {
  if (status === "idle") {
    return null;
  }

  if (status === "loading") {
    return (
      <p
        data-mdcms-translation-coverage-state="loading"
        className="text-xs text-foreground-muted"
      >
        Loading locale coverage...
      </p>
    );
  }

  if (status === "error" || !coverage) {
    return (
      <p
        data-mdcms-translation-coverage-state="error"
        className="text-xs text-destructive"
      >
        Translation status unavailable.
      </p>
    );
  }

  return (
    <p
      data-mdcms-translation-coverage-state="ready"
      className="text-xs text-foreground-muted"
    >
      {formatContentTranslationCoverageLabel(coverage)}
    </p>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deriveAuthorInitials(email: string | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export default function ContentTypePage() {
  const params = useParams();
  const router = useRouter();
  const typeId = params.type as string;
  const mountInfo = useStudioMountInfo();
  const capabilities = useAdminCapabilities();
  const queryClient = useQueryClient();

  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [showLoading, setShowLoading] = useState(false);

  // Schema query for type metadata (localized, locales, directory)
  const schemaApi = useMemo(() => {
    if (!mountInfo.project || !mountInfo.environment || !mountInfo.apiBaseUrl)
      return null;
    return createStudioSchemaRouteApi(
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

  const schemaQuery = useQuery({
    queryKey: ["schema-list", mountInfo.project, mountInfo.environment],
    queryFn: () => schemaApi!.list(),
    enabled: schemaApi !== null,
    staleTime: 60_000,
  });

  const schemaEntry = useMemo(() => {
    return schemaQuery.data?.find(
      (entry) => entry.type.toLowerCase() === typeId.toLowerCase(),
    );
  }, [schemaQuery.data, typeId]);

  const typeName = schemaEntry?.type ?? typeId;
  const enableTranslationCoverage = schemaEntry?.localized === true;
  const list = useContentTypeList(typeId, {
    enableTranslationCoverage,
  });
  const create = useCreateDocument(typeId);

  // Debounce loading skeleton by 200ms
  useEffect(() => {
    if (list.status !== "loading") {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => setShowLoading(true), 200);
    return () => clearTimeout(timer);
  }, [list.status]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      list.setFilters({ q: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, list.setFilters]);

  // Document route API for row actions
  const documentApi = useMemo(() => {
    if (!mountInfo.project || !mountInfo.environment || !mountInfo.apiBaseUrl)
      return null;
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

  const onRowActionError = (error: Error) => {
    setRowActionError(error.message || "Action failed.");
  };

  const publishMutation = useMutation({
    mutationFn: (documentId: string) => {
      if (!documentApi) throw new Error("Document API not available.");
      setRowActionError(null);
      return documentApi.publish({ documentId });
    },
    onSuccess: () => {
      invalidateContentListQueries();
    },
    onError: onRowActionError,
  });

  const unpublishMutation = useMutation({
    mutationFn: (documentId: string) => {
      if (!documentApi) throw new Error("Document API not available.");
      setRowActionError(null);
      return documentApi.unpublish({ documentId });
    },
    onSuccess: () => {
      invalidateContentListQueries();
    },
    onError: onRowActionError,
  });

  const duplicateMutation = useMutation({
    mutationFn: (documentId: string) => {
      if (!documentApi) throw new Error("Document API not available.");
      setRowActionError(null);
      return documentApi.duplicate({ documentId });
    },
    onSuccess: (data) => {
      invalidateContentListQueries();
      router.push(`/admin/content/${typeId}/${data.documentId}`);
    },
    onError: onRowActionError,
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => {
      if (!documentApi) throw new Error("Document API not available.");
      setRowActionError(null);
      return documentApi.softDelete({ documentId });
    },
    onSuccess: () => {
      invalidateContentListQueries();
      toast.success(
        "Document moved to trash. It can be restored from the Trash page.",
      );
    },
    onError: onRowActionError,
  });

  const isRowActionPending =
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    duplicateMutation.isPending ||
    deleteMutation.isPending;

  // Pagination
  const totalPages = list.pagination
    ? Math.ceil(list.pagination.total / PAGE_SIZE)
    : 0;
  const currentPage = list.pagination
    ? Math.floor(list.pagination.offset / PAGE_SIZE) + 1
    : 1;
  const showTranslationCoverage =
    enableTranslationCoverage && (mountInfo.supportedLocales?.length ?? 0) > 0;
  const tableColumns = useMemo(
    () => getContentTypeTableColumns(showTranslationCoverage),
    [showTranslationCoverage],
  );

  const invalidateContentListQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: getContentTypeListQueryKey(
        mountInfo.project,
        mountInfo.environment,
        typeId,
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: getContentTranslationCoverageQueryKey(
        mountInfo.project,
        mountInfo.environment,
        typeId,
      ),
    });
  };

  function renderRowActions(doc: MappedContentDocument) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              router.push(`/admin/content/${typeId}/${doc.documentId}`)
            }
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {capabilities.canPublishContent &&
            (doc.status === "draft" || doc.status === "changed") && (
              <DropdownMenuItem
                disabled={isRowActionPending}
                onClick={() => publishMutation.mutate(doc.documentId)}
              >
                <Send className="mr-2 h-4 w-4" />
                Publish
              </DropdownMenuItem>
            )}
          {capabilities.canUnpublishContent && doc.status === "published" && (
            <DropdownMenuItem
              disabled={isRowActionPending}
              onClick={() => unpublishMutation.mutate(doc.documentId)}
            >
              <ArrowUpFromLine className="mr-2 h-4 w-4" />
              Unpublish
            </DropdownMenuItem>
          )}
          {capabilities.canCreateContent && (
            <DropdownMenuItem
              disabled={isRowActionPending}
              onClick={() => duplicateMutation.mutate(doc.documentId)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
          )}
          {capabilities.canDeleteContent && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isRowActionPending}
                className="text-destructive focus:text-destructive"
                onClick={() => deleteMutation.mutate(doc.documentId)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: typeName },
        ]}
      />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{typeName}</h1>
          {capabilities.canCreateContent && schemaEntry && (
            <Button
              onClick={create.open}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Document
            </Button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                placeholder="Search documents..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 w-72"
              />
            </div>
            <Select
              value={list.filters.status ?? "all"}
              onValueChange={(value) =>
                list.setFilters({
                  status: value as ContentTypeListFilters["status"],
                })
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft only</SelectItem>
                <SelectItem value="changed">Has changes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select
            value={list.filters.sort ?? "updated"}
            onValueChange={(value) => list.setFilters({ sort: value })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Last updated</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="path-asc">Path A-Z</SelectItem>
              <SelectItem value="path-desc">Path Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Row action error banner */}
        {rowActionError && (
          <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{rowActionError}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRowActionError(null)}
              className="text-destructive hover:text-destructive"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Content area */}
        {list.status === "loading" && showLoading && (
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3 flex gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {list.status === "forbidden" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="mb-4 h-8 w-8 text-foreground-muted" />
            <h3 className="mb-2 text-lg font-semibold">Access denied</h3>
            <p className="text-sm text-foreground-muted">
              You do not have permission to view content for this target.
            </p>
          </div>
        )}

        {list.status === "error" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="mb-4 h-8 w-8 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">
              Failed to load documents
            </h3>
            <p className="mb-4 text-sm text-foreground-muted">
              {list.errorMessage}
            </p>
            <Button variant="ghost" onClick={list.refresh}>
              Try again
            </Button>
          </div>
        )}

        {list.status === "empty" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-background-subtle p-4">
              <FileText className="h-8 w-8 text-foreground-muted" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
            <p className="mb-4 text-sm text-foreground-muted">
              Create your first {typeName} document to get started.
            </p>
            {capabilities.canCreateContent && schemaEntry && (
              <Button
                onClick={create.open}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Document
              </Button>
            )}
          </div>
        )}

        {list.status === "ready" && (
          <>
            {list.documents.length > 0 ? (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableColumns.map((column) => (
                        <TableHead
                          key={column.key}
                          className={column.className}
                        >
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.documents.map((doc) => (
                      <TableRow
                        key={doc.documentId}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/admin/content/${typeId}/${doc.documentId}`,
                          )
                        }
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-xs text-foreground-muted font-mono">
                              {doc.path}
                            </p>
                          </div>
                        </TableCell>
                        {showTranslationCoverage ? (
                          <TableCell>
                            <TranslationCoverageSummary
                              status={list.translationCoverageStatus}
                              coverage={
                                list.translationCoverageByGroup[
                                  doc.translationGroupId
                                ]
                              }
                            />
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <Badge
                            variant="tag"
                            className={statusConfig[doc.status].className}
                          >
                            {statusConfig[doc.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-foreground-muted">
                          {formatRelativeTime(doc.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {deriveAuthorInitials(
                                  list.users[doc.createdBy]?.email,
                                )}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {renderRowActions(doc)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 rounded-full bg-background-subtle p-4">
                  <Search className="h-8 w-8 text-foreground-muted" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">No results</h3>
                <p className="text-sm text-foreground-muted">
                  No documents match your current filters.
                </p>
              </div>
            )}

            {totalPages > 1 && list.pagination && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground-muted">
                  Showing {list.pagination.offset + 1}–
                  {Math.min(
                    list.pagination.offset + PAGE_SIZE,
                    list.pagination.total,
                  )}{" "}
                  of {list.pagination.total} documents
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() =>
                          list.setPage(
                            Math.max(0, list.pagination!.offset - PAGE_SIZE),
                          )
                        }
                        className={
                          currentPage === 1
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }).map(
                      (_, i) => {
                        const page = i + 1;
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() =>
                                list.setPage((page - 1) * PAGE_SIZE)
                              }
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      },
                    )}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          list.setPage(list.pagination!.offset + PAGE_SIZE)
                        }
                        className={
                          currentPage === totalPages
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create document dialog */}
      <CreateDocumentDialog
        isOpen={create.isOpen}
        isSubmitting={create.isSubmitting}
        error={create.error}
        typeDirectory={schemaEntry?.directory ?? typeId}
        localized={schemaEntry?.localized ?? false}
        locales={mountInfo.supportedLocales}
        onClose={create.close}
        onSubmit={(input) => {
          create.submit({
            ...input,
            schemaHash: schemaEntry?.schemaHash,
          });
        }}
      />
    </div>
  );
}
