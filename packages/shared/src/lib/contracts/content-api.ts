export type ApiDataEnvelope<T> = {
  data: T;
};

export type PaginationMetadata = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ApiPaginatedEnvelope<T> = {
  data: T[];
  pagination: PaginationMetadata;
};

export type ContentDocumentResponse = {
  documentId: string;
  translationGroupId: string;
  project: string;
  environment: string;
  path: string;
  type: string;
  locale: string;
  format: "md" | "mdx";
  isDeleted: boolean;
  hasUnpublishedChanges: boolean;
  version: number;
  publishedVersion: number | null;
  draftRevision: number;
  frontmatter: Record<string, unknown>;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentVersionSummaryResponse = {
  documentId: string;
  translationGroupId: string;
  project: string;
  environment: string;
  version: number;
  path: string;
  type: string;
  locale: string;
  format: "md" | "mdx";
  publishedAt: string;
  publishedBy: string;
  changeSummary?: string;
};

export type ContentVersionDocumentResponse = ContentVersionSummaryResponse & {
  frontmatter: Record<string, unknown>;
  body: string;
};
