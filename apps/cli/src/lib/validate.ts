import type {
  SchemaRegistryFieldSnapshot,
  SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export type ValidateCandidate = {
  path: string;
  typeName: string;
  frontmatter: Record<string, unknown>;
};

export type DocumentValidationResult = {
  path: string;
  errors: string[];
  warnings: string[];
};

/**
 * Validate a frontmatter object against a schema snapshot.
 *
 * Validates each field defined in `typeSnapshot.fields`, collecting per-field error messages,
 * and emits warnings for any keys present in `frontmatter` that are not defined on the snapshot.
 *
 * @param frontmatter - The document frontmatter to validate
 * @param typeSnapshot - Schema snapshot describing the expected fields and their schemas
 * @returns A ValidationResult containing `errors` (field-specific error messages) and `warnings` (unknown-field notices)
 */
export function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  typeSnapshot: SchemaRegistryTypeSnapshot,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(typeSnapshot.fields)) {
    const value = frontmatter[fieldName];
    const fieldErrors = validateField(value, fieldSchema, fieldName);
    errors.push(...fieldErrors);
  }

  for (const key of Object.keys(frontmatter)) {
    if (!(key in typeSnapshot.fields)) {
      warnings.push(
        `Unknown field "${key}" is not defined in schema for type "${typeSnapshot.type}".`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validate an array of document candidates against a resolved schema and produce per-document validation results.
 *
 * @param candidates - Documents to validate, each containing `path`, `typeName`, and `frontmatter`
 * @param resolvedSchema - Mapping from content type names to their schema snapshots used for validation
 * @returns An array of validation results where each entry contains the document `path`, an `errors` list, and a `warnings` list. If a candidate's `typeName` is not found in `resolvedSchema`, its result will contain a single error indicating the missing content type.
 */
export function validateCandidates(
  candidates: ValidateCandidate[],
  resolvedSchema: Record<string, SchemaRegistryTypeSnapshot>,
): DocumentValidationResult[] {
  return candidates.map((candidate) => {
    const typeSnapshot = resolvedSchema[candidate.typeName];

    if (!typeSnapshot) {
      return {
        path: candidate.path,
        errors: [
          `Content type "${candidate.typeName}" not found in resolved schema.`,
        ],
        warnings: [],
      };
    }

    const { errors, warnings } = validateFrontmatter(
      candidate.frontmatter,
      typeSnapshot,
    );

    return {
      path: candidate.path,
      errors,
      warnings,
    };
  });
}

/**
 * Validate a single frontmatter field value against its field schema and return any validation errors.
 *
 * @param value - The field value to validate (may be `undefined` or `null`)
 * @param schema - The field schema snapshot describing kind, nullability, requirement, default, and nested item/fields
 * @param path - The dotted/bracketed path used in error messages (e.g., `author.name` or `tags[0]`)
 * @returns An array of validation error messages for the given field; empty if the value is valid
 *
 * Validation notes:
 * - If `value` is `null` and `schema.nullable` is `false`, returns an error stating null is not allowed.
 * - If `value` is `undefined`, `schema.required` is `true`, and `schema.default` is `undefined`, returns an error stating the required field is missing.
 * - If a present, non-`null` value is provided, performs kind-specific validation and returns any resulting errors.
 */
function validateField(
  value: unknown,
  schema: SchemaRegistryFieldSnapshot,
  path: string,
): string[] {
  if (value === undefined || value === null) {
    if (value === null && !schema.nullable) {
      return [`Field "${path}" is null but schema does not allow nullable.`];
    }

    if (
      value === undefined &&
      schema.required &&
      schema.default === undefined
    ) {
      return [`Missing required field "${path}" (kind: ${schema.kind}).`];
    }

    return [];
  }

  const kindErrors = validateKind(value, schema, path);
  return kindErrors;
}

/**
 * Validate a value against the field schema's declared kind and produce any validation error messages.
 *
 * @param value - The value to validate.
 * @param schema - The field schema snapshot that declares the expected kind and related constraints.
 * @param path - The field path used in constructed error messages (e.g., `frontmatter.title` or `items[0].name`).
 * @returns An array of error message strings describing kind or constraint violations; empty when the value conforms to the schema.
 */
function validateKind(
  value: unknown,
  schema: SchemaRegistryFieldSnapshot,
  path: string,
): string[] {
  switch (schema.kind) {
    case "string":
      return typeof value === "string"
        ? []
        : [`Field "${path}" expected kind "string", got ${typeof value}.`];

    case "number":
      return typeof value === "number"
        ? []
        : [`Field "${path}" expected kind "number", got ${typeof value}.`];

    case "boolean":
      return typeof value === "boolean"
        ? []
        : [`Field "${path}" expected kind "boolean", got ${typeof value}.`];

    case "date":
      return typeof value === "string" || value instanceof Date
        ? []
        : [
            `Field "${path}" expected kind "date" (ISO string), got ${typeof value}.`,
          ];

    case "enum":
    case "literal": {
      const options = schema.options ?? [];
      return options.includes(value as string | number | boolean)
        ? []
        : [
            `Field "${path}" value ${JSON.stringify(value)} is not in allowed options: ${JSON.stringify(options)}.`,
          ];
    }

    case "array":
      return validateArrayField(value, schema, path);

    case "object":
      return validateObjectField(value, schema, path);

    default:
      return [];
  }
}

/**
 * Validate that a value is an array and validate each element against the field's item schema.
 *
 * @param value - The value to validate.
 * @param schema - Field schema snapshot; if `schema.item` is provided each array element is validated against it.
 * @param path - Field path used in error messages; element paths are formed by appending `[index]`.
 * @returns An array of validation error messages for the array and its elements; empty if there are no errors.
 */
function validateArrayField(
  value: unknown,
  schema: SchemaRegistryFieldSnapshot,
  path: string,
): string[] {
  if (!Array.isArray(value)) {
    return [`Field "${path}" expected kind "array", got ${typeof value}.`];
  }

  if (!schema.item) {
    return [];
  }

  const errors: string[] = [];
  for (let i = 0; i < value.length; i++) {
    errors.push(...validateField(value[i], schema.item, `${path}[${i}]`));
  }
  return errors;
}

/**
 * Validates that `value` is a non-null, non-array object and validates its nested fields against `schema.fields`, returning any validation errors.
 *
 * @param value - The value to validate as an object
 * @param schema - The field schema snapshot describing expected nested fields
 * @param path - The dotted path used to identify the field in returned error messages
 * @returns An array of error messages describing any validation failures; empty if the value and all nested fields are valid
 */
function validateObjectField(
  value: unknown,
  schema: SchemaRegistryFieldSnapshot,
  path: string,
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [
      `Field "${path}" expected kind "object", got ${Array.isArray(value) ? "array" : typeof value}.`,
    ];
  }

  if (!schema.fields) {
    return [];
  }

  const errors: string[] = [];
  const record = value as Record<string, unknown>;

  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    errors.push(
      ...validateField(record[fieldName], fieldSchema, `${path}.${fieldName}`),
    );
  }

  return errors;
}
