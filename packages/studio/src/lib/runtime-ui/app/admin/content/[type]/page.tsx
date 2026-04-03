// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "../../../../adapters/next-link";
import { useParams, useRouter } from "../../../../adapters/next-navigation";
import {
  Search,
  Plus,
  List,
  LayoutGrid,
  MoreHorizontal,
  Edit,
  Copy,
  FolderInput,
  History,
  Trash2,
  Send,
  X,
  FileText,
} from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Badge } from "../../../../components/ui/badge";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Avatar, AvatarFallback } from "../../../../components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../../../components/ui/pagination";
import { PageHeader } from "../../../../components/layout/page-header";
import {
  mockDocuments,
  mockContentTypes,
  formatRelativeTime,
  type Document,
} from "../../../../lib/mock-data";
import { cn } from "../../../../lib/utils";

const statusConfig = {
  published: {
    label: "Published",
    className: "bg-success/10 text-success border-success/20",
  },
  draft: {
    label: "Draft",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  changed: {
    label: "Changed",
    className: "bg-warning/10 text-warning border-warning/20",
  },
};

export default function ContentTypePage() {
  const params = useParams();
  const router = useRouter();
  const typeId = params.type as string;

  const contentType = mockContentTypes.find((t) => t.id === typeId);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [localeFilter, setLocaleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("updated");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Filter documents for this type
  const typeDocuments = useMemo(() => {
    return mockDocuments.filter(
      (doc) => doc.type.toLowerCase() === contentType?.name.toLowerCase(),
    );
  }, [contentType]);

  // Apply filters
  const filteredDocuments = useMemo(() => {
    let docs = [...typeDocuments];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      docs = docs.filter(
        (doc) =>
          doc.title.toLowerCase().includes(query) ||
          doc.path.toLowerCase().includes(query),
      );
    }

    if (statusFilter !== "all") {
      docs = docs.filter((doc) => doc.status === statusFilter);
    }

    if (localeFilter !== "all") {
      docs = docs.filter((doc) => doc.locale === localeFilter);
    }

    // Sort
    docs.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        case "created":
          return b.createdAt.getTime() - a.createdAt.getTime();
        case "path-asc":
          return a.path.localeCompare(b.path);
        case "path-desc":
          return b.path.localeCompare(a.path);
        default:
          return 0;
      }
    });

    return docs;
  }, [typeDocuments, searchQuery, statusFilter, localeFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredDocuments.length / pageSize);
  const paginatedDocuments = filteredDocuments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedDocuments.map((d) => d.id)));
    }
  };

  if (!contentType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-foreground-muted">Content type not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        breadcrumbs={[
          { label: "Content", href: "/admin/content" },
          { label: contentType.name },
        ]}
      />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-heading tracking-tight">
            {contentType.name}
          </h1>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-72"
              />
            </div>

            {/* Locale filter */}
            {contentType.localized && (
              <Select value={localeFilter} onValueChange={setLocaleFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All locales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locales</SelectItem>
                  {contentType.locales?.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {locale}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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

          <div className="flex items-center gap-3">
            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
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

            {/* View toggle */}
            <div className="flex border border-border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "rounded-r-none",
                  viewMode === "list" && "bg-background-subtle",
                )}
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "rounded-l-none",
                  viewMode === "grid" && "bg-background-subtle",
                )}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-accent-subtle p-3">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button variant="outline" size="sm">
              <Send className="mr-2 h-3 w-3" />
              Publish
            </Button>
            <Button variant="outline" size="sm">
              Unpublish
            </Button>
            <Button variant="outline" size="sm">
              <FolderInput className="mr-2 h-3 w-3" />
              Move
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-3 w-3" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="mr-2 h-3 w-3" />
              Deselect
            </Button>
          </div>
        )}

        {/* Content Table */}
        {paginatedDocuments.length > 0 ? (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        paginatedDocuments.length > 0 &&
                        selectedIds.size === paginatedDocuments.length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Title / Path</TableHead>
                  {contentType.localized && (
                    <TableHead className="w-20">Locale</TableHead>
                  )}
                  {contentType.localized && (
                    <TableHead className="w-28">Translation</TableHead>
                  )}
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-32">Updated</TableHead>
                  <TableHead className="w-28">Author</TableHead>
                  <TableHead className="w-16">Presence</TableHead>
                  <TableHead className="w-14"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className={cn(
                      "cursor-pointer",
                      selectedIds.has(doc.id) && "bg-accent-subtle",
                    )}
                    onClick={() =>
                      router.push(`/admin/content/${typeId}/${doc.id}`)
                    }
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleSelect(doc.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-foreground-muted font-mono">
                          {doc.path}
                        </p>
                      </div>
                    </TableCell>
                    {contentType.localized && (
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {doc.locale}
                        </Badge>
                      </TableCell>
                    )}
                    {contentType.localized && (
                      <TableCell>
                        {doc.translationProgress && (
                          <div className="flex items-center gap-1">
                            {Array.from({
                              length: doc.translationProgress.total,
                            }).map((_, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  i < doc.translationProgress!.completed
                                    ? "bg-success"
                                    : "bg-border",
                                )}
                              />
                            ))}
                            <span className="ml-1 text-xs text-foreground-muted">
                              {doc.translationProgress.completed}/
                              {doc.translationProgress.total}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          statusConfig[doc.status].className,
                        )}
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
                            {doc.author.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate max-w-16">
                          {doc.author.name.split(" ")[0]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc.isBeingEdited && doc.editedBy && (
                        <div className="relative">
                          <Avatar className="h-6 w-6 ring-2 ring-success animate-pulse">
                            <AvatarFallback className="text-xs">
                              {doc.editedBy.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Send className="mr-2 h-4 w-4" />
                            {doc.status === "published"
                              ? "Unpublish"
                              : "Publish"}
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FolderInput className="mr-2 h-4 w-4" />
                            Move
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <History className="mr-2 h-4 w-4" />
                            View history
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-background-subtle p-4">
              <FileText className="h-8 w-8 text-foreground-muted" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
            <p className="mb-4 text-sm text-foreground-muted">
              Create your first {contentType.name} document to get started.
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Document
            </Button>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground-muted">
              Showing {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredDocuments.length)} of{" "}
              {filteredDocuments.length} documents
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  const page = i + 1;
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
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
      </div>
    </div>
  );
}
