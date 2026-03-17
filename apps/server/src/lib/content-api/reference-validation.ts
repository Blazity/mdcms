import {
  RuntimeError,
  type SchemaRegistryFieldSnapshot,
  type SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";

type ReferenceTargetRecord = {
  documentId: string;
  type: string;
  isDeleted: boolean;
};

type ReferenceTargetLookup = (
  documentId: string,
) => Promise<ReferenceTargetRecord | undefined>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createInvalidReferenceError(
  field: string,
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message: `Field "${field}" ${message}`,
    statusCode: 400,
    details: {
      field,
      ...details,
    },
  });
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

async function validateReferenceValue(input: {
  value: unknown;
  fieldPath: string;
  targetType: string;
  lookupTarget: ReferenceTargetLookup;
}): Promise<void> {
  if (typeof input.value !== "string" || !UUID_PATTERN.test(input.value)) {
    throw createInvalidReferenceError(
      input.fieldPath,
      `must be a UUID string referencing "${input.targetType}".`,
      {
        targetType: input.targetType,
      },
    );
  }

  const target = await input.lookupTarget(input.value);

  if (!target || target.isDeleted) {
    throw createInvalidReferenceError(
      input.fieldPath,
      `must reference a non-deleted "${input.targetType}" document in the target project/environment.`,
      {
        documentId: input.value,
        targetType: input.targetType,
      },
    );
  }

  if (target.type !== input.targetType) {
    throw createInvalidReferenceError(
      input.fieldPath,
      `must reference a "${input.targetType}" document.`,
      {
        documentId: input.value,
        targetType: input.targetType,
        actualType: target.type,
      },
    );
  }
}

async function validateFieldValue(input: {
  value: unknown;
  field: SchemaRegistryFieldSnapshot;
  fieldPath: string;
  lookupTarget: ReferenceTargetLookup;
}): Promise<void> {
  if (input.value === undefined || input.value === null) {
    return;
  }

  if (input.field.reference) {
    await validateReferenceValue({
      value: input.value,
      fieldPath: input.fieldPath,
      targetType: input.field.reference.targetType,
      lookupTarget: input.lookupTarget,
    });
    return;
  }

  if (input.field.kind === "object" && input.field.fields) {
    if (!containsReference(input.field)) {
      return;
    }

    if (!isRecord(input.value)) {
      throw createInvalidReferenceError(
        input.fieldPath,
        "must be an object because it contains reference fields.",
      );
    }

    for (const [fieldName, field] of Object.entries(input.field.fields)) {
      await validateFieldValue({
        value: input.value[fieldName],
        field,
        fieldPath: `${input.fieldPath}.${fieldName}`,
        lookupTarget: input.lookupTarget,
      });
    }

    return;
  }

  if (input.field.kind === "array" && input.field.item) {
    if (!containsReference(input.field)) {
      return;
    }

    if (!Array.isArray(input.value)) {
      throw createInvalidReferenceError(
        input.fieldPath,
        "must be an array because it contains reference fields.",
      );
    }

    for (const [index, entry] of input.value.entries()) {
      await validateFieldValue({
        value: entry,
        field: input.field.item,
        fieldPath: `${input.fieldPath}[${index}]`,
        lookupTarget: input.lookupTarget,
      });
    }
  }
}

export async function validateReferenceFieldIdentities(input: {
  schema: SchemaRegistryTypeSnapshot;
  frontmatter: Record<string, unknown>;
  lookupTarget: ReferenceTargetLookup;
}): Promise<void> {
  for (const [fieldName, field] of Object.entries(input.schema.fields)) {
    await validateFieldValue({
      value: input.frontmatter[fieldName],
      field,
      fieldPath: `frontmatter.${fieldName}`,
      lookupTarget: input.lookupTarget,
    });
  }
}
