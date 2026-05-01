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

export type EnvironmentClonePayloadInclude = {
  content: boolean;
  settings: boolean;
};

export type EnvironmentCloneInput = {
  sourceEnvironmentId: string;
  include: EnvironmentClonePayloadInclude;
  includeDrafts: boolean;
  preservePaths: boolean;
};

export type EnvironmentCloneResult = {
  targetEnvironmentId: string;
  documentsCloned: number;
};

export type DocumentPromotionStatus =
  | "overwrote"
  | "created"
  | "skipped_unpublished";

export type DocumentPromotionResult = {
  sourceDocumentId: string;
  targetDocumentId: string | null;
  status: DocumentPromotionStatus;
  path: string;
  locale: string;
  type: string;
  publishedVersion: number | null;
  remappedReferences: number;
};

export type EnvironmentPromoteInput = {
  sourceEnvironmentId: string;
  documentIds: string[];
  includeUnpublished: boolean;
  dryRun: boolean;
};

export type EnvironmentPromoteResult = {
  promoted: DocumentPromotionResult[];
};

const NonEmptyStringSchema = z.string().trim().min(1);
const UuidSchema = z.string().trim().uuid();
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

// Clone / promote payloads have richer shapes (booleans, arrays of UUIDs)
// than the simple `name`/`extends` create payload, so we surface specific
// error messages per offending field rather than the generic "must be a
// non-empty string" the legacy create-input assertion uses.
function assertCloneOrPromotePayload(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidInput(path, "must be an object.");
  }
  return value as Record<string, unknown>;
}

function assertUuid(value: unknown, path: string): string {
  if (typeof value !== "string" || !UuidSchema.safeParse(value).success) {
    invalidInput(path, "must be a UUID string.");
  }
  return value.trim();
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    invalidInput(path, "must be a boolean.");
  }
  return value;
}

function assertOptionalBoolean(
  value: unknown,
  path: string,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }
  return assertBoolean(value, path);
}

export function assertEnvironmentCloneInput(
  value: unknown,
  path = "value",
): asserts value is EnvironmentCloneInput {
  const obj = assertCloneOrPromotePayload(value, path);
  const sourceEnvironmentId = assertUuid(
    obj.sourceEnvironmentId,
    `${path}.sourceEnvironmentId`,
  );

  // Spec defaults: include.content=true, include.settings=false (settings copy
  // is opt-in because it overwrites synced schema state in the target).
  const includeRaw =
    obj.include === undefined
      ? { content: true, settings: false }
      : obj.include;
  if (
    typeof includeRaw !== "object" ||
    includeRaw === null ||
    Array.isArray(includeRaw)
  ) {
    invalidInput(`${path}.include`, "must be an object.");
  }
  const includeRecord = includeRaw as Record<string, unknown>;
  if ("media" in includeRecord) {
    invalidInput(
      `${path}.include.media`,
      "is not supported in MVP — media inclusion is deferred (SPEC-009 #Cloning).",
      { deferred: true },
    );
  }
  const include: EnvironmentClonePayloadInclude = {
    content: assertOptionalBoolean(
      includeRecord.content,
      `${path}.include.content`,
      true,
    ),
    settings: assertOptionalBoolean(
      includeRecord.settings,
      `${path}.include.settings`,
      false,
    ),
  };

  // Spec defaults: includeDrafts=true, preservePaths=true.
  const includeDrafts = assertOptionalBoolean(
    obj.includeDrafts,
    `${path}.includeDrafts`,
    true,
  );
  const preservePaths = assertOptionalBoolean(
    obj.preservePaths,
    `${path}.preservePaths`,
    true,
  );

  Object.assign(obj, {
    sourceEnvironmentId,
    include,
    includeDrafts,
    preservePaths,
  });
}

export function assertEnvironmentPromoteInput(
  value: unknown,
  path = "value",
): asserts value is EnvironmentPromoteInput {
  const obj = assertCloneOrPromotePayload(value, path);
  const sourceEnvironmentId = assertUuid(
    obj.sourceEnvironmentId,
    `${path}.sourceEnvironmentId`,
  );
  if (!Array.isArray(obj.documentIds) || obj.documentIds.length === 0) {
    invalidInput(
      `${path}.documentIds`,
      "must be a non-empty array of UUID strings.",
    );
  }
  const documentIds = obj.documentIds.map((entry, index) =>
    assertUuid(entry, `${path}.documentIds[${index}]`),
  );
  // includeUnpublished defaults to false — promote is "publish source-of-truth"
  // by default; promoting drafts is opt-in.
  const includeUnpublished = assertOptionalBoolean(
    obj.includeUnpublished,
    `${path}.includeUnpublished`,
    false,
  );
  // dryRun defaults to false — explicit opt-in for plan-only mode.
  const dryRun = assertOptionalBoolean(obj.dryRun, `${path}.dryRun`, false);

  Object.assign(obj, {
    sourceEnvironmentId,
    documentIds,
    includeUnpublished,
    dryRun,
  });
}
