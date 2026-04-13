import { RuntimeError } from "../runtime/error.js";
import { z } from "zod";

export type EnvironmentSummary = {
  id: string;
  project: string;
  name: string;
  extends: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type EnvironmentDefinitionsMeta =
  | {
      definitionsStatus: "missing";
    }
  | {
      definitionsStatus: "ready";
      configSnapshotHash: string;
      syncedAt: string;
    };

export type EnvironmentListResponse = {
  data: EnvironmentSummary[];
  meta: EnvironmentDefinitionsMeta;
};

export type EnvironmentCreateInput = {
  name: string;
  extends?: string;
};

const NonEmptyStringSchema = z.string().trim().min(1);
const EnvironmentDefinitionsMetaSchema = z.discriminatedUnion(
  "definitionsStatus",
  [
    z.object({
      definitionsStatus: z.literal("missing"),
    }),
    z.object({
      definitionsStatus: z.literal("ready"),
      configSnapshotHash: NonEmptyStringSchema,
      syncedAt: NonEmptyStringSchema,
    }),
  ],
);
const EnvironmentCreateInputSchema = z.object({
  name: NonEmptyStringSchema,
  extends: NonEmptyStringSchema.nullable().optional(),
});
const EnvironmentSummarySchema = z.object({
  id: NonEmptyStringSchema,
  project: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  extends: NonEmptyStringSchema.nullable().optional(),
  isDefault: z.boolean(),
  createdAt: NonEmptyStringSchema,
});
const EnvironmentListResponseSchema = z.object({
  data: z.array(EnvironmentSummarySchema),
  meta: EnvironmentDefinitionsMetaSchema,
});

function invalidInput(
  path: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new RuntimeError({
    code: "INVALID_INPUT",
    message: `${path} ${message}`,
    statusCode: 400,
    details: {
      path,
      ...(details ?? {}),
    },
  });
}

function assertWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: string,
): asserts value is T {
  const parsed = schema.safeParse(value);

  if (parsed.success) {
    return;
  }

  const issue = parsed.error.issues[0];
  const issuePath =
    issue?.path && issue.path.length > 0
      ? `${path}.${issue.path.join(".")}`
      : path;

  if (issuePath === path) {
    invalidInput(path, "must be an object.");
  }

  if (issuePath.endsWith(".isDefault")) {
    invalidInput(issuePath, "must be a boolean.");
  }

  invalidInput(issuePath, "must be a non-empty string.");
}

export function assertEnvironmentCreateInput(
  value: unknown,
  path = "value",
): asserts value is EnvironmentCreateInput {
  assertWithSchema(EnvironmentCreateInputSchema, value, path);
}

export function assertEnvironmentSummary(
  value: unknown,
  path = "value",
): asserts value is EnvironmentSummary {
  assertWithSchema(EnvironmentSummarySchema, value, path);
}

export function assertEnvironmentDefinitionsMeta(
  value: unknown,
  path = "value",
): asserts value is EnvironmentDefinitionsMeta {
  assertWithSchema(EnvironmentDefinitionsMetaSchema, value, path);
}

export function assertEnvironmentListResponse(
  value: unknown,
  path = "value",
): asserts value is EnvironmentListResponse {
  assertWithSchema(EnvironmentListResponseSchema, value, path);
}
