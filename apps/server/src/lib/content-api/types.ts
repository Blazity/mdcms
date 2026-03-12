import type { AuthorizationRequirement } from "../auth.js";
import type { DrizzleDatabase } from "../db.js";
import { z } from "zod";

export const SortFieldSchema = z.enum(["createdAt", "updatedAt", "path"]);
export const SortOrderSchema = z.enum(["asc", "desc"]);
export const ContentFormatSchema = z.enum(["md", "mdx"]);
export const RestoreTargetStatusSchema = z.enum(["draft", "published"]);

export const JsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => !Array.isArray(v), { message: "must be an object" });

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const DEFAULT_ACTOR = "00000000-0000-0000-0000-000000000001";

export type SortField = z.infer<typeof SortFieldSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
export type ContentFormat = z.infer<typeof ContentFormatSchema>;
export type RestoreTargetStatus = z.infer<typeof RestoreTargetStatusSchema>;

export type ContentScope = {
  project: string;
  environment: string;
};

export type ContentDocument = {
  documentId: string;
  translationGroupId: string;
  project: string;
  environment: string;
  path: string;
  type: string;
  locale: string;
  format: ContentFormat;
  isDeleted: boolean;
  hasUnpublishedChanges: boolean;
  version: number;
  publishedVersion: number | null;
  draftRevision: number;
  frontmatter: Record<string, unknown>;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type ContentVersionSummary = {
  documentId: string;
  translationGroupId: string;
  project: string;
  environment: string;
  version: number;
  path: string;
  type: string;
  locale: string;
  format: ContentFormat;
  publishedAt: string;
  publishedBy: string;
  changeSummary?: string;
};

export type ContentVersionDocument = ContentVersionSummary & {
  frontmatter: Record<string, unknown>;
  body: string;
};

export type ContentPublishedSnapshot = {
  version: number;
  path: string;
  type: string;
  locale: string;
  format: ContentFormat;
  frontmatter: Record<string, unknown>;
  body: string;
  publishedAt: string;
  publishedBy: string;
  changeSummary?: string;
};

export type ContentListQuery = {
  type?: string;
  path?: string;
  locale?: string;
  slug?: string;
  published?: string;
  isDeleted?: string;
  hasUnpublishedChanges?: string;
  draft?: string;
  resolve?: string | string[];
  project?: string;
  environment?: string;
  limit?: string;
  offset?: string;
  sort?: string;
  order?: string;
  q?: string;
};

export type ContentWritePayload = {
  path?: string;
  type?: string;
  locale?: string;
  format?: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  // When provided on create, the new document becomes a locale variant
  // in the source document's translation group.
  sourceDocumentId?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type ContentPublishPayload = {
  changeSummary?: unknown;
  change_summary?: unknown;
  actorId?: unknown;
};

export type ContentRestoreVersionPayload = ContentPublishPayload & {
  targetStatus?: unknown;
};

export type ContentRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
  put?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
  delete?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
};

export type ContentStore = {
  create: (
    scope: ContentScope,
    payload: ContentWritePayload,
  ) => Promise<ContentDocument>;
  list: (
    scope: ContentScope,
    query: ContentListQuery,
  ) => Promise<{
    rows: ContentDocument[];
    total: number;
    limit: number;
    offset: number;
  }>;
  getById: (
    scope: ContentScope,
    documentId: string,
    options?: { draft?: boolean },
  ) => Promise<ContentDocument | undefined>;
  update: (
    scope: ContentScope,
    documentId: string,
    payload: ContentWritePayload,
  ) => Promise<ContentDocument>;
  softDelete: (
    scope: ContentScope,
    documentId: string,
  ) => Promise<ContentDocument>;
  restore: (
    scope: ContentScope,
    documentId: string,
  ) => Promise<ContentDocument>;
  listVersions: (
    scope: ContentScope,
    documentId: string,
  ) => Promise<ContentVersionSummary[]>;
  getVersion: (
    scope: ContentScope,
    documentId: string,
    version: number,
  ) => Promise<ContentVersionDocument>;
  restoreVersion: (
    scope: ContentScope,
    documentId: string,
    version: number,
    input: {
      targetStatus: RestoreTargetStatus;
      changeSummary?: string;
      actorId?: string;
    },
  ) => Promise<ContentDocument>;
  publish: (
    scope: ContentScope,
    documentId: string,
    input: {
      changeSummary?: string;
      actorId?: string;
    },
  ) => Promise<ContentDocument>;
  unpublish: (
    scope: ContentScope,
    documentId: string,
    input: {
      actorId?: string;
    },
  ) => Promise<ContentDocument>;
};

export type CreateDatabaseContentStoreOptions = {
  db: DrizzleDatabase;
};

export type ContentRequestAuthorizer = (
  request: Request,
  requirement: AuthorizationRequirement,
) => Promise<unknown>;

export type ContentRequestCsrfProtector = (request: Request) => Promise<void>;

export type MountContentApiRoutesOptions = {
  store: ContentStore;
  authorize: ContentRequestAuthorizer;
  requireCsrf: ContentRequestCsrfProtector;
};
