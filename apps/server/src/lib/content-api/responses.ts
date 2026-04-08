import type {
  ContentDocumentResponse,
  ContentVersionDocumentResponse,
  ContentVersionSummaryResponse,
  SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";
import { RuntimeError } from "@mdcms/shared";

import { documents, documentVersions } from "../db/schema.js";

import { isRecord } from "./parsing.js";
import type {
  ContentDocument,
  ContentFormat,
  ContentScope,
  ContentVersionDocument,
  ContentVersionSummary,
} from "./types.js";

export function toDocumentResponse(
  document: ContentDocument,
): ContentDocumentResponse {
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
    updatedBy: document.updatedBy,
    updatedAt: document.updatedAt,
  };
}

export function toVersionSummaryResponse(
  document: ContentVersionSummary,
): ContentVersionSummaryResponse {
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

export function toVersionDocumentResponse(
  document: ContentVersionDocument,
): ContentVersionDocumentResponse {
  return {
    ...toVersionSummaryResponse(document),
    frontmatter: document.frontmatter,
    body: document.body,
  };
}

export function toIsoString(value: unknown): string {
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

export function isUniqueViolation(error: unknown): boolean {
  return getDatabaseErrorObjects(error).some(
    (candidate) => candidate.code === "23505",
  );
}

export function getUniqueConstraintName(error: unknown): string | undefined {
  for (const candidate of getDatabaseErrorObjects(error)) {
    const constraint = candidate.constraint_name ?? candidate.constraint;

    if (typeof constraint === "string") {
      return constraint;
    }
  }

  return undefined;
}

export function readSupportedLocales(
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

export function toContentDocument(
  scope: ContentScope,
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

/**
 * Create a ContentVersionDocument from a documentVersions row and the given scope.
 *
 * @param scope - Content scope containing `project` and `environment`
 * @param row - A row selected from the `documentVersions` table
 * @returns A ContentVersionDocument containing identifiers, project/environment, versioning and routing fields, content format, ISO-formatted `publishedAt`, `publishedBy`, optional `changeSummary`, `frontmatter`, and `body`
 */
export function toContentVersionDocument(
  scope: ContentScope,
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

/**
 * Filter frontmatter to only the keys declared in a schema's fields.
 *
 * If `schema` is `undefined`, the original `frontmatter` is returned unchanged.
 *
 * @param frontmatter - The frontmatter object to filter
 * @param schema - Schema snapshot whose `fields` define allowed keys; when omitted, no filtering is performed
 * @returns The filtered frontmatter containing only keys present in `schema.fields`, or the original `frontmatter` if `schema` is `undefined`
 */
export function stripUnknownFrontmatterFields(
  frontmatter: Record<string, unknown>,
  schema: SchemaRegistryTypeSnapshot | undefined,
): Record<string, unknown> {
  if (!schema) {
    return frontmatter;
  }

  const stripped: Record<string, unknown> = {};
  for (const key of Object.keys(frontmatter)) {
    if (key in schema.fields) {
      stripped[key] = frontmatter[key];
    }
  }
  return stripped;
}

/**
 * Create a RuntimeError representing a content path conflict for a given path and locale.
 *
 * @param input - Details about the conflicting content
 * @param input.path - The content path that conflicts with an existing document
 * @param input.locale - The locale of the conflicting content
 * @param input.conflictDocumentId - Optional identifier of the existing conflicting document
 * @returns A RuntimeError with code `CONTENT_PATH_CONFLICT`, HTTP status 409, and `details` containing `conflictDocumentId`, `path`, and `locale`
 */
export function buildContentPathConflict(input: {
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
