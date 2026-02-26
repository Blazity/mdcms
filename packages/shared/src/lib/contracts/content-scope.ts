import { RuntimeError } from "../runtime/error.js";

/**
 * ContentScope identifies the project + environment pair that scopes
 * all content operations.
 */
export type ContentScope = {
  readonly projectId: string;
  readonly environmentId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * assertContentScope validates that the given value is a valid ContentScope
 * with UUID-formatted projectId and environmentId.
 */
export function assertContentScope(
  value: unknown,
  path = "scope",
): asserts value is ContentScope {
  if (!isRecord(value)) {
    throw new RuntimeError({
      code: "INVALID_CONTENT_SCOPE",
      message: `${path} must be an object.`,
      statusCode: 400,
      details: { path },
    });
  }

  if (
    typeof value.projectId !== "string" ||
    !UUID_PATTERN.test(value.projectId)
  ) {
    throw new RuntimeError({
      code: "INVALID_CONTENT_SCOPE",
      message: `${path}.projectId must be a valid UUID.`,
      statusCode: 400,
      details: { path: `${path}.projectId`, value: value.projectId },
    });
  }

  if (
    typeof value.environmentId !== "string" ||
    !UUID_PATTERN.test(value.environmentId)
  ) {
    throw new RuntimeError({
      code: "INVALID_CONTENT_SCOPE",
      message: `${path}.environmentId must be a valid UUID.`,
      statusCode: 400,
      details: { path: `${path}.environmentId`, value: value.environmentId },
    });
  }
}
