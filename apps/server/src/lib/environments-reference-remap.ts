import {
  RuntimeError,
  type SchemaRegistryFieldSnapshot,
  type SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";

// Reference remap is invoked for every document copied or promoted between
// environments. It walks `frontmatter` using the type snapshot, finds every
// `field.reference` value (which is the `documentId` of a referenced doc in
// the source environment), and rewrites it to the target environment's
// `documentId` for the same `(translation_group_id, locale)` pair.
//
// SPEC-009 requires that any unresolved reference aborts the surrounding
// operation atomically. We surface that as a `REFERENCE_REMAP_FAILED` error
// (HTTP 409) — callers run inside a `db.transaction` so the throw rolls back
// every write attempted so far.

export type ReferenceLookupKey = {
  translationGroupId: string;
  locale: string;
};

export type ReferenceSourceLookup = (
  sourceDocumentId: string,
) => ReferenceLookupKey | undefined;

export type ReferenceTargetResolver = (
  key: ReferenceLookupKey,
) => string | undefined;

export type RemapResult = {
  frontmatter: Record<string, unknown>;
  remappedReferences: number;
};

export type RemapInput = {
  schema: SchemaRegistryTypeSnapshot | undefined;
  frontmatter: Record<string, unknown>;
  sourceLookup: ReferenceSourceLookup;
  targetResolver: ReferenceTargetResolver;
  // Used purely for error context when a reference fails to resolve.
  sourceDocumentId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsReference(field: SchemaRegistryFieldSnapshot): boolean {
  if (field.reference) {
    return true;
  }

  if (field.kind === "array" && field.item) {
    return containsReference(field.item);
  }

  if (field.kind === "object" && field.fields) {
    return Object.values(field.fields).some((entry) =>
      containsReference(entry),
    );
  }

  return false;
}

function buildRemapFailure(input: {
  sourceDocumentId: string;
  sourceReferenceId: string;
  fieldPath: string;
  reason: "unknown_source" | "no_target_match";
  targetType: string;
  key?: ReferenceLookupKey;
}): RuntimeError {
  return new RuntimeError({
    code: "REFERENCE_REMAP_FAILED",
    message:
      input.reason === "unknown_source"
        ? `Reference at "${input.fieldPath}" points to a source document (${input.sourceReferenceId}) that does not exist in the source environment.`
        : `Reference at "${input.fieldPath}" cannot be remapped: target environment has no document with translation group "${input.key?.translationGroupId}" and locale "${input.key?.locale}".`,
    statusCode: 409,
    details: {
      sourceDocumentId: input.sourceDocumentId,
      sourceReferenceId: input.sourceReferenceId,
      fieldPath: input.fieldPath,
      targetType: input.targetType,
      reason: input.reason,
      ...(input.key
        ? {
            translationGroupId: input.key.translationGroupId,
            locale: input.key.locale,
          }
        : {}),
    },
  });
}

function remapReferenceValue(input: {
  value: unknown;
  fieldPath: string;
  targetType: string;
  sourceLookup: ReferenceSourceLookup;
  targetResolver: ReferenceTargetResolver;
  sourceDocumentId: string;
}): { value: string; replaced: boolean } {
  if (typeof input.value !== "string") {
    // Non-string reference values are an upstream validation bug — surface as
    // remap failure so the operation is rolled back rather than producing a
    // corrupt target row.
    throw buildRemapFailure({
      sourceDocumentId: input.sourceDocumentId,
      sourceReferenceId: String(input.value),
      fieldPath: input.fieldPath,
      reason: "unknown_source",
      targetType: input.targetType,
    });
  }

  const sourceReferenceId = input.value;
  const key = input.sourceLookup(sourceReferenceId);
  if (!key) {
    throw buildRemapFailure({
      sourceDocumentId: input.sourceDocumentId,
      sourceReferenceId,
      fieldPath: input.fieldPath,
      reason: "unknown_source",
      targetType: input.targetType,
    });
  }

  const resolved = input.targetResolver(key);
  if (!resolved) {
    throw buildRemapFailure({
      sourceDocumentId: input.sourceDocumentId,
      sourceReferenceId,
      fieldPath: input.fieldPath,
      reason: "no_target_match",
      targetType: input.targetType,
      key,
    });
  }

  return {
    value: resolved,
    replaced: resolved !== sourceReferenceId,
  };
}

function remapFieldValue(input: {
  value: unknown;
  field: SchemaRegistryFieldSnapshot;
  fieldPath: string;
  sourceLookup: ReferenceSourceLookup;
  targetResolver: ReferenceTargetResolver;
  sourceDocumentId: string;
  counter: { count: number };
}): unknown {
  if (input.value === undefined || input.value === null) {
    return input.value;
  }

  if (input.field.reference) {
    const result = remapReferenceValue({
      value: input.value,
      fieldPath: input.fieldPath,
      targetType: input.field.reference.targetType,
      sourceLookup: input.sourceLookup,
      targetResolver: input.targetResolver,
      sourceDocumentId: input.sourceDocumentId,
    });
    if (result.replaced) {
      input.counter.count += 1;
    }
    return result.value;
  }

  if (input.field.kind === "object" && input.field.fields) {
    if (!containsReference(input.field)) {
      return input.value;
    }
    if (!isRecord(input.value)) {
      // Schema declares an object that contains references but the stored
      // value is not an object. Silently passing the value through would
      // commit unremapped reference IDs into the target — instead fail
      // fast so the surrounding transaction rolls back.
      throw new RuntimeError({
        code: "REFERENCE_REMAP_FAILED",
        message: `Field "${input.fieldPath}" must be an object because its schema contains reference fields.`,
        statusCode: 409,
        details: {
          sourceDocumentId: input.sourceDocumentId,
          fieldPath: input.fieldPath,
          reason: "container_shape_mismatch",
          expectedKind: "object",
          actualType: Array.isArray(input.value) ? "array" : typeof input.value,
        },
      });
    }
    const next: Record<string, unknown> = { ...input.value };
    for (const [fieldName, field] of Object.entries(input.field.fields)) {
      next[fieldName] = remapFieldValue({
        value: input.value[fieldName],
        field,
        fieldPath: `${input.fieldPath}.${fieldName}`,
        sourceLookup: input.sourceLookup,
        targetResolver: input.targetResolver,
        sourceDocumentId: input.sourceDocumentId,
        counter: input.counter,
      });
    }
    return next;
  }

  if (input.field.kind === "array" && input.field.item) {
    if (!containsReference(input.field)) {
      return input.value;
    }
    if (!Array.isArray(input.value)) {
      // Same reasoning as the object branch above — if the schema says
      // "array of references" but the stored value isn't an array, refuse
      // rather than commit unremapped ids.
      throw new RuntimeError({
        code: "REFERENCE_REMAP_FAILED",
        message: `Field "${input.fieldPath}" must be an array because its schema contains reference fields.`,
        statusCode: 409,
        details: {
          sourceDocumentId: input.sourceDocumentId,
          fieldPath: input.fieldPath,
          reason: "container_shape_mismatch",
          expectedKind: "array",
          actualType: isRecord(input.value) ? "object" : typeof input.value,
        },
      });
    }
    return input.value.map((entry, index) =>
      remapFieldValue({
        value: entry,
        field: input.field.item!,
        fieldPath: `${input.fieldPath}[${index}]`,
        sourceLookup: input.sourceLookup,
        targetResolver: input.targetResolver,
        sourceDocumentId: input.sourceDocumentId,
        counter: input.counter,
      }),
    );
  }

  return input.value;
}

export function remapFrontmatterReferences(input: RemapInput): RemapResult {
  if (!input.schema) {
    // Without a schema snapshot we cannot identify reference fields; copy
    // frontmatter through unchanged. The clone/promote orchestrator decides
    // whether to refuse the operation when `include.settings === false` and
    // no target schema sync is present (out of scope for this helper).
    return {
      frontmatter: input.frontmatter,
      remappedReferences: 0,
    };
  }

  const counter = { count: 0 };
  const next: Record<string, unknown> = { ...input.frontmatter };
  for (const [fieldName, field] of Object.entries(input.schema.fields)) {
    next[fieldName] = remapFieldValue({
      value: input.frontmatter[fieldName],
      field,
      fieldPath: `frontmatter.${fieldName}`,
      sourceLookup: input.sourceLookup,
      targetResolver: input.targetResolver,
      sourceDocumentId: input.sourceDocumentId,
      counter,
    });
  }
  return {
    frontmatter: next,
    remappedReferences: counter.count,
  };
}
