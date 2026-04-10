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

export type ContentResolveError = {
  code:
    | "REFERENCE_NOT_FOUND"
    | "REFERENCE_DELETED"
    | "REFERENCE_TYPE_MISMATCH"
    | "REFERENCE_FORBIDDEN";
  message: string;
  ref: {
    documentId: string;
    type: string;
  };
};

export type ResolveErrorsMap = Record<string, ContentResolveError>;

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
  resolveErrors?: ResolveErrorsMap;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
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
  resolveErrors?: ResolveErrorsMap;
};

export type ContentUserSummary = {
  name: string;
  email: string;
};

export type ContentOverviewCountsResponse = {
  type: string;
  total: number;
  published: number;
  drafts: number;
};

export type TranslationVariantSummary = {
  documentId: string;
  locale: string;
  path: string;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
};

export type TranslationVariantsResponse = ApiDataEnvelope<
  TranslationVariantSummary[]
>;
