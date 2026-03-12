import { randomUUID } from "node:crypto";

import { RuntimeError, resolveRequestTargetRouting } from "@mdcms/shared";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { DrizzleDatabase } from "./db.js";
import {
  documents,
  documentVersions,
  schemaRegistryEntries,
  schemaSyncs,
} from "./db/schema.js";
import type { ApiKeyOperationScope, AuthorizationRequirement } from "./auth.js";
import { executeWithRuntimeErrorsHandled } from "./http-utils.js";
import { resolveProjectEnvironmentScope } from "./project-provisioning.js";

const SortFieldSchema = z.enum(["createdAt", "updatedAt", "path"]);
const SortOrderSchema = z.enum(["asc", "desc"]);
const ContentFormatSchema = z.enum(["md", "mdx"]);
const RestoreTargetStatusSchema = z.enum(["draft", "published"]);

const JsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => !Array.isArray(v), { message: "must be an object" });

type SortField = z.infer<typeof SortFieldSchema>;
type SortOrder = z.infer<typeof SortOrderSchema>;
type ContentFormat = z.infer<typeof ContentFormatSchema>;
type RestoreTargetStatus = z.infer<typeof RestoreTargetStatusSchema>;

type ContentDocument = {
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

type ContentVersionSummary = {
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

type ContentVersionDocument = ContentVersionSummary & {
  frontmatter: Record<string, unknown>;
  body: string;
};

type ContentPublishedSnapshot = {
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

type ContentListQuery = {
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

type ContentWritePayload = {
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

type ContentPublishPayload = {
  changeSummary?: unknown;
  change_summary?: unknown;
  actorId?: unknown;
};

type ContentRestoreVersionPayload = ContentPublishPayload & {
  targetStatus?: unknown;
};

type ContentRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
  put?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
  delete?: (path: string, handler: (ctx: any) => unknown) => ContentRouteApp;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_ACTOR = "00000000-0000-0000-0000-000000000001";

function toScopeKey(project: string, environment: string): string {
  return `${project}::${environment}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQueryParam<T>(
  schema: z.ZodType<T>,
  value: unknown,
  field: string,
  errorCode = "INVALID_QUERY_PARAM",
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new RuntimeError({
    code: errorCode,
    message: `Query parameter "${field}" ${result.error.issues[0]?.message ?? "is invalid"}.`,
    statusCode: 400,
    details: { field, value },
  });
}

function parseInputField<T>(
  schema: z.ZodType<T>,
  value: unknown,
  field: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const isTypeError = issue?.code === "invalid_type";
  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: isTypeError
      ? `Field "${field}" must be a ${issue.expected === "object" ? "object" : "string"}.`
      : `Field "${field}" ${issue?.message ?? "is invalid"}.`,
    statusCode: 400,
    details: { field },
  });
}

function parseBoolean(
  value: string | undefined,
  field: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  const schema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true");
  return parseQueryParam(schema, value, field);
}

function parsePositiveInt(
  value: string | undefined,
  field: string,
  options: { defaultValue: number; min?: number; max?: number },
): number {
  if (value === undefined) return options.defaultValue;

  const schema = z
    .string()
    .trim()
    .regex(/^\d+$/, { message: "must be an integer" })
    .transform((v) => Number(v))
    .pipe(
      z
        .number()
        .int()
        .min(options.min ?? -Infinity)
        .max(options.max ?? Infinity),
    );

  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  let message: string;
  if (issue?.code === "too_small") {
    message = `Query parameter "${field}" must be >= ${options.min}.`;
  } else if (issue?.code === "too_big") {
    message = `Query parameter "${field}" must be <= ${options.max}.`;
  } else {
    message = `Query parameter "${field}" must be an integer.`;
  }

  throw new RuntimeError({
    code: "INVALID_QUERY_PARAM",
    message,
    statusCode: 400,
    details: { field, value },
  });
}

function parsePathInt(value: unknown, field: string): number {
  const result = z
    .string()
    .trim()
    .regex(/^\d+$/, { message: "must be an integer" })
    .transform((candidate) => Number(candidate))
    .pipe(z.number().int().min(1))
    .safeParse(value);

  if (result.success) {
    return result.data;
  }

  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: `Field "${field}" must be a positive integer.`,
    statusCode: 400,
    details: { field, value },
  });
}

function parseSortField(value: string | undefined): SortField {
  if (value === undefined || value.trim().length === 0) return "updatedAt";
  return parseQueryParam(
    z.string().trim().pipe(SortFieldSchema),
    value,
    "sort",
  );
}

function parseSortOrder(value: string | undefined): SortOrder {
  if (value === undefined || value.trim().length === 0) return "desc";
  return parseQueryParam(
    z.string().trim().toLowerCase().pipe(SortOrderSchema),
    value,
    "order",
  );
}

function parseContentFormat(value: string | undefined): ContentFormat {
  if (value === undefined) return "md";
  const result = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(ContentFormatSchema)
    .safeParse(value);
  if (result.success) return result.data;
  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: `Content format must be "md" or "mdx".`,
    statusCode: 400,
    details: { field: "format", value },
  });
}

function assertRequiredString(
  value: unknown,
  field: string,
  options: { allowEmpty?: boolean } = {},
): string {
  const schema = options.allowEmpty
    ? z.string().trim()
    : z.string().trim().min(1);
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const isTypeError = issue?.code === "invalid_type";
  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: isTypeError
      ? `Field "${field}" must be a string.`
      : `Field "${field}" is required.`,
    statusCode: 400,
    details: { field },
  });
}

function assertJsonObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  return parseInputField(JsonObjectSchema, value, field);
}

function parseOptionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Field "${field}" must be a string.`,
      statusCode: 400,
      details: { field },
    });
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRestoreTargetStatus(
  value: unknown,
  field = "targetStatus",
): RestoreTargetStatus {
  if (value === undefined || value === null) {
    return "draft";
  }

  const result = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(RestoreTargetStatusSchema)
    .safeParse(value);

  if (result.success) {
    return result.data;
  }

  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: 'Field "targetStatus" must be "draft" or "published".',
    statusCode: 400,
    details: { field, value },
  });
}

function pickScope(request: Request): { project: string; environment: string } {
  const scope = resolveRequestTargetRouting(request);

  if (!scope.project || !scope.environment) {
    throw new RuntimeError({
      code: "MISSING_TARGET_ROUTING",
      message:
        "Both project and environment are required for content endpoints.",
      statusCode: 400,
      details: {
        project: scope.project ?? null,
        environment: scope.environment ?? null,
      },
    });
  }

  return {
    project: scope.project,
    environment: scope.environment,
  };
}

function toDocumentResponse(
  document: ContentDocument,
): Record<string, unknown> {
  return {
    documentId: document.documentId,
    translationGroupId: document.translationGroupId,
    project: document.project,
    environment: document.environment,
    path: document.path,
    type: document.type,
    locale: document.locale,
    format: document.format,
    isDeleted: document.isDeleted,
    hasUnpublishedChanges: document.hasUnpublishedChanges,
    version: document.version,
    publishedVersion: document.publishedVersion,
    draftRevision: document.draftRevision,
    frontmatter: document.frontmatter,
    body: document.body,
    createdBy: document.createdBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toVersionSummaryResponse(
  document: ContentVersionSummary,
): Record<string, unknown> {
  return {
    documentId: document.documentId,
    translationGroupId: document.translationGroupId,
    project: document.project,
    environment: document.environment,
    version: document.version,
    path: document.path,
    type: document.type,
    locale: document.locale,
    format: document.format,
    publishedAt: document.publishedAt,
    publishedBy: document.publishedBy,
    changeSummary: document.changeSummary,
  };
}

function toVersionDocumentResponse(
  document: ContentVersionDocument,
): Record<string, unknown> {
  return {
    ...toVersionSummaryResponse(document),
    frontmatter: document.frontmatter,
    body: document.body,
  };
}

function toIsoString(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value as any).toISOString();
}

function getDatabaseErrorObjects(
  error: unknown,
): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  const seen = new Set<object>();
  let current = error;

  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current as object)
  ) {
    objects.push(current as Record<string, unknown>);
    seen.add(current as object);
    current = (current as { cause?: unknown }).cause;
  }

  return objects;
}

function isUniqueViolation(error: unknown): boolean {
  return getDatabaseErrorObjects(error).some(
    (candidate) => candidate.code === "23505",
  );
}

function getUniqueConstraintName(error: unknown): string | undefined {
  for (const candidate of getDatabaseErrorObjects(error)) {
    const constraint = candidate.constraint_name ?? candidate.constraint;

    if (typeof constraint === "string") {
      return constraint;
    }
  }

  return undefined;
}

function readSupportedLocales(
  rawConfigSnapshot: unknown,
): Set<string> | undefined {
  if (!isRecord(rawConfigSnapshot)) {
    return undefined;
  }

  const locales = rawConfigSnapshot.locales;
  if (!isRecord(locales) || !Array.isArray(locales.supported)) {
    return undefined;
  }

  const supportedLocales = locales.supported.filter(
    (locale): locale is string =>
      typeof locale === "string" && locale.trim().length > 0,
  );

  if (supportedLocales.length === 0) {
    return undefined;
  }

  return new Set(supportedLocales);
}

function toContentDocument(
  scope: { project: string; environment: string },
  row: typeof documents.$inferSelect,
): ContentDocument {
  return {
    documentId: row.documentId,
    translationGroupId: row.translationGroupId,
    project: scope.project,
    environment: scope.environment,
    path: row.path,
    type: row.schemaType,
    locale: row.locale,
    format: row.contentFormat as ContentFormat,
    isDeleted: row.isDeleted,
    hasUnpublishedChanges: row.hasUnpublishedChanges,
    version: row.publishedVersion ?? 0,
    publishedVersion: row.publishedVersion,
    draftRevision: row.draftRevision,
    frontmatter: row.frontmatter as Record<string, unknown>,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: toIsoString(row.createdAt),
    updatedBy: row.updatedBy,
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toContentVersionDocument(
  scope: { project: string; environment: string },
  row: typeof documentVersions.$inferSelect,
): ContentVersionDocument {
  return {
    documentId: row.documentId,
    translationGroupId: row.translationGroupId,
    project: scope.project,
    environment: scope.environment,
    version: row.version,
    path: row.path,
    type: row.schemaType,
    locale: row.locale,
    format: row.contentFormat as ContentFormat,
    publishedAt: toIsoString(row.publishedAt),
    publishedBy: row.publishedBy,
    changeSummary: row.changeSummary ?? undefined,
    frontmatter: row.frontmatter as Record<string, unknown>,
    body: row.body,
  };
}

function buildContentPathConflict(input: {
  path: string;
  locale: string;
  conflictDocumentId?: string;
}): RuntimeError {
  return new RuntimeError({
    code: "CONTENT_PATH_CONFLICT",
    message:
      "A non-deleted document with the same path and locale already exists.",
    statusCode: 409,
    details: {
      conflictDocumentId: input.conflictDocumentId,
      path: input.path,
      locale: input.locale,
    },
  });
}

export type ContentStore = {
  create: (
    scope: { project: string; environment: string },
    payload: ContentWritePayload,
  ) => Promise<ContentDocument>;
  list: (
    scope: { project: string; environment: string },
    query: ContentListQuery,
  ) => Promise<{
    rows: ContentDocument[];
    total: number;
    limit: number;
    offset: number;
  }>;
  getById: (
    scope: { project: string; environment: string },
    documentId: string,
    options?: { draft?: boolean },
  ) => Promise<ContentDocument | undefined>;
  update: (
    scope: { project: string; environment: string },
    documentId: string,
    payload: ContentWritePayload,
  ) => Promise<ContentDocument>;
  softDelete: (
    scope: { project: string; environment: string },
    documentId: string,
  ) => Promise<ContentDocument>;
  restore: (
    scope: { project: string; environment: string },
    documentId: string,
  ) => Promise<ContentDocument>;
  listVersions: (
    scope: { project: string; environment: string },
    documentId: string,
  ) => Promise<ContentVersionSummary[]>;
  getVersion: (
    scope: { project: string; environment: string },
    documentId: string,
    version: number,
  ) => Promise<ContentVersionDocument>;
  restoreVersion: (
    scope: { project: string; environment: string },
    documentId: string,
    version: number,
    input: {
      targetStatus: RestoreTargetStatus;
      changeSummary?: string;
      actorId?: string;
    },
  ) => Promise<ContentDocument>;
  publish: (
    scope: { project: string; environment: string },
    documentId: string,
    input: {
      changeSummary?: string;
      actorId?: string;
    },
  ) => Promise<ContentDocument>;
  unpublish: (
    scope: { project: string; environment: string },
    documentId: string,
    input: {
      actorId?: string;
    },
  ) => Promise<ContentDocument>;
};

export function createInMemoryContentStore(): ContentStore {
  const scopedDocs = new Map<string, Map<string, ContentDocument>>();
  const scopedPublishedSnapshots = new Map<
    string,
    Map<string, Map<number, ContentPublishedSnapshot>>
  >();

  function getScopeStore(scope: {
    project: string;
    environment: string;
  }): Map<string, ContentDocument> {
    const key = toScopeKey(scope.project, scope.environment);
    let store = scopedDocs.get(key);

    if (!store) {
      store = new Map<string, ContentDocument>();
      scopedDocs.set(key, store);
    }

    return store;
  }

  function getScopePublishedSnapshots(scope: {
    project: string;
    environment: string;
  }): Map<string, Map<number, ContentPublishedSnapshot>> {
    const key = toScopeKey(scope.project, scope.environment);
    let store = scopedPublishedSnapshots.get(key);

    if (!store) {
      store = new Map();
      scopedPublishedSnapshots.set(key, store);
    }

    return store;
  }

  function findPathConflict(
    store: Map<string, ContentDocument>,
    input: {
      path: string;
      locale: string;
      documentId?: string;
    },
  ): ContentDocument | undefined {
    for (const candidate of store.values()) {
      if (
        candidate.documentId !== input.documentId &&
        candidate.path === input.path &&
        candidate.locale === input.locale &&
        candidate.isDeleted === false
      ) {
        return candidate;
      }
    }

    return undefined;
  }

  function findTranslationLocaleConflict(
    store: Map<string, ContentDocument>,
    input: {
      translationGroupId: string;
      locale: string;
      documentId?: string;
    },
  ): ContentDocument | undefined {
    for (const candidate of store.values()) {
      if (
        candidate.documentId !== input.documentId &&
        candidate.translationGroupId === input.translationGroupId &&
        candidate.locale === input.locale &&
        candidate.isDeleted === false
      ) {
        return candidate;
      }
    }

    return undefined;
  }

  function resolveReadDocument(input: {
    document: ContentDocument;
    draft: boolean;
    publishedSnapshots: Map<string, Map<number, ContentPublishedSnapshot>>;
  }): ContentDocument | undefined {
    if (input.draft) {
      return input.document;
    }

    if (
      input.document.isDeleted ||
      input.document.publishedVersion === null ||
      input.document.publishedVersion === undefined
    ) {
      return undefined;
    }

    const snapshot = input.publishedSnapshots
      .get(input.document.documentId)
      ?.get(input.document.publishedVersion);

    if (!snapshot) {
      return undefined;
    }

    return {
      ...input.document,
      path: snapshot.path,
      type: snapshot.type,
      locale: snapshot.locale,
      format: snapshot.format,
      frontmatter: snapshot.frontmatter,
      body: snapshot.body,
      version: snapshot.version,
      updatedAt: snapshot.publishedAt,
      updatedBy: snapshot.publishedBy,
    };
  }

  function toVersionSummary(
    scope: { project: string; environment: string },
    document: ContentDocument,
    snapshot: ContentPublishedSnapshot,
  ): ContentVersionSummary {
    return {
      documentId: document.documentId,
      translationGroupId: document.translationGroupId,
      project: scope.project,
      environment: scope.environment,
      version: snapshot.version,
      path: snapshot.path,
      type: snapshot.type,
      locale: snapshot.locale,
      format: snapshot.format,
      publishedAt: snapshot.publishedAt,
      publishedBy: snapshot.publishedBy,
      changeSummary: snapshot.changeSummary,
    };
  }

  function toVersionDocument(
    scope: { project: string; environment: string },
    document: ContentDocument,
    snapshot: ContentPublishedSnapshot,
  ): ContentVersionDocument {
    return {
      ...toVersionSummary(scope, document, snapshot),
      frontmatter: snapshot.frontmatter,
      body: snapshot.body,
    };
  }

  function getNextVersionNumber(
    snapshots: Map<number, ContentPublishedSnapshot>,
  ): number {
    return (
      [...snapshots.keys()].reduce(
        (maxVersion, candidateVersion) =>
          candidateVersion > maxVersion ? candidateVersion : maxVersion,
        0,
      ) + 1
    );
  }

  return {
    async create(scope, payload) {
      const store = getScopeStore(scope);
      const path = assertRequiredString(payload.path, "path");
      const type = assertRequiredString(payload.type, "type");
      const locale = assertRequiredString(payload.locale, "locale");
      const sourceDocumentId = parseOptionalString(
        payload.sourceDocumentId,
        "sourceDocumentId",
      );
      const body = assertRequiredString(payload.body, "body", {
        allowEmpty: true,
      });
      const frontmatter = assertJsonObject(payload.frontmatter, "frontmatter");
      const format = parseContentFormat(payload.format);
      const sourceDocument = sourceDocumentId
        ? store.get(sourceDocumentId)
        : undefined;

      if (sourceDocumentId && (!sourceDocument || sourceDocument.isDeleted)) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: sourceDocumentId,
          },
        });
      }

      if (sourceDocument && sourceDocument.type !== type) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message:
            'Field "type" must match the source document type when creating a translation variant.',
          statusCode: 400,
          details: {
            field: "type",
            sourceDocumentId,
          },
        });
      }

      const conflict = findPathConflict(store, { path, locale });

      if (conflict) {
        throw new RuntimeError({
          code: "CONTENT_PATH_CONFLICT",
          message:
            "A non-deleted document with the same path and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: conflict.documentId,
            path,
            locale,
          },
        });
      }

      const translationGroupId =
        sourceDocument?.translationGroupId ?? randomUUID();
      const translationConflict = findTranslationLocaleConflict(store, {
        translationGroupId,
        locale,
      });

      if (translationConflict) {
        throw new RuntimeError({
          code: "TRANSLATION_VARIANT_CONFLICT",
          message:
            "A non-deleted document with the same translation group and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: translationConflict.documentId,
            translationGroupId,
            locale,
          },
        });
      }

      const now = new Date().toISOString();
      const actor = payload.createdBy?.trim() || DEFAULT_ACTOR;
      const document: ContentDocument = {
        documentId: randomUUID(),
        translationGroupId,
        project: scope.project,
        environment: scope.environment,
        path,
        type,
        locale,
        format,
        isDeleted: false,
        hasUnpublishedChanges: true,
        version: 0,
        publishedVersion: null,
        draftRevision: 1,
        frontmatter,
        body,
        createdBy: actor,
        createdAt: now,
        updatedBy: actor,
        updatedAt: now,
      };

      store.set(document.documentId, document);
      return document;
    },

    async list(scope, query) {
      const store = getScopeStore(scope);
      const publishedSnapshots = getScopePublishedSnapshots(scope);
      const limit = parsePositiveInt(query.limit, "limit", {
        defaultValue: DEFAULT_LIMIT,
        min: 1,
        max: MAX_LIMIT,
      });
      const offset = parsePositiveInt(query.offset, "offset", {
        defaultValue: 0,
        min: 0,
      });
      const published = parseBoolean(query.published, "published");
      const isDeleted = parseBoolean(query.isDeleted, "isDeleted");
      const hasUnpublishedChanges = parseBoolean(
        query.hasUnpublishedChanges,
        "hasUnpublishedChanges",
      );
      const sort = parseSortField(query.sort);
      const order = parseSortOrder(query.order);
      const draft = parseBoolean(query.draft, "draft") === true;

      const normalizedType = query.type?.trim();
      const normalizedPath = query.path?.trim();
      const normalizedLocale = query.locale?.trim();
      const normalizedSlug = query.slug?.trim();
      const normalizedQ = query.q?.trim().toLowerCase();

      const rows = [...store.values()]
        .map((document) =>
          resolveReadDocument({
            document,
            draft,
            publishedSnapshots,
          }),
        )
        .filter((doc): doc is ContentDocument => Boolean(doc))
        .filter((doc) => {
          if (normalizedType && doc.type !== normalizedType) {
            return false;
          }

          if (normalizedPath && !doc.path.startsWith(normalizedPath)) {
            return false;
          }

          if (normalizedLocale && doc.locale !== normalizedLocale) {
            return false;
          }

          if (
            normalizedSlug &&
            String(doc.frontmatter.slug ?? "").trim() !== normalizedSlug
          ) {
            return false;
          }

          if (published !== undefined) {
            const isPublished = doc.publishedVersion !== null;

            if (isPublished !== published) {
              return false;
            }
          }

          if (isDeleted !== undefined && doc.isDeleted !== isDeleted) {
            return false;
          }

          if (
            hasUnpublishedChanges !== undefined &&
            doc.hasUnpublishedChanges !== hasUnpublishedChanges
          ) {
            return false;
          }

          if (normalizedQ) {
            const haystack =
              `${doc.path}\n${doc.body}\n${JSON.stringify(doc.frontmatter)}`.toLowerCase();

            if (!haystack.includes(normalizedQ)) {
              return false;
            }
          }

          return true;
        });

      rows.sort((left, right) => {
        let compared = 0;

        if (sort === "path") {
          compared = left.path.localeCompare(right.path);
        } else if (sort === "createdAt") {
          compared = left.createdAt.localeCompare(right.createdAt);
        } else {
          compared = left.updatedAt.localeCompare(right.updatedAt);
        }

        return order === "asc" ? compared : compared * -1;
      });

      const total = rows.length;
      const pagedRows = rows.slice(offset, offset + limit);

      return {
        rows: pagedRows,
        total,
        limit,
        offset,
      };
    },

    async getById(scope, documentId, options) {
      const store = getScopeStore(scope);
      const publishedSnapshots = getScopePublishedSnapshots(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing) {
        return undefined;
      }

      return resolveReadDocument({
        document: existing,
        draft: options?.draft === true,
        publishedSnapshots,
      });
    },

    async update(scope, documentId, payload) {
      const store = getScopeStore(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing || existing.isDeleted) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const nextPath =
        payload.path !== undefined
          ? assertRequiredString(payload.path, "path")
          : existing.path;
      const nextLocale =
        payload.locale !== undefined
          ? assertRequiredString(payload.locale, "locale")
          : existing.locale;
      const conflict = findPathConflict(store, {
        path: nextPath,
        locale: nextLocale,
        documentId: normalizedDocumentId,
      });

      if (conflict) {
        throw new RuntimeError({
          code: "CONTENT_PATH_CONFLICT",
          message:
            "A non-deleted document with the same path and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: conflict.documentId,
            path: nextPath,
            locale: nextLocale,
          },
        });
      }

      const translationConflict = findTranslationLocaleConflict(store, {
        translationGroupId: existing.translationGroupId,
        locale: nextLocale,
        documentId: normalizedDocumentId,
      });

      if (translationConflict) {
        throw new RuntimeError({
          code: "TRANSLATION_VARIANT_CONFLICT",
          message:
            "A non-deleted document with the same translation group and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: translationConflict.documentId,
            translationGroupId: existing.translationGroupId,
            locale: nextLocale,
          },
        });
      }

      const now = new Date().toISOString();
      const updated: ContentDocument = {
        ...existing,
        path: nextPath,
        type:
          payload.type !== undefined
            ? assertRequiredString(payload.type, "type")
            : existing.type,
        locale: nextLocale,
        format:
          payload.format !== undefined
            ? parseContentFormat(payload.format)
            : existing.format,
        frontmatter:
          payload.frontmatter !== undefined
            ? assertJsonObject(payload.frontmatter, "frontmatter")
            : existing.frontmatter,
        body:
          payload.body !== undefined
            ? assertRequiredString(payload.body, "body", { allowEmpty: true })
            : existing.body,
        hasUnpublishedChanges: true,
        draftRevision: existing.draftRevision + 1,
        updatedBy: payload.updatedBy?.trim() || DEFAULT_ACTOR,
        updatedAt: now,
      };

      store.set(normalizedDocumentId, updated);
      return updated;
    },

    async softDelete(scope, documentId) {
      const store = getScopeStore(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const now = new Date().toISOString();
      const deleted: ContentDocument = {
        ...existing,
        isDeleted: true,
        hasUnpublishedChanges: true,
        draftRevision: existing.draftRevision + 1,
        updatedBy: DEFAULT_ACTOR,
        updatedAt: now,
      };
      store.set(normalizedDocumentId, deleted);

      return deleted;
    },

    async restore(scope, documentId) {
      const store = getScopeStore(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const conflict = findPathConflict(store, {
        path: existing.path,
        locale: existing.locale,
        documentId: normalizedDocumentId,
      });

      if (conflict) {
        throw new RuntimeError({
          code: "CONTENT_PATH_CONFLICT",
          message:
            "A non-deleted document with the same path and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: conflict.documentId,
            path: existing.path,
            locale: existing.locale,
          },
        });
      }

      const restored: ContentDocument = {
        ...existing,
        isDeleted: false,
        updatedBy: DEFAULT_ACTOR,
        updatedAt: new Date().toISOString(),
      };
      store.set(normalizedDocumentId, restored);

      return restored;
    },

    async listVersions(scope, documentId) {
      const store = getScopeStore(scope);
      const publishedSnapshots = getScopePublishedSnapshots(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const snapshots = [
        ...(publishedSnapshots.get(normalizedDocumentId)?.values() ?? []),
      ].sort((left, right) => right.version - left.version);

      return snapshots.map((snapshot) =>
        toVersionSummary(scope, existing, snapshot),
      );
    },

    async getVersion(scope, documentId, version) {
      const store = getScopeStore(scope);
      const publishedSnapshots = getScopePublishedSnapshots(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const snapshot = publishedSnapshots
        .get(normalizedDocumentId)
        ?.get(version);

      if (!snapshot) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Version not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
            version,
          },
        });
      }

      return toVersionDocument(scope, existing, snapshot);
    },

    async restoreVersion(scope, documentId, version, input) {
      const store = getScopeStore(scope);
      const publishedSnapshots = getScopePublishedSnapshots(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const documentSnapshots =
        publishedSnapshots.get(normalizedDocumentId) ?? new Map();
      if (!publishedSnapshots.has(normalizedDocumentId)) {
        publishedSnapshots.set(normalizedDocumentId, documentSnapshots);
      }

      const snapshot = documentSnapshots.get(version);

      if (!snapshot) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Version not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
            version,
          },
        });
      }

      const conflict = findPathConflict(store, {
        path: snapshot.path,
        locale: snapshot.locale,
        documentId: normalizedDocumentId,
      });

      if (conflict) {
        throw new RuntimeError({
          code: "CONTENT_PATH_CONFLICT",
          message:
            "A non-deleted document with the same path and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: conflict.documentId,
            path: snapshot.path,
            locale: snapshot.locale,
          },
        });
      }

      const actorId = input.actorId?.trim() || DEFAULT_ACTOR;
      const now = new Date().toISOString();

      if (input.targetStatus === "published") {
        const nextVersion = getNextVersionNumber(documentSnapshots);

        documentSnapshots.set(nextVersion, {
          ...snapshot,
          version: nextVersion,
          publishedAt: now,
          publishedBy: actorId,
          changeSummary: input.changeSummary,
        });

        const restored: ContentDocument = {
          ...existing,
          path: snapshot.path,
          type: snapshot.type,
          locale: snapshot.locale,
          format: snapshot.format,
          frontmatter: snapshot.frontmatter,
          body: snapshot.body,
          isDeleted: false,
          hasUnpublishedChanges: false,
          version: nextVersion,
          publishedVersion: nextVersion,
          draftRevision: existing.draftRevision + 1,
          updatedBy: actorId,
          updatedAt: now,
        };
        store.set(normalizedDocumentId, restored);
        return restored;
      }

      const restored: ContentDocument = {
        ...existing,
        path: snapshot.path,
        type: snapshot.type,
        locale: snapshot.locale,
        format: snapshot.format,
        frontmatter: snapshot.frontmatter,
        body: snapshot.body,
        isDeleted: false,
        hasUnpublishedChanges: true,
        draftRevision: existing.draftRevision + 1,
        updatedBy: actorId,
        updatedAt: now,
      };
      store.set(normalizedDocumentId, restored);

      return restored;
    },

    async publish(scope, documentId, input) {
      const store = getScopeStore(scope);
      const publishedSnapshots = getScopePublishedSnapshots(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing || existing.isDeleted) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const documentSnapshots =
        publishedSnapshots.get(normalizedDocumentId) ?? new Map();
      if (!publishedSnapshots.has(normalizedDocumentId)) {
        publishedSnapshots.set(normalizedDocumentId, documentSnapshots);
      }

      const nextVersion = getNextVersionNumber(documentSnapshots);
      const actorId = input.actorId?.trim() || DEFAULT_ACTOR;
      const now = new Date().toISOString();

      documentSnapshots.set(nextVersion, {
        version: nextVersion,
        path: existing.path,
        type: existing.type,
        locale: existing.locale,
        format: existing.format,
        frontmatter: existing.frontmatter,
        body: existing.body,
        publishedAt: now,
        publishedBy: actorId,
        changeSummary: input.changeSummary,
      });

      const updated: ContentDocument = {
        ...existing,
        version: nextVersion,
        publishedVersion: nextVersion,
        hasUnpublishedChanges: false,
        updatedBy: actorId,
        updatedAt: now,
      };

      store.set(normalizedDocumentId, updated);
      return updated;
    },

    async unpublish(scope, documentId, input) {
      const store = getScopeStore(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const existing = store.get(normalizedDocumentId);

      if (!existing || existing.isDeleted) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const actorId = input.actorId?.trim() || DEFAULT_ACTOR;
      const now = new Date().toISOString();
      const updated: ContentDocument = {
        ...existing,
        version: 0,
        publishedVersion: null,
        hasUnpublishedChanges: true,
        updatedBy: actorId,
        updatedAt: now,
      };

      store.set(normalizedDocumentId, updated);
      return updated;
    },
  };
}

export type CreateDatabaseContentStoreOptions = {
  db: DrizzleDatabase;
};

export function createDatabaseContentStore(
  options: CreateDatabaseContentStoreOptions,
): ContentStore {
  const { db } = options;

  async function resolveScopeIds(
    scope: { project: string; environment: string },
    createIfMissing: boolean,
  ): Promise<{ projectId: string; environmentId: string } | undefined> {
    const resolvedScope = await resolveProjectEnvironmentScope(db, {
      project: scope.project,
      environment: scope.environment,
      createIfMissing,
    });

    if (!resolvedScope) {
      return undefined;
    }

    return {
      projectId: resolvedScope.project.id,
      environmentId: resolvedScope.environment.id,
    };
  }

  async function findPathConflict(
    scopeIds: { projectId: string; environmentId: string },
    input: { path: string; locale: string; documentId?: string },
  ): Promise<typeof documents.$inferSelect | undefined> {
    const baseConditions: SQL[] = [
      eq(documents.projectId, scopeIds.projectId),
      eq(documents.environmentId, scopeIds.environmentId),
      eq(documents.path, input.path),
      eq(documents.locale, input.locale),
      eq(documents.isDeleted, false),
    ];

    if (input.documentId) {
      baseConditions.push(ne(documents.documentId, input.documentId));
    }

    return db.query.documents.findFirst({
      where: and(...baseConditions),
    });
  }

  async function findTranslationLocaleConflict(
    scopeIds: { projectId: string; environmentId: string },
    input: {
      translationGroupId: string;
      locale: string;
      documentId?: string;
    },
  ): Promise<typeof documents.$inferSelect | undefined> {
    const baseConditions: SQL[] = [
      eq(documents.projectId, scopeIds.projectId),
      eq(documents.environmentId, scopeIds.environmentId),
      eq(documents.translationGroupId, input.translationGroupId),
      eq(documents.locale, input.locale),
      eq(documents.isDeleted, false),
    ];

    if (input.documentId) {
      baseConditions.push(ne(documents.documentId, input.documentId));
    }

    return db.query.documents.findFirst({
      where: and(...baseConditions),
    });
  }

  async function resolveSourceDocument(
    scopeIds: { projectId: string; environmentId: string },
    sourceDocumentId: string,
  ): Promise<typeof documents.$inferSelect | undefined> {
    return db.query.documents.findFirst({
      where: and(
        eq(documents.projectId, scopeIds.projectId),
        eq(documents.environmentId, scopeIds.environmentId),
        eq(documents.documentId, sourceDocumentId),
        eq(documents.isDeleted, false),
      ),
    });
  }

  async function resolveVariantLocalePolicy(
    scopeIds: { projectId: string; environmentId: string },
    type: string,
  ): Promise<
    | {
        localized: boolean;
        supportedLocales?: Set<string>;
      }
    | undefined
  > {
    const [schemaEntry, schemaSync] = await Promise.all([
      db.query.schemaRegistryEntries.findFirst({
        where: and(
          eq(schemaRegistryEntries.projectId, scopeIds.projectId),
          eq(schemaRegistryEntries.environmentId, scopeIds.environmentId),
          eq(schemaRegistryEntries.schemaType, type),
        ),
      }),
      db.query.schemaSyncs.findFirst({
        where: and(
          eq(schemaSyncs.projectId, scopeIds.projectId),
          eq(schemaSyncs.environmentId, scopeIds.environmentId),
        ),
      }),
    ]);

    if (!schemaEntry) {
      return undefined;
    }

    return {
      localized: schemaEntry.localized,
      supportedLocales: readSupportedLocales(schemaSync?.rawConfigSnapshot),
    };
  }

  async function resolvePublishedSnapshot(
    scopeIds: { projectId: string; environmentId: string },
    headRow: typeof documents.$inferSelect,
  ): Promise<ContentDocument | undefined> {
    if (
      headRow.isDeleted ||
      headRow.publishedVersion === null ||
      headRow.publishedVersion === undefined
    ) {
      return undefined;
    }

    const versionRow = await db.query.documentVersions.findFirst({
      where: and(
        eq(documentVersions.projectId, scopeIds.projectId),
        eq(documentVersions.environmentId, scopeIds.environmentId),
        eq(documentVersions.documentId, headRow.documentId),
        eq(documentVersions.version, headRow.publishedVersion),
      ),
    });

    if (!versionRow) {
      return undefined;
    }

    return {
      documentId: headRow.documentId,
      translationGroupId: headRow.translationGroupId,
      project: "",
      environment: "",
      path: versionRow.path,
      type: versionRow.schemaType,
      locale: versionRow.locale,
      format: versionRow.contentFormat as ContentFormat,
      isDeleted: headRow.isDeleted,
      hasUnpublishedChanges: headRow.hasUnpublishedChanges,
      version: versionRow.version,
      publishedVersion: headRow.publishedVersion,
      draftRevision: headRow.draftRevision,
      frontmatter: versionRow.frontmatter as Record<string, unknown>,
      body: versionRow.body,
      createdBy: headRow.createdBy,
      createdAt: toIsoString(headRow.createdAt),
      updatedBy: headRow.updatedBy,
      updatedAt: toIsoString(versionRow.publishedAt),
    };
  }

  async function resolveHeadRow(
    scopeIds: { projectId: string; environmentId: string },
    documentId: string,
  ): Promise<typeof documents.$inferSelect | undefined> {
    return db.query.documents.findFirst({
      where: and(
        eq(documents.projectId, scopeIds.projectId),
        eq(documents.environmentId, scopeIds.environmentId),
        eq(documents.documentId, documentId),
      ),
    });
  }

  async function resolveVersionRow(
    scopeIds: { projectId: string; environmentId: string },
    documentId: string,
    version: number,
  ): Promise<typeof documentVersions.$inferSelect | undefined> {
    return db.query.documentVersions.findFirst({
      where: and(
        eq(documentVersions.projectId, scopeIds.projectId),
        eq(documentVersions.environmentId, scopeIds.environmentId),
        eq(documentVersions.documentId, documentId),
        eq(documentVersions.version, version),
      ),
    });
  }

  async function getNextVersionNumber(
    tx: DrizzleDatabase,
    documentId: string,
  ): Promise<number> {
    const [latestVersionRow] = await tx
      .select({
        value: sql<number>`coalesce(max(${documentVersions.version}), 0)`,
      })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId));

    return (latestVersionRow?.value ?? 0) + 1;
  }

  async function insertPublishedVersionRow(
    tx: DrizzleDatabase,
    input: {
      headRow: typeof documents.$inferSelect;
      snapshot: {
        path: string;
        type: string;
        locale: string;
        format: ContentFormat;
        frontmatter: Record<string, unknown>;
        body: string;
      };
      version: number;
      actorId: string;
      changeSummary?: string;
    },
  ): Promise<void> {
    await tx.insert(documentVersions).values({
      documentId: input.headRow.documentId,
      translationGroupId: input.headRow.translationGroupId,
      projectId: input.headRow.projectId,
      environmentId: input.headRow.environmentId,
      schemaType: input.snapshot.type,
      locale: input.snapshot.locale,
      contentFormat: input.snapshot.format,
      path: input.snapshot.path,
      body: input.snapshot.body,
      frontmatter: input.snapshot.frontmatter,
      version: input.version,
      publishedBy: input.actorId,
      changeSummary: input.changeSummary ?? null,
    });
  }

  function applyListFilters(
    document: ContentDocument,
    query: {
      type?: string;
      path?: string;
      locale?: string;
      slug?: string;
      published?: boolean;
      isDeleted?: boolean;
      hasUnpublishedChanges?: boolean;
      q?: string;
    },
  ): boolean {
    if (query.type && document.type !== query.type) {
      return false;
    }

    if (query.path && !document.path.startsWith(query.path)) {
      return false;
    }

    if (query.locale && document.locale !== query.locale) {
      return false;
    }

    if (
      query.slug &&
      String(document.frontmatter.slug ?? "").trim() !== query.slug
    ) {
      return false;
    }

    if (query.published !== undefined) {
      const isPublished = document.publishedVersion !== null;

      if (isPublished !== query.published) {
        return false;
      }
    }

    if (
      query.isDeleted !== undefined &&
      document.isDeleted !== query.isDeleted
    ) {
      return false;
    }

    if (
      query.hasUnpublishedChanges !== undefined &&
      document.hasUnpublishedChanges !== query.hasUnpublishedChanges
    ) {
      return false;
    }

    if (query.q) {
      const haystack =
        `${document.path}\n${document.body}\n${JSON.stringify(document.frontmatter)}`.toLowerCase();

      if (!haystack.includes(query.q)) {
        return false;
      }
    }

    return true;
  }

  function sortDocuments(
    rows: ContentDocument[],
    sort: SortField,
    order: SortOrder,
  ): ContentDocument[] {
    rows.sort((left, right) => {
      let compared = 0;

      if (sort === "path") {
        compared = left.path.localeCompare(right.path);
      } else if (sort === "createdAt") {
        compared = left.createdAt.localeCompare(right.createdAt);
      } else {
        compared = left.updatedAt.localeCompare(right.updatedAt);
      }

      return order === "asc" ? compared : compared * -1;
    });

    return rows;
  }

  return {
    async create(scope, payload) {
      const path = assertRequiredString(payload.path, "path");
      const type = assertRequiredString(payload.type, "type");
      const locale = assertRequiredString(payload.locale, "locale");
      const sourceDocumentId = parseOptionalString(
        payload.sourceDocumentId,
        "sourceDocumentId",
      );
      const body = assertRequiredString(payload.body, "body", {
        allowEmpty: true,
      });
      const frontmatter = assertJsonObject(payload.frontmatter, "frontmatter");
      const format = parseContentFormat(payload.format);
      const scopeIds = await resolveScopeIds(scope, true);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "INVALID_TARGET_ROUTING",
          message: "Requested project/environment target does not exist.",
          statusCode: 404,
        });
      }

      const sourceDocument = sourceDocumentId
        ? await resolveSourceDocument(scopeIds, sourceDocumentId)
        : undefined;

      if (sourceDocumentId && !sourceDocument) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: sourceDocumentId,
          },
        });
      }

      if (sourceDocument && sourceDocument.schemaType !== type) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message:
            'Field "type" must match the source document type when creating a translation variant.',
          statusCode: 400,
          details: {
            field: "type",
            sourceDocumentId,
          },
        });
      }

      if (sourceDocument) {
        const variantLocalePolicy = await resolveVariantLocalePolicy(
          scopeIds,
          type,
        );

        if (variantLocalePolicy && !variantLocalePolicy.localized) {
          throw new RuntimeError({
            code: "INVALID_INPUT",
            message:
              'Field "sourceDocumentId" can only be used with localized schema types.',
            statusCode: 400,
            details: {
              field: "sourceDocumentId",
              sourceDocumentId,
              type,
            },
          });
        }

        if (
          variantLocalePolicy?.supportedLocales &&
          !variantLocalePolicy.supportedLocales.has(locale)
        ) {
          throw new RuntimeError({
            code: "INVALID_INPUT",
            message:
              'Field "locale" must resolve to a supported locale when creating a translation variant.',
            statusCode: 400,
            details: {
              field: "locale",
              locale,
              sourceDocumentId,
              supportedLocales: [...variantLocalePolicy.supportedLocales].sort(
                (left, right) => left.localeCompare(right),
              ),
            },
          });
        }
      }

      const conflict = await findPathConflict(scopeIds, {
        path,
        locale,
      });

      if (conflict) {
        throw new RuntimeError({
          code: "CONTENT_PATH_CONFLICT",
          message:
            "A non-deleted document with the same path and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: conflict.documentId,
            path,
            locale,
          },
        });
      }

      const translationGroupId =
        sourceDocument?.translationGroupId ?? randomUUID();
      const translationConflict = await findTranslationLocaleConflict(
        scopeIds,
        {
          translationGroupId,
          locale,
        },
      );

      if (translationConflict) {
        throw new RuntimeError({
          code: "TRANSLATION_VARIANT_CONFLICT",
          message:
            "A non-deleted document with the same translation group and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: translationConflict.documentId,
            translationGroupId,
            locale,
          },
        });
      }

      const actor = payload.createdBy?.trim() || DEFAULT_ACTOR;

      try {
        const [created] = await db
          .insert(documents)
          .values({
            documentId: randomUUID(),
            translationGroupId,
            projectId: scopeIds.projectId,
            environmentId: scopeIds.environmentId,
            path,
            schemaType: type,
            locale,
            contentFormat: format,
            body,
            frontmatter,
            isDeleted: false,
            hasUnpublishedChanges: true,
            publishedVersion: null,
            draftRevision: 1,
            createdBy: actor,
            updatedBy: actor,
          })
          .returning();

        if (!created) {
          throw new RuntimeError({
            code: "INTERNAL_ERROR",
            message: "Failed to create content document.",
            statusCode: 500,
          });
        }

        return toContentDocument(scope, created);
      } catch (error) {
        if (isUniqueViolation(error)) {
          const pathConflict = await findPathConflict(scopeIds, {
            path,
            locale,
          });

          if (pathConflict) {
            throw new RuntimeError({
              code: "CONTENT_PATH_CONFLICT",
              message:
                "A non-deleted document with the same path and locale already exists.",
              statusCode: 409,
              details: {
                conflictDocumentId: pathConflict.documentId,
                path,
                locale,
              },
            });
          }

          const translationConflict = await findTranslationLocaleConflict(
            scopeIds,
            {
              translationGroupId,
              locale,
            },
          );

          if (translationConflict) {
            throw new RuntimeError({
              code: "TRANSLATION_VARIANT_CONFLICT",
              message:
                "A non-deleted document with the same translation group and locale already exists.",
              statusCode: 409,
              details: {
                conflictDocumentId: translationConflict.documentId,
                translationGroupId,
                locale,
              },
            });
          }

          if (
            getUniqueConstraintName(error) ===
            "uniq_documents_active_translation_locale"
          ) {
            throw new RuntimeError({
              code: "TRANSLATION_VARIANT_CONFLICT",
              message:
                "A non-deleted document with the same translation group and locale already exists.",
              statusCode: 409,
              details: {
                translationGroupId,
                locale,
              },
            });
          }

          throw new RuntimeError({
            code: "CONTENT_PATH_CONFLICT",
            message:
              "A non-deleted document with the same path and locale already exists.",
            statusCode: 409,
            details: {
              path,
              locale,
            },
          });
        }

        throw error;
      }
    },

    async list(scope, query) {
      const limit = parsePositiveInt(query.limit, "limit", {
        defaultValue: DEFAULT_LIMIT,
        min: 1,
        max: MAX_LIMIT,
      });
      const offset = parsePositiveInt(query.offset, "offset", {
        defaultValue: 0,
        min: 0,
      });
      const published = parseBoolean(query.published, "published");
      const isDeleted = parseBoolean(query.isDeleted, "isDeleted");
      const hasUnpublishedChanges = parseBoolean(
        query.hasUnpublishedChanges,
        "hasUnpublishedChanges",
      );
      const draft = parseBoolean(query.draft, "draft") === true;

      const sort = parseSortField(query.sort);
      const order = parseSortOrder(query.order);
      const normalizedType = query.type?.trim();
      const normalizedPath = query.path?.trim();
      const normalizedLocale = query.locale?.trim();
      const normalizedSlug = query.slug?.trim();
      const normalizedQ = query.q?.trim().toLowerCase();
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        return {
          rows: [],
          total: 0,
          limit,
          offset,
        };
      }

      const headRows = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.projectId, scopeIds.projectId),
            eq(documents.environmentId, scopeIds.environmentId),
          ),
        );

      const resolvedRows: ContentDocument[] = [];

      for (const row of headRows) {
        if (draft) {
          resolvedRows.push(toContentDocument(scope, row));
          continue;
        }

        const publishedSnapshot = await resolvePublishedSnapshot(scopeIds, row);

        if (publishedSnapshot) {
          resolvedRows.push({
            ...publishedSnapshot,
            project: scope.project,
            environment: scope.environment,
          });
        }
      }

      const filteredRows = resolvedRows.filter((document) =>
        applyListFilters(document, {
          type: normalizedType,
          path: normalizedPath,
          locale: normalizedLocale,
          slug: normalizedSlug,
          published,
          isDeleted,
          hasUnpublishedChanges,
          q: normalizedQ,
        }),
      );
      const sortedRows = sortDocuments(filteredRows, sort, order);
      const total = sortedRows.length;

      return {
        rows: sortedRows.slice(offset, offset + limit),
        total,
        limit,
        offset,
      };
    },

    async getById(scope, documentId, options) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        return undefined;
      }

      const row = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, scopeIds.projectId),
          eq(documents.environmentId, scopeIds.environmentId),
          eq(documents.documentId, normalizedDocumentId),
        ),
      });

      if (!row) {
        return undefined;
      }

      if (options?.draft === true) {
        return toContentDocument(scope, row);
      }

      const publishedSnapshot = await resolvePublishedSnapshot(scopeIds, row);

      if (!publishedSnapshot) {
        return undefined;
      }

      return {
        ...publishedSnapshot,
        project: scope.project,
        environment: scope.environment,
      };
    },

    async update(scope, documentId, payload) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const existing = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, scopeIds.projectId),
          eq(documents.environmentId, scopeIds.environmentId),
          eq(documents.documentId, normalizedDocumentId),
          eq(documents.isDeleted, false),
        ),
      });

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const nextPath =
        payload.path !== undefined
          ? assertRequiredString(payload.path, "path")
          : existing.path;
      const nextLocale =
        payload.locale !== undefined
          ? assertRequiredString(payload.locale, "locale")
          : existing.locale;
      const conflict = await findPathConflict(scopeIds, {
        path: nextPath,
        locale: nextLocale,
        documentId: normalizedDocumentId,
      });

      if (conflict) {
        throw new RuntimeError({
          code: "CONTENT_PATH_CONFLICT",
          message:
            "A non-deleted document with the same path and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: conflict.documentId,
            path: nextPath,
            locale: nextLocale,
          },
        });
      }

      const translationConflict = await findTranslationLocaleConflict(
        scopeIds,
        {
          translationGroupId: existing.translationGroupId,
          locale: nextLocale,
          documentId: normalizedDocumentId,
        },
      );

      if (translationConflict) {
        throw new RuntimeError({
          code: "TRANSLATION_VARIANT_CONFLICT",
          message:
            "A non-deleted document with the same translation group and locale already exists.",
          statusCode: 409,
          details: {
            conflictDocumentId: translationConflict.documentId,
            translationGroupId: existing.translationGroupId,
            locale: nextLocale,
          },
        });
      }

      try {
        const [updated] = await db
          .update(documents)
          .set({
            path: nextPath,
            schemaType:
              payload.type !== undefined
                ? assertRequiredString(payload.type, "type")
                : existing.schemaType,
            locale: nextLocale,
            contentFormat:
              payload.format !== undefined
                ? parseContentFormat(payload.format)
                : (existing.contentFormat as ContentFormat),
            frontmatter:
              payload.frontmatter !== undefined
                ? assertJsonObject(payload.frontmatter, "frontmatter")
                : (existing.frontmatter as Record<string, unknown>),
            body:
              payload.body !== undefined
                ? assertRequiredString(payload.body, "body", {
                    allowEmpty: true,
                  })
                : existing.body,
            hasUnpublishedChanges: true,
            draftRevision: existing.draftRevision + 1,
            updatedBy: payload.updatedBy?.trim() || DEFAULT_ACTOR,
            updatedAt: new Date(),
          })
          .where(eq(documents.documentId, normalizedDocumentId))
          .returning();

        if (!updated) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
          });
        }

        return toContentDocument(scope, updated);
      } catch (error) {
        if (isUniqueViolation(error)) {
          const pathConflict = await findPathConflict(scopeIds, {
            path: nextPath,
            locale: nextLocale,
            documentId: normalizedDocumentId,
          });

          if (pathConflict) {
            throw new RuntimeError({
              code: "CONTENT_PATH_CONFLICT",
              message:
                "A non-deleted document with the same path and locale already exists.",
              statusCode: 409,
              details: {
                conflictDocumentId: pathConflict.documentId,
                path: nextPath,
                locale: nextLocale,
              },
            });
          }

          const translationConflict = await findTranslationLocaleConflict(
            scopeIds,
            {
              translationGroupId: existing.translationGroupId,
              locale: nextLocale,
              documentId: normalizedDocumentId,
            },
          );

          if (translationConflict) {
            throw new RuntimeError({
              code: "TRANSLATION_VARIANT_CONFLICT",
              message:
                "A non-deleted document with the same translation group and locale already exists.",
              statusCode: 409,
              details: {
                conflictDocumentId: translationConflict.documentId,
                translationGroupId: existing.translationGroupId,
                locale: nextLocale,
              },
            });
          }

          if (
            getUniqueConstraintName(error) ===
            "uniq_documents_active_translation_locale"
          ) {
            throw new RuntimeError({
              code: "TRANSLATION_VARIANT_CONFLICT",
              message:
                "A non-deleted document with the same translation group and locale already exists.",
              statusCode: 409,
              details: {
                translationGroupId: existing.translationGroupId,
                locale: nextLocale,
              },
            });
          }

          throw new RuntimeError({
            code: "CONTENT_PATH_CONFLICT",
            message:
              "A non-deleted document with the same path and locale already exists.",
            statusCode: 409,
            details: {
              path: nextPath,
              locale: nextLocale,
            },
          });
        }

        throw error;
      }
    },

    async softDelete(scope, documentId) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const [updated] = await db
        .update(documents)
        .set({
          isDeleted: true,
          hasUnpublishedChanges: true,
          draftRevision: sql`${documents.draftRevision} + 1`,
          updatedBy: DEFAULT_ACTOR,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.projectId, scopeIds.projectId),
            eq(documents.environmentId, scopeIds.environmentId),
            eq(documents.documentId, normalizedDocumentId),
          ),
        )
        .returning();

      if (!updated) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      return toContentDocument(scope, updated);
    },

    async restore(scope, documentId) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const existing = await resolveHeadRow(scopeIds, normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const conflict = await findPathConflict(scopeIds, {
        path: existing.path,
        locale: existing.locale,
        documentId: normalizedDocumentId,
      });

      if (conflict) {
        throw buildContentPathConflict({
          conflictDocumentId: conflict.documentId,
          path: existing.path,
          locale: existing.locale,
        });
      }

      if (!existing.isDeleted) {
        return toContentDocument(scope, existing);
      }

      const [updated] = await db
        .update(documents)
        .set({
          isDeleted: false,
          updatedBy: DEFAULT_ACTOR,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.projectId, scopeIds.projectId),
            eq(documents.environmentId, scopeIds.environmentId),
            eq(documents.documentId, normalizedDocumentId),
          ),
        )
        .returning();

      if (!updated) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      return toContentDocument(scope, updated);
    },

    async listVersions(scope, documentId) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const existing = await resolveHeadRow(scopeIds, normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const rows = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.projectId, scopeIds.projectId),
            eq(documentVersions.environmentId, scopeIds.environmentId),
            eq(documentVersions.documentId, normalizedDocumentId),
          ),
        );

      return rows
        .sort((left, right) => right.version - left.version)
        .map((row) => toContentVersionDocument(scope, row));
    },

    async getVersion(scope, documentId, version) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const existing = await resolveHeadRow(scopeIds, normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const versionRow = await resolveVersionRow(
        scopeIds,
        normalizedDocumentId,
        version,
      );

      if (!versionRow) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Version not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
            version,
          },
        });
      }

      return toContentVersionDocument(scope, versionRow);
    },

    async restoreVersion(scope, documentId, version, input) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const existing = await resolveHeadRow(scopeIds, normalizedDocumentId);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const versionRow = await resolveVersionRow(
        scopeIds,
        normalizedDocumentId,
        version,
      );

      if (!versionRow) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Version not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
            version,
          },
        });
      }

      const conflict = await findPathConflict(scopeIds, {
        path: versionRow.path,
        locale: versionRow.locale,
        documentId: normalizedDocumentId,
      });

      if (conflict) {
        throw buildContentPathConflict({
          conflictDocumentId: conflict.documentId,
          path: versionRow.path,
          locale: versionRow.locale,
        });
      }

      const actorId = input.actorId?.trim() || DEFAULT_ACTOR;
      const restoredDocument = await db.transaction(async (tx) => {
        const baseUpdate = {
          path: versionRow.path,
          schemaType: versionRow.schemaType,
          locale: versionRow.locale,
          contentFormat: versionRow.contentFormat as ContentFormat,
          frontmatter: versionRow.frontmatter as Record<string, unknown>,
          body: versionRow.body,
          isDeleted: false,
          draftRevision: existing.draftRevision + 1,
          updatedBy: actorId,
          updatedAt: new Date(),
        };

        if (input.targetStatus === "published") {
          const nextVersion = await getNextVersionNumber(
            tx as unknown as DrizzleDatabase,
            normalizedDocumentId,
          );

          await insertPublishedVersionRow(tx as unknown as DrizzleDatabase, {
            headRow: existing,
            snapshot: {
              path: versionRow.path,
              type: versionRow.schemaType,
              locale: versionRow.locale,
              format: versionRow.contentFormat as ContentFormat,
              frontmatter: versionRow.frontmatter as Record<string, unknown>,
              body: versionRow.body,
            },
            version: nextVersion,
            actorId,
            changeSummary: input.changeSummary,
          });

          const [updated] = await tx
            .update(documents)
            .set({
              ...baseUpdate,
              publishedVersion: nextVersion,
              hasUnpublishedChanges: false,
            })
            .where(
              and(
                eq(documents.projectId, scopeIds.projectId),
                eq(documents.environmentId, scopeIds.environmentId),
                eq(documents.documentId, normalizedDocumentId),
              ),
            )
            .returning();

          if (!updated) {
            throw new RuntimeError({
              code: "NOT_FOUND",
              message: "Document not found.",
              statusCode: 404,
              details: {
                documentId: normalizedDocumentId,
              },
            });
          }

          return updated;
        }

        const [updated] = await tx
          .update(documents)
          .set({
            ...baseUpdate,
            hasUnpublishedChanges: true,
          })
          .where(
            and(
              eq(documents.projectId, scopeIds.projectId),
              eq(documents.environmentId, scopeIds.environmentId),
              eq(documents.documentId, normalizedDocumentId),
            ),
          )
          .returning();

        if (!updated) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: normalizedDocumentId,
            },
          });
        }

        return updated;
      });

      return toContentDocument(scope, restoredDocument);
    },

    async publish(scope, documentId, input) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const existing = await db.query.documents.findFirst({
        where: and(
          eq(documents.projectId, scopeIds.projectId),
          eq(documents.environmentId, scopeIds.environmentId),
          eq(documents.documentId, normalizedDocumentId),
          eq(documents.isDeleted, false),
        ),
      });

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const actorId = input.actorId?.trim() || DEFAULT_ACTOR;
      const publishedDocument = await db.transaction(async (tx) => {
        const nextVersion = await getNextVersionNumber(
          tx as unknown as DrizzleDatabase,
          normalizedDocumentId,
        );

        await insertPublishedVersionRow(tx as unknown as DrizzleDatabase, {
          headRow: existing,
          snapshot: {
            path: existing.path,
            type: existing.schemaType,
            locale: existing.locale,
            format: existing.contentFormat as ContentFormat,
            frontmatter: existing.frontmatter as Record<string, unknown>,
            body: existing.body,
          },
          version: nextVersion,
          actorId,
          changeSummary: input.changeSummary,
        });

        const [updated] = await tx
          .update(documents)
          .set({
            publishedVersion: nextVersion,
            hasUnpublishedChanges: false,
            updatedBy: actorId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documents.projectId, scopeIds.projectId),
              eq(documents.environmentId, scopeIds.environmentId),
              eq(documents.documentId, normalizedDocumentId),
            ),
          )
          .returning();

        if (!updated) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: normalizedDocumentId,
            },
          });
        }

        return updated;
      });

      return toContentDocument(scope, publishedDocument);
    },

    async unpublish(scope, documentId, input) {
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      const scopeIds = await resolveScopeIds(scope, false);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      const actorId = input.actorId?.trim() || DEFAULT_ACTOR;
      const [updated] = await db
        .update(documents)
        .set({
          publishedVersion: null,
          hasUnpublishedChanges: true,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.projectId, scopeIds.projectId),
            eq(documents.environmentId, scopeIds.environmentId),
            eq(documents.documentId, normalizedDocumentId),
            eq(documents.isDeleted, false),
          ),
        )
        .returning();

      if (!updated) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
          details: {
            documentId: normalizedDocumentId,
          },
        });
      }

      return toContentDocument(scope, updated);
    },
  };
}

export type ContentRequestAuthorizer = (
  request: Request,
  requirement: AuthorizationRequirement,
) => Promise<unknown>;

export type MountContentApiRoutesOptions = {
  store: ContentStore;
  authorize: ContentRequestAuthorizer;
};

function resolveContentReadScope(
  query: ContentListQuery,
): ApiKeyOperationScope {
  const draft = parseBoolean(query.draft, "draft");
  return draft === true ? "content:read:draft" : "content:read";
}

export function mountContentApiRoutes(
  app: unknown,
  options: MountContentApiRoutesOptions,
): void {
  const contentApp = app as ContentRouteApp;

  contentApp.get?.("/api/v1/content", ({ request, query }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const scope = pickScope(request);
      const typedQuery = query as ContentListQuery;
      const requestedPath = typedQuery.path?.trim();
      await options.authorize(request, {
        requiredScope: resolveContentReadScope(typedQuery),
        project: scope.project,
        environment: scope.environment,
        documentPath:
          requestedPath && requestedPath.length > 0 ? requestedPath : undefined,
      });
      const result = await options.store.list(scope, typedQuery);

      return {
        data: result.rows.map((row) => toDocumentResponse(row)),
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total,
        },
      };
    });
  });

  contentApp.get?.(
    "/api/v1/content/:documentId",
    ({ request, params, query }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        const typedQuery = query as ContentListQuery;
        const requiredScope = resolveContentReadScope(typedQuery);
        const draft = parseBoolean(typedQuery.draft, "draft") === true;

        await options.authorize(request, {
          requiredScope,
          project: scope.project,
          environment: scope.environment,
        });
        const document = await options.store.getById(scope, params.documentId, {
          draft,
        });

        if (!document || document.isDeleted) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope,
          project: scope.project,
          environment: scope.environment,
          documentPath: document.path,
        });

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.get?.(
    "/api/v1/content/:documentId/versions",
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);

        await options.authorize(request, {
          requiredScope: "content:read",
          project: scope.project,
          environment: scope.environment,
        });

        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:read",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });

        const versions = await options.store.listVersions(
          scope,
          params.documentId,
        );

        for (const path of new Set(versions.map((version) => version.path))) {
          if (path !== existing.path) {
            await options.authorize(request, {
              requiredScope: "content:read",
              project: scope.project,
              environment: scope.environment,
              documentPath: path,
            });
          }
        }

        return {
          data: versions.map((version) => toVersionSummaryResponse(version)),
        };
      });
    },
  );

  contentApp.get?.(
    "/api/v1/content/:documentId/versions/:version",
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        const version = parsePathInt(params.version, "version");

        await options.authorize(request, {
          requiredScope: "content:read",
          project: scope.project,
          environment: scope.environment,
        });

        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:read",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });

        const versionDocument = await options.store.getVersion(
          scope,
          params.documentId,
          version,
        );

        if (versionDocument.path !== existing.path) {
          await options.authorize(request, {
            requiredScope: "content:read",
            project: scope.project,
            environment: scope.environment,
            documentPath: versionDocument.path,
          });
        }

        return {
          data: toVersionDocumentResponse(versionDocument),
        };
      });
    },
  );

  contentApp.post?.("/api/v1/content", ({ request, body }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const scope = pickScope(request);
      const payload = (body ?? {}) as ContentWritePayload;
      const requestedPath =
        typeof payload.path === "string" ? payload.path.trim() : undefined;
      await options.authorize(request, {
        requiredScope: "content:write",
        project: scope.project,
        environment: scope.environment,
        documentPath:
          requestedPath && requestedPath.length > 0 ? requestedPath : undefined,
      });
      const document = await options.store.create(scope, payload);

      return {
        data: toDocumentResponse(document),
      };
    });
  });

  contentApp.put?.(
    "/api/v1/content/:documentId",
    ({ request, params, body }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        const payload = (body ?? {}) as ContentWritePayload;

        await options.authorize(request, {
          requiredScope: "content:write",
          project: scope.project,
          environment: scope.environment,
        });
        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing || existing.isDeleted) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:write",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });
        const nextPath =
          payload.path !== undefined
            ? assertRequiredString(payload.path, "path")
            : existing.path;

        if (nextPath !== existing.path) {
          await options.authorize(request, {
            requiredScope: "content:write",
            project: scope.project,
            environment: scope.environment,
            documentPath: nextPath,
          });
        }
        const document = await options.store.update(
          scope,
          params.documentId,
          payload,
        );

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.post?.(
    "/api/v1/content/:documentId/restore",
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);

        await options.authorize(request, {
          requiredScope: "content:write",
          project: scope.project,
          environment: scope.environment,
        });

        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:write",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });

        const document = await options.store.restore(scope, params.documentId);

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.post?.(
    "/api/v1/content/:documentId/versions/:version/restore",
    ({ request, params, body }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        const payload = (body ?? {}) as ContentRestoreVersionPayload;
        const targetStatus = parseRestoreTargetStatus(payload.targetStatus);
        const requiredScope =
          targetStatus === "published" ? "content:publish" : "content:write";
        const version = parsePathInt(params.version, "version");

        await options.authorize(request, {
          requiredScope,
          project: scope.project,
          environment: scope.environment,
        });

        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope,
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });

        const versionDocument = await options.store.getVersion(
          scope,
          params.documentId,
          version,
        );

        if (versionDocument.path !== existing.path) {
          await options.authorize(request, {
            requiredScope,
            project: scope.project,
            environment: scope.environment,
            documentPath: versionDocument.path,
          });
        }

        const changeSummary = parseOptionalString(
          payload.changeSummary ?? payload.change_summary,
          "changeSummary",
        );
        const actorId = parseOptionalString(payload.actorId, "actorId");
        const document = await options.store.restoreVersion(
          scope,
          params.documentId,
          version,
          {
            targetStatus,
            changeSummary,
            actorId,
          },
        );

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.post?.(
    "/api/v1/content/:documentId/publish",
    ({ request, params, body }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        await options.authorize(request, {
          requiredScope: "content:publish",
          project: scope.project,
          environment: scope.environment,
        });
        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing || existing.isDeleted) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:publish",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });

        const payload = (body ?? {}) as ContentPublishPayload;
        const changeSummary = parseOptionalString(
          payload.changeSummary ?? payload.change_summary,
          "changeSummary",
        );
        const actorId = parseOptionalString(payload.actorId, "actorId");
        const document = await options.store.publish(scope, params.documentId, {
          changeSummary,
          actorId,
        });

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.post?.(
    "/api/v1/content/:documentId/unpublish",
    ({ request, params, body }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        await options.authorize(request, {
          requiredScope: "content:publish",
          project: scope.project,
          environment: scope.environment,
        });
        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing || existing.isDeleted) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:publish",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });

        const payload = (body ?? {}) as ContentPublishPayload;
        const actorId = parseOptionalString(payload.actorId, "actorId");
        const document = await options.store.unpublish(
          scope,
          params.documentId,
          {
            actorId,
          },
        );

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.delete?.(
    "/api/v1/content/:documentId",
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const scope = pickScope(request);
        await options.authorize(request, {
          requiredScope: "content:delete",
          project: scope.project,
          environment: scope.environment,
        });
        const existing = await options.store.getById(scope, params.documentId, {
          draft: true,
        });

        if (!existing) {
          throw new RuntimeError({
            code: "NOT_FOUND",
            message: "Document not found.",
            statusCode: 404,
            details: {
              documentId: params.documentId,
            },
          });
        }

        await options.authorize(request, {
          requiredScope: "content:delete",
          project: scope.project,
          environment: scope.environment,
          documentPath: existing.path,
        });
        const document = await options.store.softDelete(
          scope,
          params.documentId,
        );

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );
}
