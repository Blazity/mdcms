import { randomUUID } from "node:crypto";

import {
  RuntimeError,
  resolveRequestTargetRouting,
  serializeError,
} from "@mdcms/shared";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Zod schemas & derived types                                       */
/* ------------------------------------------------------------------ */

const SortFieldSchema = z.enum(["createdAt", "updatedAt", "path"]);
const SortOrderSchema = z.enum(["asc", "desc"]);
const ContentFormatSchema = z.enum(["md", "mdx"]);

type SortField = z.infer<typeof SortFieldSchema>;
type SortOrder = z.infer<typeof SortOrderSchema>;
type ContentFormat = z.infer<typeof ContentFormatSchema>;

const JsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => !Array.isArray(v), { message: "must be an object" });

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
  createdBy?: string;
  updatedBy?: string;
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

/* ------------------------------------------------------------------ */
/*  Schema-based parse helpers                                        */
/* ------------------------------------------------------------------ */

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
    .transform((v) => Number.parseInt(v, 10))
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

function isRuntimeErrorLike(error: unknown): error is RuntimeError {
  if (error instanceof RuntimeError) {
    return true;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.statusCode === "number"
  );
}

function toRuntimeErrorResponse(
  error: RuntimeError,
  request: Request,
): Response {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const envelope = serializeError(error, { requestId });

  return new Response(JSON.stringify(envelope), {
    status: error.statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function executeWithRuntimeErrorsHandled(
  request: Request,
  run: () => unknown,
): unknown {
  try {
    return run();
  } catch (error) {
    if (isRuntimeErrorLike(error)) {
      return toRuntimeErrorResponse(error, request);
    }

    throw error;
  }
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

export type ContentStore = {
  create: (
    scope: { project: string; environment: string },
    payload: ContentWritePayload,
  ) => ContentDocument;
  list: (
    scope: { project: string; environment: string },
    query: ContentListQuery,
  ) => {
    rows: ContentDocument[];
    total: number;
    limit: number;
    offset: number;
  };
  getById: (
    scope: { project: string; environment: string },
    documentId: string,
  ) => ContentDocument | undefined;
  update: (
    scope: { project: string; environment: string },
    documentId: string,
    payload: ContentWritePayload,
  ) => ContentDocument;
  softDelete: (
    scope: { project: string; environment: string },
    documentId: string,
  ) => ContentDocument;
};

export function createInMemoryContentStore(): ContentStore {
  const scopedDocs = new Map<string, Map<string, ContentDocument>>();

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

  return {
    create(scope, payload) {
      const store = getScopeStore(scope);
      const path = assertRequiredString(payload.path, "path");
      const type = assertRequiredString(payload.type, "type");
      const locale = assertRequiredString(payload.locale, "locale");
      const body = assertRequiredString(payload.body, "body", {
        allowEmpty: true,
      });
      const frontmatter = assertJsonObject(payload.frontmatter, "frontmatter");
      const format = parseContentFormat(payload.format);
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

      const now = new Date().toISOString();
      const actor = payload.createdBy?.trim() || DEFAULT_ACTOR;
      const document: ContentDocument = {
        documentId: randomUUID(),
        translationGroupId: randomUUID(),
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

    list(scope, query) {
      const store = getScopeStore(scope);
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

      parseBoolean(query.draft, "draft");

      const normalizedType = query.type?.trim();
      const normalizedPath = query.path?.trim();
      const normalizedLocale = query.locale?.trim();
      const normalizedSlug = query.slug?.trim();
      const normalizedQ = query.q?.trim().toLowerCase();

      const rows = [...store.values()].filter((doc) => {
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

    getById(scope, documentId) {
      const store = getScopeStore(scope);
      const normalizedDocumentId = assertRequiredString(
        documentId,
        "documentId",
      );
      return store.get(normalizedDocumentId);
    },

    update(scope, documentId, payload) {
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

    softDelete(scope, documentId) {
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
  };
}

export type MountContentApiRoutesOptions = {
  store: ContentStore;
};

export function mountContentApiRoutes(
  app: unknown,
  options: MountContentApiRoutesOptions,
): void {
  const contentApp = app as ContentRouteApp;

  contentApp.get?.("/api/v1/content", ({ request, query }: any) => {
    return executeWithRuntimeErrorsHandled(request, () => {
      const scope = pickScope(request);
      const result = options.store.list(scope, query as ContentListQuery);

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
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, () => {
        const scope = pickScope(request);
        const document = options.store.getById(scope, params.documentId);

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

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );

  contentApp.post?.("/api/v1/content", ({ request, body }: any) => {
    return executeWithRuntimeErrorsHandled(request, () => {
      const scope = pickScope(request);
      const document = options.store.create(
        scope,
        (body ?? {}) as ContentWritePayload,
      );

      return {
        data: toDocumentResponse(document),
      };
    });
  });

  contentApp.put?.(
    "/api/v1/content/:documentId",
    ({ request, params, body }: any) => {
      return executeWithRuntimeErrorsHandled(request, () => {
        const scope = pickScope(request);
        const document = options.store.update(
          scope,
          params.documentId,
          (body ?? {}) as ContentWritePayload,
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
      return executeWithRuntimeErrorsHandled(request, () => {
        const scope = pickScope(request);
        const document = options.store.softDelete(scope, params.documentId);

        return {
          data: toDocumentResponse(document),
        };
      });
    },
  );
}
