import {
  type MdcmsFieldSchema,
  type ParsedMdcmsConfig,
  type ParsedMdcmsTypeDefinition,
} from "./config.js";
import { RuntimeError } from "../runtime/error.js";

type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type SchemaRegistryFieldSnapshot = {
  kind: string;
  required: boolean;
  nullable: boolean;
  default?: JsonValue;
  reference?: {
    targetType: string;
  };
  checks?: JsonObject[];
  item?: SchemaRegistryFieldSnapshot;
  fields?: Record<string, SchemaRegistryFieldSnapshot>;
  options?: JsonValue[];
};

export type SchemaRegistryTypeSnapshot = {
  type: string;
  directory: string;
  localized: boolean;
  fields: Record<string, SchemaRegistryFieldSnapshot>;
};

export type SchemaRegistryEntry = {
  type: string;
  directory: string;
  localized: boolean;
  schemaHash: string;
  syncedAt: string;
  resolvedSchema: SchemaRegistryTypeSnapshot;
};

export type SchemaRegistrySyncPayload = {
  rawConfigSnapshot: JsonObject;
  resolvedSchema: Record<string, SchemaRegistryTypeSnapshot>;
  schemaHash: string;
};

type SerializerContext = {
  required: boolean;
  nullable: boolean;
  defaultValue?: JsonValue;
};

const DEFAULT_SERIALIZER_CONTEXT: SerializerContext = {
  required: true,
  nullable: false,
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidInput(path, "must be a non-empty string.", { value });
  }
}

export function assertJsonValue(
  value: unknown,
  path = "value",
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalidInput(path, "must be a finite JSON number.", { value });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertJsonValue(entry, `${path}[${index}]`);
    });
    return;
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonValue(entry, `${path}.${key}`);
    }
    return;
  }

  invalidInput(path, "must be JSON-serializable.", {
    valueType: typeof value,
  });
}

export function assertJsonObject(
  value: unknown,
  path = "value",
): asserts value is JsonObject {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.", {
      valueType: Array.isArray(value) ? "array" : typeof value,
    });
  }

  assertJsonValue(value, path);
}

function readSchemaMetadata(value: object): unknown {
  const candidate = value as { meta?: () => unknown };
  return typeof candidate.meta === "function" ? candidate.meta() : undefined;
}

function readDirectReferenceMetadata(
  schema: MdcmsFieldSchema,
): SchemaRegistryFieldSnapshot["reference"] | undefined {
  const meta = readSchemaMetadata(schema as object);
  const candidate = isRecord(meta) ? meta["mdcms:reference"] : undefined;

  if (!isRecord(candidate) || typeof candidate.targetType !== "string") {
    return undefined;
  }

  return {
    targetType: candidate.targetType,
  };
}

function assertFieldSnapshot(
  value: unknown,
  path: string,
): asserts value is SchemaRegistryFieldSnapshot {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.");
  }

  assertNonEmptyString(value.kind, `${path}.kind`);

  if (typeof value.required !== "boolean") {
    invalidInput(`${path}.required`, "must be a boolean.", {
      value: value.required,
    });
  }

  if (typeof value.nullable !== "boolean") {
    invalidInput(`${path}.nullable`, "must be a boolean.", {
      value: value.nullable,
    });
  }

  if (value.default !== undefined) {
    assertJsonValue(value.default, `${path}.default`);
  }

  if (value.reference !== undefined) {
    if (!isRecord(value.reference)) {
      invalidInput(`${path}.reference`, "must be an object.");
    }
    assertNonEmptyString(
      value.reference.targetType,
      `${path}.reference.targetType`,
    );
  }

  if (value.checks !== undefined) {
    if (!Array.isArray(value.checks)) {
      invalidInput(`${path}.checks`, "must be an array when provided.");
    }
    value.checks.forEach((entry, index) =>
      assertJsonObject(entry, `${path}.checks[${index}]`),
    );
  }

  if (value.item !== undefined) {
    assertFieldSnapshot(value.item, `${path}.item`);
  }

  if (value.fields !== undefined) {
    if (!isRecord(value.fields)) {
      invalidInput(`${path}.fields`, "must be an object when provided.");
    }
    for (const [fieldName, entry] of Object.entries(value.fields)) {
      assertFieldSnapshot(entry, `${path}.fields.${fieldName}`);
    }
  }

  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) {
      invalidInput(`${path}.options`, "must be an array when provided.");
    }
    value.options.forEach((entry, index) =>
      assertJsonValue(entry, `${path}.options[${index}]`),
    );
  }

  switch (value.kind) {
    case "array":
      if (value.item === undefined) {
        invalidInput(`${path}.item`, 'must be defined when kind is "array".');
      }
      if (value.fields !== undefined) {
        invalidInput(
          `${path}.fields`,
          'must not be provided when kind is "array".',
        );
      }
      if (value.options !== undefined) {
        invalidInput(
          `${path}.options`,
          'must not be provided when kind is "array".',
        );
      }
      break;
    case "object":
      if (value.fields === undefined) {
        invalidInput(
          `${path}.fields`,
          'must be defined when kind is "object".',
        );
      }
      if (value.item !== undefined) {
        invalidInput(
          `${path}.item`,
          'must not be provided when kind is "object".',
        );
      }
      if (value.options !== undefined) {
        invalidInput(
          `${path}.options`,
          'must not be provided when kind is "object".',
        );
      }
      break;
    case "enum":
    case "literal":
      if (value.options === undefined) {
        invalidInput(
          `${path}.options`,
          `must be defined when kind is "${value.kind}".`,
        );
      }
      if (value.item !== undefined) {
        invalidInput(
          `${path}.item`,
          `must not be provided when kind is "${value.kind}".`,
        );
      }
      if (value.fields !== undefined) {
        invalidInput(
          `${path}.fields`,
          `must not be provided when kind is "${value.kind}".`,
        );
      }
      break;
    default:
      if (value.item !== undefined) {
        invalidInput(
          `${path}.item`,
          `must not be provided when kind is "${value.kind}".`,
        );
      }
      if (value.fields !== undefined) {
        invalidInput(
          `${path}.fields`,
          `must not be provided when kind is "${value.kind}".`,
        );
      }
      if (value.options !== undefined) {
        invalidInput(
          `${path}.options`,
          `must not be provided when kind is "${value.kind}".`,
        );
      }
      break;
  }
}

export function assertSchemaRegistryTypeSnapshot(
  value: unknown,
  path = "schema",
): asserts value is SchemaRegistryTypeSnapshot {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.");
  }

  assertNonEmptyString(value.type, `${path}.type`);

  assertNonEmptyString(value.directory, `${path}.directory`);

  if (typeof value.localized !== "boolean") {
    invalidInput(`${path}.localized`, "must be a boolean.", {
      value: value.localized,
    });
  }

  if (!isRecord(value.fields)) {
    invalidInput(`${path}.fields`, "must be an object.");
  }

  for (const [fieldName, entry] of Object.entries(value.fields)) {
    assertFieldSnapshot(entry, `${path}.fields.${fieldName}`);
  }
}

export function assertSchemaRegistryEntry(
  value: unknown,
  path = "entry",
): asserts value is SchemaRegistryEntry {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.");
  }

  assertNonEmptyString(value.type, `${path}.type`);

  assertNonEmptyString(value.directory, `${path}.directory`);

  if (typeof value.localized !== "boolean") {
    invalidInput(`${path}.localized`, "must be a boolean.", {
      value: value.localized,
    });
  }

  assertNonEmptyString(value.schemaHash, `${path}.schemaHash`);
  assertNonEmptyString(value.syncedAt, `${path}.syncedAt`);
  assertSchemaRegistryTypeSnapshot(
    value.resolvedSchema,
    `${path}.resolvedSchema`,
  );

  if (value.resolvedSchema.type !== value.type) {
    invalidInput(`${path}.resolvedSchema.type`, "must match entry.type.", {
      entryType: value.type,
      resolvedType: value.resolvedSchema.type,
    });
  }

  if (value.resolvedSchema.directory !== value.directory) {
    invalidInput(
      `${path}.resolvedSchema.directory`,
      "must match entry.directory.",
      {
        entryDirectory: value.directory,
        resolvedDirectory: value.resolvedSchema.directory,
      },
    );
  }

  if (value.resolvedSchema.localized !== value.localized) {
    invalidInput(
      `${path}.resolvedSchema.localized`,
      "must match entry.localized.",
      {
        entryLocalized: value.localized,
        resolvedLocalized: value.resolvedSchema.localized,
      },
    );
  }
}

export function assertSchemaRegistrySyncPayload(
  value: unknown,
  path = "payload",
): asserts value is SchemaRegistrySyncPayload {
  if (!isRecord(value)) {
    invalidInput(path, "must be an object.");
  }

  if ("extractedComponents" in value) {
    invalidInput(
      `${path}.extractedComponents`,
      "is no longer supported in schema sync payloads.",
    );
  }

  assertJsonObject(value.rawConfigSnapshot, `${path}.rawConfigSnapshot`);

  if (!isRecord(value.resolvedSchema)) {
    invalidInput(`${path}.resolvedSchema`, "must be an object.", {
      valueType: Array.isArray(value.resolvedSchema)
        ? "array"
        : typeof value.resolvedSchema,
    });
  }

  for (const [typeName, entry] of Object.entries(value.resolvedSchema)) {
    assertSchemaRegistryTypeSnapshot(
      entry,
      `${path}.resolvedSchema.${typeName}`,
    );

    if (entry.type !== typeName) {
      invalidInput(
        `${path}.resolvedSchema.${typeName}.type`,
        "must match the resolvedSchema map key.",
        {
          mapKey: typeName,
          resolvedType: entry.type,
        },
      );
    }
  }

  assertNonEmptyString(value.schemaHash, `${path}.schemaHash`);
}

function readZodDefinition(
  schema: MdcmsFieldSchema,
  path: string,
): Record<string, unknown> {
  const zodLike = schema as {
    _zod?: { def?: Record<string, unknown> };
    _def?: Record<string, unknown>;
  };

  const definition = zodLike._zod?.def ?? zodLike._def;
  if (!isRecord(definition) || typeof definition.type !== "string") {
    invalidInput(
      path,
      "must use a Zod-backed validator supported by schema registry serialization.",
    );
  }

  return definition;
}

function readDefaultValue(value: unknown, path: string): JsonValue {
  assertJsonValue(value, path);
  return value;
}

function sanitizeCheckDefinition(value: unknown, path: string): JsonObject {
  const zodDefinition = (value as { _zod?: { def?: unknown } } | undefined)
    ?._zod?.def;
  const legacyDefinition = (value as { _def?: unknown } | undefined)?._def;
  const definition = isRecord(zodDefinition)
    ? zodDefinition
    : isRecord(legacyDefinition)
      ? legacyDefinition
      : isRecord(value)
        ? value
        : undefined;

  if (!definition) {
    invalidInput(path, "contains an unsupported check definition.");
  }

  if (definition.check === "custom" || definition.type === "custom") {
    invalidInput(
      path,
      "uses an unsupported executable validator feature that cannot be serialized losslessly.",
    );
  }

  const sanitized: JsonObject = {};

  for (const [key, entry] of Object.entries(definition)) {
    if (typeof entry === "function") {
      continue;
    }

    if (entry instanceof RegExp) {
      if (key === "pattern") {
        sanitized.pattern = entry.source;
        if (entry.flags.length > 0) {
          sanitized.flags = entry.flags;
        }
        continue;
      }

      sanitized[key] = {
        pattern: entry.source,
        flags: entry.flags,
      };
      continue;
    }

    if (key === "check") {
      sanitized.kind = String(entry);
      continue;
    }

    assertJsonValue(entry, `${path}.${key}`);
    sanitized[key] = entry;
  }

  return sanitized;
}

function serializeChecks(
  checks: unknown,
  path: string,
): JsonObject[] | undefined {
  if (checks === undefined) {
    return undefined;
  }

  if (!Array.isArray(checks)) {
    invalidInput(path, "must be an array when present.");
  }

  const serialized = checks.map((entry, index) =>
    sanitizeCheckDefinition(entry, `${path}[${index}]`),
  );

  return serialized.length > 0 ? serialized : undefined;
}

function withFieldSnapshotBase(
  kind: string,
  context: SerializerContext,
  extra: Omit<
    SchemaRegistryFieldSnapshot,
    "kind" | "required" | "nullable"
  > = {},
): SchemaRegistryFieldSnapshot {
  const snapshot: SchemaRegistryFieldSnapshot = {
    kind,
    required: context.required,
    nullable: context.nullable,
  };

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) {
      (snapshot as Record<string, unknown>)[key] = value;
    }
  }

  if (context.defaultValue !== undefined) {
    snapshot.default = context.defaultValue;
  }

  if (extra.reference !== undefined) {
    snapshot.reference = extra.reference;
  }

  return snapshot;
}

function serializeFieldSchema(
  schema: MdcmsFieldSchema,
  path: string,
  context: SerializerContext = DEFAULT_SERIALIZER_CONTEXT,
): SchemaRegistryFieldSnapshot {
  const definition = readZodDefinition(schema, path);
  const type = String(definition.type);

  if (type === "optional") {
    return serializeFieldSchema(
      definition.innerType as MdcmsFieldSchema,
      path,
      {
        ...context,
        required: false,
      },
    );
  }

  if (type === "nullable") {
    return serializeFieldSchema(
      definition.innerType as MdcmsFieldSchema,
      path,
      {
        ...context,
        nullable: true,
      },
    );
  }

  if (type === "default") {
    return serializeFieldSchema(
      definition.innerType as MdcmsFieldSchema,
      path,
      {
        ...context,
        required: false,
        defaultValue: readDefaultValue(
          definition.defaultValue,
          `${path}.default`,
        ),
      },
    );
  }

  if (type === "pipe") {
    invalidInput(
      path,
      "uses an unsupported executable validator feature that cannot be serialized losslessly.",
    );
  }

  if (
    type === "string" ||
    type === "number" ||
    type === "boolean" ||
    type === "date"
  ) {
    return withFieldSnapshotBase(type, context, {
      checks: serializeChecks(definition.checks, `${path}.checks`),
      reference: readDirectReferenceMetadata(schema),
    });
  }

  if (type === "array") {
    return withFieldSnapshotBase(type, context, {
      checks: serializeChecks(definition.checks, `${path}.checks`),
      reference: readDirectReferenceMetadata(schema),
      item: serializeFieldSchema(
        definition.element as MdcmsFieldSchema,
        `${path}.item`,
      ),
    });
  }

  if (type === "object") {
    const rawShape =
      typeof definition.shape === "function"
        ? definition.shape()
        : definition.shape;

    if (!isRecord(rawShape)) {
      invalidInput(path, "must have an object shape.");
    }

    return withFieldSnapshotBase(type, context, {
      reference: readDirectReferenceMetadata(schema),
      fields: Object.fromEntries(
        Object.entries(rawShape)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([fieldName, fieldSchema]) => [
            fieldName,
            serializeFieldSchema(
              fieldSchema as MdcmsFieldSchema,
              `${path}.fields.${fieldName}`,
            ),
          ]),
      ),
    });
  }

  if (type === "enum") {
    const entries = definition.entries;
    if (!isRecord(entries)) {
      invalidInput(path, "must define enum entries.");
    }

    const options = [...new Set(Object.values(entries))]
      .sort((left, right) => String(left).localeCompare(String(right)))
      .map((entry, index) => {
        assertJsonValue(entry, `${path}.options[${index}]`);
        return entry;
      });

    return withFieldSnapshotBase(type, context, {
      reference: readDirectReferenceMetadata(schema),
      options,
    });
  }

  if (type === "literal") {
    const values = Array.isArray(definition.values) ? definition.values : [];
    const options = values.map((entry, index) => {
      assertJsonValue(entry, `${path}.options[${index}]`);
      return entry;
    });

    return withFieldSnapshotBase(type, context, {
      reference: readDirectReferenceMetadata(schema),
      options,
    });
  }

  invalidInput(
    path,
    `uses unsupported schema type "${type}" for registry serialization.`,
  );
}

function serializeTypeDefinition(
  typeConfig: ParsedMdcmsTypeDefinition,
  path: string,
): SchemaRegistryTypeSnapshot {
  if (typeConfig.directory === undefined) {
    invalidInput(
      `${path}.directory`,
      "must be defined for schema registry serialization.",
    );
  }

  return {
    type: typeConfig.name,
    directory: typeConfig.directory,
    localized: typeConfig.localized,
    fields: Object.fromEntries(
      Object.entries(typeConfig.fields)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fieldName, schema]) => [
          fieldName,
          serializeFieldSchema(schema, `${path}.fields.${fieldName}`),
        ]),
    ),
  };
}

/**
 * Produce schema registry type snapshots for a resolved environment in the config.
 *
 * Serializes each type defined in the specified resolved environment into a
 * map whose keys are type names and whose values are `SchemaRegistryTypeSnapshot`
 * objects; type entries are sorted by name.
 *
 * @param config - The parsed MDCMS configuration containing resolved environments
 * @param environmentName - The name of the resolved environment to serialize
 * @returns A record mapping type names to their `SchemaRegistryTypeSnapshot`
 * @throws RuntimeError with code `INVALID_INPUT` if `environmentName` does not refer to a resolved environment in `config.resolvedEnvironments`
 */
export function serializeResolvedEnvironmentSchema(
  config: ParsedMdcmsConfig,
  environmentName: string,
): Record<string, SchemaRegistryTypeSnapshot> {
  const environment = config.resolvedEnvironments[environmentName];

  if (!environment) {
    invalidInput(
      "environment",
      `must reference a resolved environment defined in config.environments (received "${environmentName}").`,
    );
  }

  return Object.fromEntries(
    Object.entries(environment.types)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([typeName, typeConfig]) => [
        typeName,
        serializeTypeDefinition(
          typeConfig,
          `resolvedEnvironments.${environmentName}.types.${typeName}`,
        ),
      ]),
  );
}

export type SchemaStateFile = {
  schemaHash: string;
  syncedAt: string;
  serverUrl: string;
};

/**
 * Produce a JSON-serializable snapshot of a parsed MDCMS config suitable for storage or transmission.
 *
 * The snapshot always includes `project` and `serverUrl`. It includes `environment` only if present on the config,
 * includes `contentDirectories` only when that array is non-empty, and includes a `locales` object only when
 * `config.locales.implicit` is `false`. When `locales` is present it contains `default` and `supported`, and
 * includes `aliases` only if `config.locales.aliases` has at least one key.
 *
 * @param config - The parsed MDCMS configuration to convert into a JSON snapshot
 * @returns A JSON object representing the minimal raw config snapshot with conditional keys as described above
 */
export function toRawConfigSnapshot(config: ParsedMdcmsConfig): JsonObject {
  return {
    project: config.project,
    serverUrl: config.serverUrl,
    ...(config.environment ? { environment: config.environment } : {}),
    ...(config.contentDirectories.length > 0
      ? { contentDirectories: config.contentDirectories }
      : {}),
    ...(config.locales.implicit
      ? {}
      : {
          locales: {
            default: config.locales.default,
            supported: config.locales.supported,
            ...(Object.keys(config.locales.aliases).length > 0
              ? { aliases: config.locales.aliases }
              : {}),
          },
        }),
  };
}
