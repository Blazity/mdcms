"use client";

import { useMemo, useState } from "react";

import { useParams, useRouter } from "../adapters/next-navigation.js";
import {
  Copy,
  Edit,
  FileText,
  FolderInput,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "../components/layout/page-header.js";
import { Avatar, AvatarFallback } from "../components/ui/avatar.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Checkbox } from "../components/ui/checkbox.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import { Input } from "../components/ui/input.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../components/ui/pagination.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.js";
import {
  formatRelativeTime,
  mockContentTypes,
  mockDocuments,
} from "../lib/mock-data.js";
import { cn } from "../lib/utils.js";

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

  const contentType = mockContentTypes.find((type) => type.id === typeId);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [localeFilter, setLocaleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("updated");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const typeDocuments = useMemo(() => {
    return mockDocuments.filter(
      (document) =>
        document.type.toLowerCase() === contentType?.name.toLowerCase(),
    );
  }, [contentType]);

  const filteredDocuments = useMemo(() => {
    let documents = [...typeDocuments];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      documents = documents.filter(
        (document) =>
          document.title.toLowerCase().includes(query) ||
          document.path.toLowerCase().includes(query),
      );
    }

    if (statusFilter !== "all") {
      documents = documents.filter(
        (document) => document.status === statusFilter,
      );
    }

    if (localeFilter !== "all") {
      documents = documents.filter(
        (document) => document.locale === localeFilter,
      );
    }

    documents.sort((left, right) => {
      switch (sortBy) {
        case "updated":
          return right.updatedAt.getTime() - left.updatedAt.getTime();
        case "created":
          return right.createdAt.getTime() - left.createdAt.getTime();
        case "path-asc":
          return left.path.localeCompare(right.path);
        case "path-desc":
          return right.path.localeCompare(left.path);
        default:
          return 0;
      }
    });

    return documents;
  }, [localeFilter, searchQuery, sortBy, statusFilter, typeDocuments]);

  const totalPages = Math.ceil(filteredDocuments.length / pageSize);
  const paginatedDocuments = filteredDocuments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const toggleSelect = (id: string) => {
    const nextSelectedIds = new Set(selectedIds);

    if (nextSelectedIds.has(id)) {
      nextSelectedIds.delete(id);
    } else {
      nextSelectedIds.add(id);
    }

    setSelectedIds(nextSelectedIds);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedDocuments.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(paginatedDocuments.map((document) => document.id)));
  };

  if (!contentType) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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

      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{contentType.name}</h1>
          <Button className="bg-accent text-white hover:bg-accent-hover">
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-72 pl-9"
              />
            </div>

            {contentType.localized ? (
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
            ) : null}

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

            <div className="flex rounded-md border border-border">
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

        {selectedIds.size > 0 ? (
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
        ) : null}

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
                  {contentType.localized ? (
                    <TableHead className="w-20">Locale</TableHead>
                  ) : null}
                  {contentType.localized ? (
                    <TableHead className="w-28">Translation</TableHead>
                  ) : null}
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-32">Updated</TableHead>
                  <TableHead className="w-28">Author</TableHead>
                  <TableHead className="w-16">Presence</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((document) => (
                  <TableRow
                    key={document.id}
                    className={cn(
                      "cursor-pointer",
                      selectedIds.has(document.id) && "bg-accent-subtle",
                    )}
                    onClick={() =>
                      router.push(`/admin/content/${typeId}/${document.id}`)
                    }
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(document.id)}
                        onCheckedChange={() => toggleSelect(document.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{document.title}</p>
                        <p className="font-mono text-xs text-foreground-muted">
                          {document.path}
                        </p>
                      </div>
                    </TableCell>
                    {contentType.localized ? (
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {document.locale}
                        </Badge>
                      </TableCell>
                    ) : null}
                    {contentType.localized ? (
                      <TableCell>
                        {document.translationProgress ? (
                          <div className="flex items-center gap-1">
                            {Array.from({
                              length: document.translationProgress.total,
                            }).map((_, index) => (
                              <span
                                key={index}
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  index <
                                    document.translationProgress!.completed
                                    ? "bg-success"
                                    : "bg-border",
                                )}
                              />
                            ))}
                            <span className="ml-1 text-xs text-foreground-muted">
                              {document.translationProgress.completed}/
                              {document.translationProgress.total}
                            </span>
                          </div>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          statusConfig[document.status].className,
                        )}
                      >
                        {statusConfig[document.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-foreground-muted">
                      {formatRelativeTime(document.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {document.author.name
                              .split(" ")
                              .map((name) => name[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-16 truncate text-sm">
                          {document.author.name.split(" ")[0]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {document.isBeingEdited && document.editedBy ? (
                        <div className="relative">
                          <Avatar className="h-6 w-6 animate-pulse ring-2 ring-success">
                            <AvatarFallback className="text-xs">
                              {document.editedBy.name
                                .split(" ")
                                .map((name) => name[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
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
                            {document.status === "published"
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-background-subtle p-4">
              <FileText className="h-8 w-8 text-foreground-muted" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
            <p className="mb-4 text-sm text-foreground-muted">
              Create your first {contentType.name} document to get started.
            </p>
            <Button className="bg-accent text-white hover:bg-accent-hover">
              <Plus className="mr-2 h-4 w-4" />
              New Document
            </Button>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground-muted">
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filteredDocuments.length)} of{" "}
              {filteredDocuments.length} documents
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    className={
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }).map(
                  (_, index) => {
                    const page = index + 1;

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
                  },
                )}
                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
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
        ) : null}
      </div>
    </div>
  );
}
