import {
  IMPLICIT_DEFAULT_LOCALE,
  RuntimeError,
  assertSchemaRegistrySyncPayload,
  resolveRequestTargetRouting,
  type JsonObject,
  type SchemaRegistryEntry,
  type SchemaRegistryFieldSnapshot,
  type SchemaRegistrySyncPayload,
  type SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";
import { and, eq, sql } from "drizzle-orm";

import type { ApiKeyOperationScope, AuthorizationRequirement } from "./auth.js";
import type { DrizzleDatabase } from "./db.js";
import {
  documents,
  environments,
  projects,
  schemaRegistryEntries,
  schemaSyncs,
} from "./db/schema.js";
import { executeWithRuntimeErrorsHandled } from "./http-utils.js";

type SchemaRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => SchemaRouteApp;
  put?: (path: string, handler: (ctx: any) => unknown) => SchemaRouteApp;
};

type SchemaRegistrySyncResult = {
  schemaHash: string;
  syncedAt: string;
  affectedTypes: string[];
};

type DocumentScopeSummary = {
  schemaType: string;
  locale: string;
  count: number;
};

type ScopeIds = {
  projectId: string;
  environmentId: string;
};

export type SchemaRegistryStore = {
  list: (scope: {
    project: string;
    environment: string;
  }) => Promise<SchemaRegistryEntry[]>;
  getByType: (
    scope: {
      project: string;
      environment: string;
    },
    type: string,
  ) => Promise<SchemaRegistryEntry | undefined>;
  sync: (
    scope: {
      project: string;
      environment: string;
    },
    payload: SchemaRegistrySyncPayload,
  ) => Promise<SchemaRegistrySyncResult>;
};

export type SchemaRequestAuthorizer = (
  request: Request,
  requirement: AuthorizationRequirement,
) => Promise<unknown>;

export type MountSchemaApiRoutesOptions = {
  store: SchemaRegistryStore;
  authorize: SchemaRequestAuthorizer;
};

export type CreateDatabaseSchemaStoreOptions = {
  db: DrizzleDatabase;
  now?: () => Date;
};

const DEFAULT_NOT_FOUND_MESSAGE = "Schema registry entry not found.";

function createInvalidInputError(
  field: string,
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message,
    statusCode: 400,
    details: {
      field,
      ...details,
    },
  });
}

function assertRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createInvalidInputError(field, `Field "${field}" is required.`);
  }

  return value.trim();
}

function pickScope(request: Request): { project: string; environment: string } {
  const scope = resolveRequestTargetRouting(request);

  if (!scope.project || !scope.environment) {
    throw new RuntimeError({
      code: "MISSING_TARGET_ROUTING",
      message:
        "Both project and environment are required for schema endpoints.",
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

function toIsoString(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value as any).toISOString();
}

function createSchemaIncompatibleError(
  message: string,
  details: Record<string, unknown>,
): RuntimeError {
  return new RuntimeError({
    code: "SCHEMA_INCOMPATIBLE",
    message,
    statusCode: 409,
    details,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSupportedLocales(
  rawConfigSnapshot: JsonObject,
): Set<string> | undefined {
  const locales = rawConfigSnapshot.locales;

  if (!isRecord(locales) || !Array.isArray(locales.supported)) {
    return undefined;
  }

  return new Set(
    locales.supported
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function assertSyncPayloadConsistency(
  payload: SchemaRegistrySyncPayload,
): void {
  const localesCandidate = payload.rawConfigSnapshot.locales;
  const localizedTypes = (
    Object.values(payload.resolvedSchema) as SchemaRegistryTypeSnapshot[]
  ).filter((typeSnapshot) => typeSnapshot.localized);

  if (localesCandidate !== undefined && !isRecord(localesCandidate)) {
    throw createInvalidInputError(
      "payload.rawConfigSnapshot.locales",
      'Field "rawConfigSnapshot.locales" must be an object when provided.',
      {
        path: "payload.rawConfigSnapshot.locales",
      },
    );
  }

  if (
    localesCandidate !== undefined &&
    !Array.isArray(localesCandidate.supported)
  ) {
    throw createInvalidInputError(
      "payload.rawConfigSnapshot.locales.supported",
      'Field "rawConfigSnapshot.locales.supported" must be an array when locales are provided.',
      {
        path: "payload.rawConfigSnapshot.locales.supported",
      },
    );
  }

  const supportedLocales = readSupportedLocales(payload.rawConfigSnapshot);

  if (
    localizedTypes.length > 0 &&
    (!supportedLocales || supportedLocales.size === 0)
  ) {
    throw createInvalidInputError(
      "payload.rawConfigSnapshot.locales.supported",
      'Field "rawConfigSnapshot.locales.supported" is required when any schema type is localized.',
      {
        path: "payload.rawConfigSnapshot.locales.supported",
        localizedTypes: localizedTypes.map((typeSnapshot) => typeSnapshot.type),
      },
    );
  }

  if (!supportedLocales) {
    return;
  }

  for (const locale of supportedLocales) {
    if (locale === IMPLICIT_DEFAULT_LOCALE) {
      throw createInvalidInputError(
        "payload.rawConfigSnapshot.locales.supported",
        `Field "rawConfigSnapshot.locales.supported" must not contain the reserved locale token "${IMPLICIT_DEFAULT_LOCALE}".`,
        {
          path: "payload.rawConfigSnapshot.locales.supported",
          locale,
        },
      );
    }
  }
}

function toSchemaRegistryEntry(
  row: typeof schemaRegistryEntries.$inferSelect,
): SchemaRegistryEntry {
  return {
    type: row.schemaType,
    directory: row.directory,
    localized: row.localized,
    schemaHash: row.schemaHash,
    syncedAt: toIsoString(row.syncedAt),
    resolvedSchema: row.resolvedSchema as SchemaRegistryTypeSnapshot,
  };
}

function collectNewlyRequiredFieldPaths(
  previous: SchemaRegistryFieldSnapshot | undefined,
  next: SchemaRegistryFieldSnapshot,
  path: string,
): string[] {
  const paths: string[] = [];

  if (!previous) {
    if (next.required) {
      paths.push(path);
    }
    return paths;
  }

  if (!previous.required && next.required) {
    paths.push(path);
  }

  if (
    previous.kind === "object" &&
    next.kind === "object" &&
    previous.fields &&
    next.fields
  ) {
    for (const [fieldName, nextField] of Object.entries(next.fields).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      paths.push(
        ...collectNewlyRequiredFieldPaths(
          previous.fields[fieldName],
          nextField,
          `${path}.${fieldName}`,
        ),
      );
    }
  }

  if (
    previous.kind === "array" &&
    next.kind === "array" &&
    previous.item &&
    next.item
  ) {
    paths.push(
      ...collectNewlyRequiredFieldPaths(previous.item, next.item, `${path}[]`),
    );
  }

  return paths;
}

function collectNewlyRequiredFieldPathsForType(
  previous: SchemaRegistryTypeSnapshot,
  next: SchemaRegistryTypeSnapshot,
): string[] {
  const paths: string[] = [];

  for (const [fieldName, nextField] of Object.entries(next.fields).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    paths.push(
      ...collectNewlyRequiredFieldPaths(
        previous.fields[fieldName],
        nextField,
        fieldName,
      ),
    );
  }

  return paths;
}

type BreakingFieldChange = {
  fieldPath: string;
  reason: "kind" | "reference_target";
  previousKind?: string;
  nextKind?: string;
  previousTarget?: string;
  nextTarget?: string;
};

function collectBreakingFieldChanges(
  previous: SchemaRegistryFieldSnapshot,
  next: SchemaRegistryFieldSnapshot,
  path: string,
): BreakingFieldChange[] {
  if (previous.kind !== next.kind) {
    return [
      {
        fieldPath: path,
        reason: "kind",
        previousKind: previous.kind,
        nextKind: next.kind,
      },
    ];
  }

  const previousTarget = previous.reference?.targetType;
  const nextTarget = next.reference?.targetType;

  if (previousTarget !== nextTarget && (previousTarget || nextTarget)) {
    return [
      {
        fieldPath: path,
        reason: "reference_target",
        previousKind: previous.kind,
        nextKind: next.kind,
        previousTarget,
        nextTarget,
      },
    ];
  }

  if (
    previous.kind === "object" &&
    next.kind === "object" &&
    previous.fields &&
    next.fields
  ) {
    return Object.entries(previous.fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([fieldName, previousField]) => {
        const nextField = next.fields?.[fieldName];

        if (!nextField) {
          return [];
        }

        return collectBreakingFieldChanges(
          previousField,
          nextField,
          `${path}.${fieldName}`,
        );
      });
  }

  if (
    previous.kind === "array" &&
    next.kind === "array" &&
    previous.item &&
    next.item
  ) {
    return collectBreakingFieldChanges(previous.item, next.item, `${path}[]`);
  }

  return [];
}

function collectBreakingFieldChangesForType(
  previous: SchemaRegistryTypeSnapshot,
  next: SchemaRegistryTypeSnapshot,
): BreakingFieldChange[] {
  return Object.entries(previous.fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([fieldName, previousField]) => {
      const nextField = next.fields[fieldName];

      if (!nextField) {
        return [];
      }

      return collectBreakingFieldChanges(previousField, nextField, fieldName);
    });
}

async function resolveScopeIds(
  db: DrizzleDatabase,
  scope: { project: string; environment: string },
): Promise<ScopeIds | undefined> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.slug, scope.project),
  });

  if (!project) {
    return undefined;
  }

  const environment = await db.query.environments.findFirst({
    where: and(
      eq(environments.projectId, project.id),
      eq(environments.name, scope.environment),
    ),
  });

  if (!environment) {
    return undefined;
  }

  return {
    projectId: project.id,
    environmentId: environment.id,
  };
}

async function loadDocumentScopeSummaries(
  db: DrizzleDatabase,
  scopeIds: ScopeIds,
): Promise<DocumentScopeSummary[]> {
  const rows = await db
    .select({
      schemaType: documents.schemaType,
      locale: documents.locale,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, scopeIds.projectId),
        eq(documents.environmentId, scopeIds.environmentId),
      ),
    )
    .groupBy(documents.schemaType, documents.locale);

  return rows.map((row) => ({
    schemaType: row.schemaType,
    locale: row.locale,
    count: row.count,
  }));
}

function assertSchemaCompatibility(input: {
  existingEntries: Map<string, SchemaRegistryTypeSnapshot>;
  documentSummaries: DocumentScopeSummary[];
  nextPayload: SchemaRegistrySyncPayload;
}) {
  // Schema sync replaces the registry head for the whole target environment, so
  // compatibility is evaluated against the incoming full snapshot rather than
  // field-by-field patches.
  const nextTypes = new Set(Object.keys(input.nextPayload.resolvedSchema));
  const documentCountsByType = new Map<string, number>();
  const activeLocalesByType = new Map<string, Set<string>>();

  for (const summary of input.documentSummaries) {
    documentCountsByType.set(
      summary.schemaType,
      (documentCountsByType.get(summary.schemaType) ?? 0) + summary.count,
    );

    let locales = activeLocalesByType.get(summary.schemaType);
    if (!locales) {
      locales = new Set<string>();
      activeLocalesByType.set(summary.schemaType, locales);
    }
    locales.add(summary.locale);
  }

  for (const [schemaType, count] of [...documentCountsByType.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (count > 0 && !nextTypes.has(schemaType)) {
      throw createSchemaIncompatibleError(
        `Removing schema type "${schemaType}" requires a migration because documents already exist in the target environment.`,
        {
          type: schemaType,
          reason: "type_removed_with_documents",
        },
      );
    }
  }

  const supportedLocales = readSupportedLocales(
    input.nextPayload.rawConfigSnapshot,
  );

  if (supportedLocales) {
    for (const summary of [...input.documentSummaries].sort(
      (left, right) =>
        left.locale.localeCompare(right.locale) ||
        left.schemaType.localeCompare(right.schemaType),
    )) {
      if (!supportedLocales.has(summary.locale)) {
        if (summary.locale === IMPLICIT_DEFAULT_LOCALE) {
          continue;
        }

        throw createSchemaIncompatibleError(
          `Removing supported locale "${summary.locale}" requires a migration because documents still exist in that locale.`,
          {
            locale: summary.locale,
            type: summary.schemaType,
            reason: "locale_removed_with_documents",
          },
        );
      }
    }
  }

  for (const [typeName, nextType] of (
    Object.entries(input.nextPayload.resolvedSchema) as Array<
      [string, SchemaRegistryTypeSnapshot]
    >
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const documentCount = documentCountsByType.get(typeName) ?? 0;

    if (documentCount === 0) {
      continue;
    }

    const previousType = input.existingEntries.get(typeName);

    if (previousType && previousType.localized !== nextType.localized) {
      throw createSchemaIncompatibleError(
        `Changing localization mode for schema type "${typeName}" requires a migration because documents already exist in the target environment.`,
        {
          type: typeName,
          previousLocalized: previousType.localized,
          nextLocalized: nextType.localized,
          reason: "localized_changed_with_documents",
        },
      );
    }

    const locales = activeLocalesByType.get(typeName) ?? new Set<string>();
    if (!nextType.localized && locales.size > 1) {
      throw createSchemaIncompatibleError(
        `Schema type "${typeName}" cannot become non-localized while documents still exist in multiple locales.`,
        {
          type: typeName,
          locales: [...locales].sort((left, right) =>
            left.localeCompare(right),
          ),
          reason: "localized_conflict_with_documents",
        },
      );
    }

    if (!previousType) {
      continue;
    }

    const newlyRequiredFieldPath = collectNewlyRequiredFieldPathsForType(
      previousType,
      nextType,
    )[0];

    if (newlyRequiredFieldPath) {
      throw createSchemaIncompatibleError(
        `Field "${newlyRequiredFieldPath}" cannot become required while documents already exist for schema type "${typeName}".`,
        {
          type: typeName,
          fieldPath: newlyRequiredFieldPath,
          reason: "required_field_added_with_documents",
        },
      );
    }

    const breakingChange = collectBreakingFieldChangesForType(
      previousType,
      nextType,
    )[0];

    if (breakingChange) {
      throw createSchemaIncompatibleError(
        `Field "${breakingChange.fieldPath}" changed incompatibly for schema type "${typeName}" and requires migration before sync can succeed.`,
        {
          type: typeName,
          fieldPath: breakingChange.fieldPath,
          reason:
            breakingChange.reason === "reference_target"
              ? "reference_target_changed_with_documents"
              : "field_kind_changed_with_documents",
          previousKind: breakingChange.previousKind,
          nextKind: breakingChange.nextKind,
          previousTarget: breakingChange.previousTarget,
          nextTarget: breakingChange.nextTarget,
        },
      );
    }
  }
}

export function createDatabaseSchemaStore(
  options: CreateDatabaseSchemaStoreOptions,
): SchemaRegistryStore {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  return {
    async list(scope) {
      const scopeIds = await resolveScopeIds(db, scope);

      if (!scopeIds) {
        return [];
      }

      const rows = await db
        .select()
        .from(schemaRegistryEntries)
        .where(
          and(
            eq(schemaRegistryEntries.projectId, scopeIds.projectId),
            eq(schemaRegistryEntries.environmentId, scopeIds.environmentId),
          ),
        );

      return rows
        .map((row) => toSchemaRegistryEntry(row))
        .sort((left, right) => left.type.localeCompare(right.type));
    },

    async getByType(scope, type) {
      const scopeIds = await resolveScopeIds(db, scope);

      if (!scopeIds) {
        return undefined;
      }

      const normalizedType = assertRequiredString(type, "type");
      const row = await db.query.schemaRegistryEntries.findFirst({
        where: and(
          eq(schemaRegistryEntries.projectId, scopeIds.projectId),
          eq(schemaRegistryEntries.environmentId, scopeIds.environmentId),
          eq(schemaRegistryEntries.schemaType, normalizedType),
        ),
      });

      return row ? toSchemaRegistryEntry(row) : undefined;
    },

    async sync(scope, payload) {
      const scopeIds = await resolveScopeIds(db, scope);

      if (!scopeIds) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Target project or environment not found.",
          statusCode: 404,
          details: {
            project: scope.project,
            environment: scope.environment,
          },
        });
      }

      return db.transaction(async (tx) => {
        const [existingEntryRows, documentSummaries] = await Promise.all([
          tx
            .select({
              schemaType: schemaRegistryEntries.schemaType,
              resolvedSchema: schemaRegistryEntries.resolvedSchema,
            })
            .from(schemaRegistryEntries)
            .where(
              and(
                eq(schemaRegistryEntries.projectId, scopeIds.projectId),
                eq(schemaRegistryEntries.environmentId, scopeIds.environmentId),
              ),
            ),
          loadDocumentScopeSummaries(
            tx as unknown as DrizzleDatabase,
            scopeIds,
          ),
        ]);

        assertSchemaCompatibility({
          existingEntries: new Map(
            existingEntryRows.map((row) => [
              row.schemaType,
              row.resolvedSchema as SchemaRegistryTypeSnapshot,
            ]),
          ),
          documentSummaries,
          nextPayload: payload,
        });

        const syncedAt = now();
        const affectedTypes = Object.keys(payload.resolvedSchema).sort(
          (left, right) => left.localeCompare(right),
        );

        await tx
          .insert(schemaSyncs)
          .values({
            projectId: scopeIds.projectId,
            environmentId: scopeIds.environmentId,
            schemaHash: payload.schemaHash,
            rawConfigSnapshot: payload.rawConfigSnapshot,
            extractedComponents: payload.extractedComponents ?? null,
            syncedAt,
          })
          .onConflictDoUpdate({
            target: [schemaSyncs.projectId, schemaSyncs.environmentId],
            set: {
              schemaHash: payload.schemaHash,
              rawConfigSnapshot: payload.rawConfigSnapshot,
              extractedComponents: payload.extractedComponents ?? null,
              syncedAt,
            },
          });

        await tx
          .delete(schemaRegistryEntries)
          .where(
            and(
              eq(schemaRegistryEntries.projectId, scopeIds.projectId),
              eq(schemaRegistryEntries.environmentId, scopeIds.environmentId),
            ),
          );

        if (affectedTypes.length > 0) {
          // Per-type rows are derived data from the environment sync head, so we
          // replace them wholesale after the compatibility gate passes.
          await tx.insert(schemaRegistryEntries).values(
            affectedTypes.map((typeName) => {
              const typeEntry = payload.resolvedSchema[typeName]!;

              return {
                projectId: scopeIds.projectId,
                environmentId: scopeIds.environmentId,
                schemaType: typeName,
                directory: typeEntry.directory,
                localized: typeEntry.localized,
                schemaHash: payload.schemaHash,
                resolvedSchema: typeEntry,
                syncedAt,
              };
            }),
          );
        }

        return {
          schemaHash: payload.schemaHash,
          syncedAt: syncedAt.toISOString(),
          affectedTypes,
        };
      });
    },
  };
}

export function mountSchemaApiRoutes(
  app: unknown,
  options: MountSchemaApiRoutesOptions,
): void {
  const schemaApp = app as SchemaRouteApp;

  schemaApp.get?.("/api/v1/schema", ({ request }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const scope = pickScope(request);

      await options.authorize(request, {
        requiredScope: "schema:read",
        project: scope.project,
        environment: scope.environment,
      });

      return {
        data: await options.store.list(scope),
      };
    });
  });

  schemaApp.get?.("/api/v1/schema/:type", ({ request, params }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const scope = pickScope(request);
      const type = assertRequiredString(params.type, "type");

      await options.authorize(request, {
        requiredScope: "schema:read",
        project: scope.project,
        environment: scope.environment,
      });

      const entry = await options.store.getByType(scope, type);

      if (!entry) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: DEFAULT_NOT_FOUND_MESSAGE,
          statusCode: 404,
          details: {
            type,
          },
        });
      }

      return {
        data: entry,
      };
    });
  });

  schemaApp.put?.("/api/v1/schema", ({ request, body }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const scope = pickScope(request);
      const payload = (body ?? {}) as unknown;

      assertSchemaRegistrySyncPayload(payload);
      assertSyncPayloadConsistency(payload);

      await options.authorize(request, {
        requiredScope: "schema:write" satisfies ApiKeyOperationScope,
        project: scope.project,
        environment: scope.environment,
      });

      return {
        data: await options.store.sync(scope, payload),
      };
    });
  });
}
