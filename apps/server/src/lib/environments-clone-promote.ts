import { randomUUID } from "node:crypto";

import {
  RuntimeError,
  type DocumentPromotionResult,
  type EnvironmentCloneInput,
  type EnvironmentCloneResult,
  type EnvironmentPromoteInput,
  type EnvironmentPromoteResult,
  type SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { DrizzleDatabase } from "./db.js";
import {
  documents,
  documentVersions,
  environments,
  schemaRegistryEntries,
  schemaSyncs,
} from "./db/schema.js";
import {
  remapFrontmatterReferences,
  type ReferenceLookupKey,
  type ReferenceSourceLookup,
  type ReferenceTargetResolver,
} from "./environments-reference-remap.js";
import { findProjectBySlug } from "./project-provisioning.js";

// `clone` and `promote` are two related but distinct write paths:
//
//   - clone: copy *all* (or all-published) source docs into a target env that
//     has no overlapping rows. New `documentId` per row, preserved
//     `translationGroupId`. Optional published-version snapshot copy.
//
//   - promote: per-document overwrite (or create) into a target env, by
//     `(translationGroupId, locale)`. Always auto-publishes the target.
//
// Both share the reference-remap helper and run inside a single transaction
// so any failure rolls back atomically (SPEC-009 #Reference remapping).

const DEFAULT_ACTOR = "00000000-0000-0000-0000-000000000001";

type ScopeRow = {
  projectId: string;
  sourceEnvId: string;
  targetEnvId: string;
};

type SourceDocumentRow = typeof documents.$inferSelect;

type SourceContext = {
  scope: ScopeRow;
  rows: SourceDocumentRow[];
  sourceLookup: ReferenceSourceLookup;
  schemaByType: Map<string, SchemaRegistryTypeSnapshot>;
};

function buildScopeError(message: string, details: Record<string, unknown>) {
  return new RuntimeError({
    code: "NOT_FOUND",
    message,
    statusCode: 404,
    details,
  });
}

function buildInvalidInputError(field: string, message: string) {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message,
    statusCode: 400,
    details: { field },
  });
}

function buildConflictError(message: string, details: Record<string, unknown>) {
  return new RuntimeError({
    code: "CONFLICT",
    message,
    statusCode: 409,
    details,
  });
}

async function loadProjectScope(
  db: DrizzleDatabase,
  input: { project: string; sourceEnvId: string; targetEnvId: string },
): Promise<ScopeRow> {
  if (input.sourceEnvId === input.targetEnvId) {
    throw buildInvalidInputError(
      "sourceEnvironmentId",
      "Source and target environments must differ.",
    );
  }

  const projectRow = await findProjectBySlug(db, input.project);
  if (!projectRow) {
    throw buildScopeError("Project not found.", { project: input.project });
  }

  const envRows = await db.query.environments.findMany({
    where: and(
      eq(environments.projectId, projectRow.id),
      inArray(environments.id, [input.sourceEnvId, input.targetEnvId]),
    ),
  });

  const envById = new Map(envRows.map((row) => [row.id, row]));
  const sourceEnv = envById.get(input.sourceEnvId);
  const targetEnv = envById.get(input.targetEnvId);

  if (!sourceEnv) {
    throw buildScopeError("Source environment not found in routed project.", {
      project: input.project,
      sourceEnvironmentId: input.sourceEnvId,
    });
  }
  if (!targetEnv) {
    throw buildScopeError("Target environment not found in routed project.", {
      project: input.project,
      targetEnvironmentId: input.targetEnvId,
    });
  }

  return {
    projectId: projectRow.id,
    sourceEnvId: sourceEnv.id,
    targetEnvId: targetEnv.id,
  };
}

async function loadSourceContext(
  db: DrizzleDatabase,
  scope: ScopeRow,
  options: { documentIds?: string[]; includeDrafts: boolean },
): Promise<SourceContext> {
  const baseConditions = [
    eq(documents.projectId, scope.projectId),
    eq(documents.environmentId, scope.sourceEnvId),
    eq(documents.isDeleted, false),
  ];

  if (options.documentIds && options.documentIds.length > 0) {
    baseConditions.push(inArray(documents.documentId, options.documentIds));
  }

  if (!options.includeDrafts) {
    baseConditions.push(sql`${documents.publishedVersion} is not null`);
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(...baseConditions));

  // The reference lookup needs *every* source document, not just the ones
  // we're about to copy/promote — promoted refs may point to source docs
  // outside the requested set, but their (translation_group_id, locale)
  // identity is enough to remap.
  const allSourceRows = options.documentIds
    ? await db
        .select({
          documentId: documents.documentId,
          translationGroupId: documents.translationGroupId,
          locale: documents.locale,
        })
        .from(documents)
        .where(
          and(
            eq(documents.projectId, scope.projectId),
            eq(documents.environmentId, scope.sourceEnvId),
            eq(documents.isDeleted, false),
          ),
        )
    : rows.map((row) => ({
        documentId: row.documentId,
        translationGroupId: row.translationGroupId,
        locale: row.locale,
      }));

  const sourceMap = new Map<string, ReferenceLookupKey>();
  for (const row of allSourceRows) {
    sourceMap.set(row.documentId, {
      translationGroupId: row.translationGroupId,
      locale: row.locale,
    });
  }

  const schemaRows = await db
    .select({
      schemaType: schemaRegistryEntries.schemaType,
      resolvedSchema: schemaRegistryEntries.resolvedSchema,
    })
    .from(schemaRegistryEntries)
    .where(
      and(
        eq(schemaRegistryEntries.projectId, scope.projectId),
        eq(schemaRegistryEntries.environmentId, scope.sourceEnvId),
      ),
    );

  const schemaByType = new Map<string, SchemaRegistryTypeSnapshot>();
  for (const row of schemaRows) {
    schemaByType.set(
      row.schemaType,
      row.resolvedSchema as SchemaRegistryTypeSnapshot,
    );
  }

  return {
    scope,
    rows,
    sourceLookup: (id) => sourceMap.get(id),
    schemaByType,
  };
}

function targetMapKey(key: ReferenceLookupKey): string {
  return `${key.translationGroupId}::${key.locale}`;
}

async function loadTargetMap(
  db: DrizzleDatabase,
  scope: ScopeRow,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      documentId: documents.documentId,
      translationGroupId: documents.translationGroupId,
      locale: documents.locale,
    })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, scope.projectId),
        eq(documents.environmentId, scope.targetEnvId),
        eq(documents.isDeleted, false),
      ),
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(
      targetMapKey({
        translationGroupId: row.translationGroupId,
        locale: row.locale,
      }),
      row.documentId,
    );
  }
  return map;
}

export type CloneEnvironmentInput = EnvironmentCloneInput & {
  project: string;
  targetEnvironmentId: string;
};

export async function cloneEnvironment(
  db: DrizzleDatabase,
  input: CloneEnvironmentInput,
): Promise<EnvironmentCloneResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as DrizzleDatabase;
    const scope = await loadProjectScope(txDb, {
      project: input.project,
      sourceEnvId: input.sourceEnvironmentId,
      targetEnvId: input.targetEnvironmentId,
    });

    if (input.include.settings) {
      await copyEnvironmentSettings(txDb, scope);
    }

    if (!input.include.content) {
      return {
        targetEnvironmentId: scope.targetEnvId,
        documentsCloned: 0,
      };
    }

    const sourceContext = await loadSourceContext(txDb, scope, {
      includeDrafts: input.includeDrafts,
    });

    if (sourceContext.rows.length === 0) {
      return {
        targetEnvironmentId: scope.targetEnvId,
        documentsCloned: 0,
      };
    }

    // Pre-allocate target document IDs so cross-document references inside
    // the cloned set resolve via the (translationGroupId, locale) key map.
    const targetIdByKey = new Map<string, string>();
    for (const row of sourceContext.rows) {
      const key = targetMapKey({
        translationGroupId: row.translationGroupId,
        locale: row.locale,
      });
      if (targetIdByKey.has(key)) {
        // Source data integrity: should never happen given the active unique
        // index `uniq_documents_active_translation_locale`. Surface clearly.
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message:
            "Source environment has duplicate (translation_group_id, locale) tuples for active documents.",
          statusCode: 500,
          details: {
            translationGroupId: row.translationGroupId,
            locale: row.locale,
          },
        });
      }
      targetIdByKey.set(key, randomUUID());
    }

    // Existing target documents (if any) participate in remap so that
    // cross-environment refs to docs already present in target still resolve.
    const existingTargetMap = await loadTargetMap(txDb, scope);
    const targetResolver: ReferenceTargetResolver = (key) => {
      const composed = targetMapKey(key);
      return targetIdByKey.get(composed) ?? existingTargetMap.get(composed);
    };

    const cloneActor = DEFAULT_ACTOR;
    let documentsCloned = 0;

    for (const row of sourceContext.rows) {
      const schema = sourceContext.schemaByType.get(row.schemaType);
      const remap = remapFrontmatterReferences({
        schema,
        frontmatter: row.frontmatter as Record<string, unknown>,
        sourceLookup: sourceContext.sourceLookup,
        targetResolver,
        sourceDocumentId: row.documentId,
      });

      const targetDocumentId = targetIdByKey.get(
        targetMapKey({
          translationGroupId: row.translationGroupId,
          locale: row.locale,
        }),
      )!;
      const hasPublishedSnapshot = row.publishedVersion !== null;

      try {
        await txDb.insert(documents).values({
          documentId: targetDocumentId,
          translationGroupId: row.translationGroupId,
          projectId: scope.projectId,
          environmentId: scope.targetEnvId,
          path: row.path,
          schemaType: row.schemaType,
          locale: row.locale,
          contentFormat: row.contentFormat,
          body: row.body,
          frontmatter: remap.frontmatter,
          isDeleted: false,
          hasUnpublishedChanges: !hasPublishedSnapshot,
          publishedVersion: null,
          draftRevision: 1,
          createdBy: cloneActor,
          updatedBy: cloneActor,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw buildConflictError(
            "Target environment already contains content that conflicts with the clone payload.",
            {
              targetEnvironmentId: scope.targetEnvId,
              path: row.path,
              locale: row.locale,
              translationGroupId: row.translationGroupId,
              preservePaths: input.preservePaths,
            },
          );
        }
        throw error;
      }

      if (hasPublishedSnapshot) {
        // Copy the latest published snapshot as version 1 in the target so
        // the target row can be served as published immediately. Full version
        // history is intentionally not copied (SPEC-009 #Cloning).
        await txDb.insert(documentVersions).values({
          documentId: targetDocumentId,
          translationGroupId: row.translationGroupId,
          projectId: scope.projectId,
          environmentId: scope.targetEnvId,
          schemaType: row.schemaType,
          locale: row.locale,
          contentFormat: row.contentFormat,
          path: row.path,
          body: row.body,
          frontmatter: remap.frontmatter,
          version: 1,
          publishedBy: cloneActor,
          changeSummary: "Cloned from source environment.",
        });
        await txDb
          .update(documents)
          .set({ publishedVersion: 1, hasUnpublishedChanges: false })
          .where(eq(documents.documentId, targetDocumentId));
      }

      documentsCloned += 1;
    }

    return {
      targetEnvironmentId: scope.targetEnvId,
      documentsCloned,
    };
  });
}

async function copyEnvironmentSettings(
  db: DrizzleDatabase,
  scope: ScopeRow,
): Promise<void> {
  const sourceSync = await db.query.schemaSyncs.findFirst({
    where: and(
      eq(schemaSyncs.projectId, scope.projectId),
      eq(schemaSyncs.environmentId, scope.sourceEnvId),
    ),
  });

  if (!sourceSync) {
    return;
  }

  await db
    .insert(schemaSyncs)
    .values({
      projectId: scope.projectId,
      environmentId: scope.targetEnvId,
      schemaHash: sourceSync.schemaHash,
      rawConfigSnapshot: sourceSync.rawConfigSnapshot,
    })
    .onConflictDoUpdate({
      target: [schemaSyncs.projectId, schemaSyncs.environmentId],
      set: {
        schemaHash: sourceSync.schemaHash,
        rawConfigSnapshot: sourceSync.rawConfigSnapshot,
        syncedAt: new Date(),
      },
    });

  const sourceRegistry = await db
    .select()
    .from(schemaRegistryEntries)
    .where(
      and(
        eq(schemaRegistryEntries.projectId, scope.projectId),
        eq(schemaRegistryEntries.environmentId, scope.sourceEnvId),
      ),
    );

  for (const entry of sourceRegistry) {
    await db
      .insert(schemaRegistryEntries)
      .values({
        projectId: scope.projectId,
        environmentId: scope.targetEnvId,
        schemaType: entry.schemaType,
        directory: entry.directory,
        localized: entry.localized,
        schemaHash: entry.schemaHash,
        resolvedSchema: entry.resolvedSchema,
      })
      .onConflictDoUpdate({
        target: [
          schemaRegistryEntries.projectId,
          schemaRegistryEntries.environmentId,
          schemaRegistryEntries.schemaType,
        ],
        set: {
          directory: entry.directory,
          localized: entry.localized,
          schemaHash: entry.schemaHash,
          resolvedSchema: entry.resolvedSchema,
          syncedAt: new Date(),
        },
      });
  }
}

export type PromoteEnvironmentInput = EnvironmentPromoteInput & {
  project: string;
  targetEnvironmentId: string;
};

export async function promoteDocuments(
  db: DrizzleDatabase,
  input: PromoteEnvironmentInput,
): Promise<EnvironmentPromoteResult> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as DrizzleDatabase;
    const scope = await loadProjectScope(txDb, {
      project: input.project,
      sourceEnvId: input.sourceEnvironmentId,
      targetEnvId: input.targetEnvironmentId,
    });

    const sourceContext = await loadSourceContext(txDb, scope, {
      documentIds: input.documentIds,
      // Promote loads all matching rows regardless of publish state; the
      // include-unpublished gate is applied below per-row to drive the
      // `skipped_unpublished` status in the result.
      includeDrafts: true,
    });

    const requestedSet = new Set(input.documentIds);
    const foundIds = new Set(sourceContext.rows.map((row) => row.documentId));
    const missing = [...requestedSet].filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw buildScopeError(
        "One or more document IDs were not found in the source environment.",
        {
          missingDocumentIds: missing,
          sourceEnvironmentId: scope.sourceEnvId,
        },
      );
    }

    const targetMap = await loadTargetMap(txDb, scope);

    // Pre-populate the target map with "would-be-created" ids for rows that
    // don't yet have a target match. This lets the remap walker resolve
    // references between docs in the same promoted batch — both during
    // dry-run (no writes) and during the real run (in-progress creations).
    // The pre-allocated id matches the id used by `createTargetDraft` when
    // the row is actually written.
    const preallocatedTargetIds = new Map<string, string>();
    for (const row of sourceContext.rows) {
      if (!input.includeUnpublished && row.publishedVersion === null) {
        continue;
      }
      const key = targetMapKey({
        translationGroupId: row.translationGroupId,
        locale: row.locale,
      });
      if (!targetMap.has(key)) {
        const allocated = randomUUID();
        targetMap.set(key, allocated);
        preallocatedTargetIds.set(key, allocated);
      }
    }

    const targetResolver: ReferenceTargetResolver = (key) =>
      targetMap.get(targetMapKey(key));

    const promoted: DocumentPromotionResult[] = [];
    const promoteActor = DEFAULT_ACTOR;

    for (const row of sourceContext.rows) {
      if (!input.includeUnpublished && row.publishedVersion === null) {
        promoted.push({
          sourceDocumentId: row.documentId,
          targetDocumentId:
            targetMap.get(
              targetMapKey({
                translationGroupId: row.translationGroupId,
                locale: row.locale,
              }),
            ) ?? null,
          status: "skipped_unpublished",
          path: row.path,
          locale: row.locale,
          type: row.schemaType,
          publishedVersion: null,
          remappedReferences: 0,
        });
        continue;
      }

      const schema = sourceContext.schemaByType.get(row.schemaType);
      const remap = remapFrontmatterReferences({
        schema,
        frontmatter: row.frontmatter as Record<string, unknown>,
        sourceLookup: sourceContext.sourceLookup,
        targetResolver,
        sourceDocumentId: row.documentId,
      });

      const key = targetMapKey({
        translationGroupId: row.translationGroupId,
        locale: row.locale,
      });
      const preallocatedId = preallocatedTargetIds.get(key);
      // `existingTargetId` is the *real* target id only if the row already
      // existed before this batch; preallocated ids represent rows we plan
      // to create within this same batch.
      const existingTargetId = preallocatedId ? undefined : targetMap.get(key);

      if (input.dryRun) {
        promoted.push({
          sourceDocumentId: row.documentId,
          targetDocumentId: existingTargetId ?? preallocatedId ?? null,
          status: existingTargetId ? "overwrote" : "created",
          path: row.path,
          locale: row.locale,
          type: row.schemaType,
          // We can't know the published version without doing the write; the
          // contract reports `null` for created and the *current* published
          // version for overwrote so consumers can show "v3 -> v4".
          publishedVersion: null,
          remappedReferences: remap.remappedReferences,
        });
        continue;
      }

      const targetDocumentId =
        existingTargetId ??
        (await createTargetDraft(txDb, {
          scope,
          source: row,
          remappedFrontmatter: remap.frontmatter,
          actor: promoteActor,
          preallocatedId,
        }));

      if (existingTargetId) {
        await overwriteTargetDraft(txDb, {
          scope,
          targetDocumentId: existingTargetId,
          source: row,
          remappedFrontmatter: remap.frontmatter,
          actor: promoteActor,
        });
      }

      const publishedVersion = await publishTargetDocument(txDb, {
        scope,
        targetDocumentId,
        source: row,
        remappedFrontmatter: remap.frontmatter,
        actor: promoteActor,
      });

      // Record the new target id so subsequent promoted rows that reference
      // this one can resolve via the in-progress map.
      targetMap.set(key, targetDocumentId);

      promoted.push({
        sourceDocumentId: row.documentId,
        targetDocumentId,
        status: existingTargetId ? "overwrote" : "created",
        path: row.path,
        locale: row.locale,
        type: row.schemaType,
        publishedVersion,
        remappedReferences: remap.remappedReferences,
      });
    }

    return { promoted };
  });
}

async function createTargetDraft(
  db: DrizzleDatabase,
  input: {
    scope: ScopeRow;
    source: SourceDocumentRow;
    remappedFrontmatter: Record<string, unknown>;
    actor: string;
    // When provided, used instead of generating a new UUID. The caller
    // pre-allocates these so cross-document references resolve via the
    // remap target map (and so dryRun reports the same id that the real
    // run would produce).
    preallocatedId?: string;
  },
): Promise<string> {
  const targetDocumentId = input.preallocatedId ?? randomUUID();
  try {
    await db.insert(documents).values({
      documentId: targetDocumentId,
      translationGroupId: input.source.translationGroupId,
      projectId: input.scope.projectId,
      environmentId: input.scope.targetEnvId,
      path: input.source.path,
      schemaType: input.source.schemaType,
      locale: input.source.locale,
      contentFormat: input.source.contentFormat,
      body: input.source.body,
      frontmatter: input.remappedFrontmatter,
      isDeleted: false,
      hasUnpublishedChanges: true,
      publishedVersion: null,
      draftRevision: 1,
      createdBy: input.actor,
      updatedBy: input.actor,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw buildConflictError(
        "Promote target conflicts with existing content (path or translation pair).",
        {
          targetEnvironmentId: input.scope.targetEnvId,
          path: input.source.path,
          locale: input.source.locale,
          translationGroupId: input.source.translationGroupId,
        },
      );
    }
    throw error;
  }
  return targetDocumentId;
}

async function overwriteTargetDraft(
  db: DrizzleDatabase,
  input: {
    scope: ScopeRow;
    targetDocumentId: string;
    source: SourceDocumentRow;
    remappedFrontmatter: Record<string, unknown>;
    actor: string;
  },
): Promise<void> {
  await db
    .update(documents)
    .set({
      schemaType: input.source.schemaType,
      contentFormat: input.source.contentFormat,
      body: input.source.body,
      frontmatter: input.remappedFrontmatter,
      path: input.source.path,
      locale: input.source.locale,
      isDeleted: false,
      hasUnpublishedChanges: true,
      draftRevision: sql`${documents.draftRevision} + 1`,
      updatedBy: input.actor,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.projectId, input.scope.projectId),
        eq(documents.environmentId, input.scope.targetEnvId),
        eq(documents.documentId, input.targetDocumentId),
      ),
    );
}

async function publishTargetDocument(
  db: DrizzleDatabase,
  input: {
    scope: ScopeRow;
    targetDocumentId: string;
    source: SourceDocumentRow;
    remappedFrontmatter: Record<string, unknown>;
    actor: string;
  },
): Promise<number> {
  const [latest] = await db
    .select({
      value: sql<number>`coalesce(max(${documentVersions.version}), 0)`,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, input.targetDocumentId));

  const nextVersion = (latest?.value ?? 0) + 1;
  await db.insert(documentVersions).values({
    documentId: input.targetDocumentId,
    translationGroupId: input.source.translationGroupId,
    projectId: input.scope.projectId,
    environmentId: input.scope.targetEnvId,
    schemaType: input.source.schemaType,
    locale: input.source.locale,
    contentFormat: input.source.contentFormat,
    path: input.source.path,
    body: input.source.body,
    frontmatter: input.remappedFrontmatter,
    version: nextVersion,
    publishedBy: input.actor,
    changeSummary: "Promoted from source environment.",
  });

  await db
    .update(documents)
    .set({
      publishedVersion: nextVersion,
      hasUnpublishedChanges: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.projectId, input.scope.projectId),
        eq(documents.environmentId, input.scope.targetEnvId),
        eq(documents.documentId, input.targetDocumentId),
      ),
    );

  return nextVersion;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}
