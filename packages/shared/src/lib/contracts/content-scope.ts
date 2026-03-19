import { RuntimeError } from "../runtime/error.js";
import { z } from "zod";

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
const ContentScopeSchema = z.object({
  projectId: z.string().regex(UUID_PATTERN),
  environmentId: z.string().regex(UUID_PATTERN),
});

/**
 * assertContentScope validates that the given value is a valid ContentScope
 * with UUID-formatted projectId and environmentId.
 */
export function assertContentScope(
  value: unknown,
  path = "scope",
): asserts value is ContentScope {
  const parsed = ContentScopeSchema.safeParse(value);

  if (parsed.success) {
    return;
  }

  const issue = parsed.error.issues[0];
  const issuePath = issue?.path?.[0];

  if (issuePath !== "projectId" && issuePath !== "environmentId") {
    throw new RuntimeError({
      code: "INVALID_CONTENT_SCOPE",
      message: `${path} must be an object.`,
      statusCode: 400,
      details: { path },
    });
  }

  const fieldPath = `${path}.${issuePath}`;
  const fieldValue =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)[issuePath]
      : undefined;

  throw new RuntimeError({
    code: "INVALID_CONTENT_SCOPE",
    message: `${fieldPath} must be a valid UUID.`,
    statusCode: 400,
    details: { path: fieldPath, value: fieldValue },
  });
}
