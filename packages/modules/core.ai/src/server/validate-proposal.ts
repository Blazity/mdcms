import type {
  AiProposalCandidate,
  AiProposalValidator,
} from "./proposal-builder.js";
import type {
  AiProposalValidation,
  SchemaRegistryFieldSnapshot,
  SchemaRegistryTypeSnapshot,
} from "@mdcms/shared";

/**
 * Looks up a content type's schema for a given project + environment.
 * Returns `undefined` when the type isn't registered in the project,
 * which lets the validator emit `UNKNOWN_CONTENT_TYPE` instead of
 * throwing. The caller (the factory below) wraps a real DB-backed
 * lookup; the unit-test path passes an in-memory map.
 */
export type SchemaLookup = (input: {
  project: string;
  environment: string;
  type: string;
}) => Promise<SchemaRegistryTypeSnapshot | undefined>;

/**
 * Returns true when a non-deleted document already exists at the
 * given path within the project + environment. Used by the
 * create_document validator to flag `PATH_ALREADY_IN_USE` proposals.
 */
export type PathLookup = (input: {
  project: string;
  environment: string;
  path: string;
}) => Promise<boolean>;

/**
 * Returns true when a non-deleted document with the given documentId
 * exists in the project + environment. Used by the reference-field
 * validator to flag `UNKNOWN_REFERENCE` proposals.
 */
export type DocumentLookup = (input: {
  project: string;
  environment: string;
  documentId: string;
}) => Promise<boolean>;

/**
 * Construct a schema-aware proposal validator that gets wired into
 * the AI orchestrator. The validator catches three categories of
 * issue at proposal time so the Studio card surfaces them before the
 * user clicks Accept:
 *
 *   1. `UNKNOWN_CONTENT_TYPE` — the proposal's `type` isn't a content
 *      type registered for the project + environment.
 *   2. `MISSING_REQUIRED_FRONTMATTER` — the schema marks a field as
 *      required and the proposal's frontmatter doesn't include it.
 *   3. `UNKNOWN_FRONTMATTER_FIELD` — the proposal's frontmatter
 *      includes a key the schema doesn't define.
 *   4. `INVALID_FRONTMATTER_TYPE` — a frontmatter value's runtime kind
 *      doesn't match the schema field's declared `kind` (e.g. a
 *      string field receiving a number).
 *
 * Replace-selection and insert-block proposals are left shape-valid
 * for now — full MDX validation requires an MDX component catalog
 * that doesn't exist yet (tracked separately).
 */
export function createSchemaAwareProposalValidator(input: {
  schemaLookup: SchemaLookup;
  pathExists?: PathLookup;
  documentExists?: DocumentLookup;
}): AiProposalValidator {
  const { schemaLookup, pathExists, documentExists } = input;
  // documentExists is wired in T17; referenced here so TypeScript's
  // noUnusedLocals does not reject the scaffolding.
  void documentExists;

  return async (candidate: AiProposalCandidate): Promise<AiProposalValidation> => {
    switch (candidate.kind) {
      case "create_document":
        return validateCreateDocument(candidate, schemaLookup, pathExists);
      case "update_frontmatter":
        return validateUpdateFrontmatter(candidate, schemaLookup);
      case "delete_document":
      case "replace_selection":
      case "insert_block":
        // Shape-only for now. delete_document's published-version
        // check is already done by chat-tools at proposal-build time
        // and re-enforced by apply.ts at apply time. MDX component
        // validation requires the catalog (separate ticket).
        return { status: "valid" };
    }
  };
}

type ValidationError = {
  code: string;
  message: string;
  path?: string;
};

async function validateCreateDocument(
  candidate: AiProposalCandidate,
  schemaLookup: SchemaLookup,
  pathExists: PathLookup | undefined,
): Promise<AiProposalValidation> {
  const errors: ValidationError[] = [];

  const schema = await schemaLookup({
    project: candidate.project,
    environment: candidate.environment,
    type: candidate.type,
  });

  if (!schema) {
    errors.push({
      code: "UNKNOWN_CONTENT_TYPE",
      message: `Content type "${candidate.type}" is not registered in this project. Pick a type that matches a schema in the project (e.g. from the path's leading segment).`,
      path: "type",
    });
    // No further per-field checks possible without a schema — return
    // early with just the type error so the card is actionable.
    return { status: "invalid", errors };
  }

  // Find the operation. create_document proposals carry exactly one.
  const operation = candidate.operations[0];
  if (!operation || operation.op !== "create_document") {
    // Defensive — buildProposalsFromOutput already guarantees this
    // shape, but a corrupt candidate shouldn't crash the validator.
    return {
      status: "invalid",
      errors: [
        {
          code: "INVALID_OPERATION",
          message: "create_document proposal is missing its operation.",
        },
      ],
    };
  }

  const frontmatter = operation.frontmatter ?? {};
  validateFrontmatterAgainstSchema(frontmatter, schema, errors);

  if (pathExists) {
    const taken = await pathExists({
      project: candidate.project,
      environment: candidate.environment,
      path: operation.path,
    });
    if (taken) {
      errors.push({
        code: "PATH_ALREADY_IN_USE",
        message: `Path "${operation.path}" is already used by another document — pick a different path or update the existing doc instead.`,
        path: "operations[0].path",
      });
    }
  }

  return errors.length === 0
    ? { status: "valid" }
    : { status: "invalid", errors };
}

async function validateUpdateFrontmatter(
  candidate: AiProposalCandidate,
  schemaLookup: SchemaLookup,
): Promise<AiProposalValidation> {
  const errors: ValidationError[] = [];

  const schema = await schemaLookup({
    project: candidate.project,
    environment: candidate.environment,
    type: candidate.type,
  });

  if (!schema) {
    errors.push({
      code: "UNKNOWN_CONTENT_TYPE",
      message: `Content type "${candidate.type}" is not registered in this project.`,
      path: "type",
    });
    return { status: "invalid", errors };
  }

  const operation = candidate.operations[0];
  if (!operation || operation.op !== "update_frontmatter") {
    return {
      status: "invalid",
      errors: [
        {
          code: "INVALID_OPERATION",
          message: "update_frontmatter proposal is missing its operation.",
        },
      ],
    };
  }

  // Update is a shallow-merge patch: validate each key in the patch
  // is a known field and each value has the right shape. We do NOT
  // check `required` on update — the existing draft already has
  // those filled (or it would have failed create validation).
  for (const [key, value] of Object.entries(operation.patch)) {
    const field = schema.fields[key];
    if (!field) {
      errors.push({
        code: "UNKNOWN_FRONTMATTER_FIELD",
        message: `Field "${key}" is not defined in the "${schema.type}" schema.`,
        path: `patch.${key}`,
      });
      continue;
    }
    const typeError = checkFieldType(key, value, field, `patch.${key}`);
    if (typeError) errors.push(typeError);
  }

  return errors.length === 0
    ? { status: "valid" }
    : { status: "invalid", errors };
}

function validateFrontmatterAgainstSchema(
  frontmatter: Record<string, unknown>,
  schema: SchemaRegistryTypeSnapshot,
  errors: ValidationError[],
): void {
  // Missing required fields
  for (const [fieldName, field] of Object.entries(schema.fields)) {
    if (!field.required) continue;
    if (!(fieldName in frontmatter) || frontmatter[fieldName] === undefined) {
      errors.push({
        code: "MISSING_REQUIRED_FRONTMATTER",
        message: `Required field "${fieldName}" is missing from frontmatter.`,
        path: `frontmatter.${fieldName}`,
      });
    }
  }

  // Unknown fields + value-shape checks
  for (const [key, value] of Object.entries(frontmatter)) {
    const field = schema.fields[key];
    if (!field) {
      errors.push({
        code: "UNKNOWN_FRONTMATTER_FIELD",
        message: `Field "${key}" is not defined in the "${schema.type}" schema.`,
        path: `frontmatter.${key}`,
      });
      continue;
    }
    const typeError = checkFieldType(
      key,
      value,
      field,
      `frontmatter.${key}`,
    );
    if (typeError) errors.push(typeError);
  }
}

function checkFieldType(
  fieldName: string,
  value: unknown,
  field: SchemaRegistryFieldSnapshot,
  path: string,
): ValidationError | undefined {
  if (value === null) {
    if (field.nullable) return undefined;
    return {
      code: "INVALID_FRONTMATTER_TYPE",
      message: `Field "${fieldName}" is not nullable but received null.`,
      path,
    };
  }
  if (value === undefined) {
    // Undefined for an optional field is OK; the missing-required pass
    // above already caught the required case.
    return undefined;
  }
  const actual = jsKindOf(value);
  const expected = expectedJsKind(field.kind);
  if (!expected) {
    // Unknown schema kind — don't reject; let it through. New schema
    // kinds added later shouldn't false-positive existing proposals.
    return undefined;
  }
  if (actual !== expected) {
    return {
      code: "INVALID_FRONTMATTER_TYPE",
      message: `Field "${fieldName}" expects ${expected} (schema kind "${field.kind}") but received ${actual}.`,
      path,
    };
  }
  return undefined;
}

/**
 * Map of schema-kind → expected JS-runtime kind. Returns `undefined`
 * for schema kinds we don't have a checkable runtime mapping for —
 * those slip through validation (intentional: unknown kinds are
 * forwards-compatible).
 */
function expectedJsKind(schemaKind: string): string | undefined {
  switch (schemaKind) {
    case "string":
    case "richText":
    case "url":
    case "slug":
    case "markdown":
    case "color":
    case "image":
      return "string";
    case "number":
    case "integer":
    case "float":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
    case "datetime":
      // Dates land as ISO strings in MDCMS frontmatter.
      return "string";
    case "array":
    case "list":
      return "array";
    case "object":
    case "group":
      return "object";
    case "reference":
      // References serialize as objects (or strings for path-only refs).
      // Don't strict-check until reference shape is locked in.
      return undefined;
    case "enum":
    case "select":
      // Enum values are strings or numbers depending on the schema.
      return "string";
    default:
      return undefined;
  }
}

function jsKindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
