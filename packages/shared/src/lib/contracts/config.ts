import { z } from "zod";

import { RuntimeError } from "../runtime/error.js";

export const IMPLICIT_DEFAULT_LOCALE = "__mdcms_default__" as const;

const REFERENCE_METADATA_KEY = "mdcms:reference";

export type StandardSchemaLike<Input = unknown, Output = Input> = {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: { readonly libraryOptions?: Record<string, unknown> },
    ) =>
      | { readonly value: Output; readonly issues?: undefined }
      | { readonly issues: ReadonlyArray<{ readonly message: string }> }
      | Promise<
          | { readonly value: Output; readonly issues?: undefined }
          | { readonly issues: ReadonlyArray<{ readonly message: string }> }
        >;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    };
  };
};

export type MdcmsReferenceMetadata = {
  targetType: string;
};

export type MdcmsFieldSchema = StandardSchemaLike;

export type MdcmsTypeDefinition<
  TName extends string = string,
  TFields extends Record<string, MdcmsFieldSchema> = Record<
    string,
    MdcmsFieldSchema
  >,
> = {
  name: TName;
  directory?: string;
  localized?: boolean;
  fields: TFields;
};

export type MdcmsLocaleConfig = {
  default: string;
  supported: string[];
  aliases?: Record<string, string>;
};

export type MdcmsComponentRegistration = {
  name: string;
  importPath: string;
  description?: string;
  propHints?: Record<string, unknown>;
  propsEditor?: string;
};

export type MdcmsConfig = {
  project: string;
  serverUrl: string;
  environment?: string;
  contentDirectories?: string[];
  locales?: MdcmsLocaleConfig;
  types?: MdcmsTypeDefinition[];
  components?: MdcmsComponentRegistration[];
};

export type ParsedMdcmsLocaleConfig = {
  default: string;
  supported: string[];
  aliases: Record<string, string>;
  implicit: boolean;
};

export type ParsedMdcmsTypeDefinition = {
  name: string;
  directory?: string;
  localized: boolean;
  fields: Record<string, MdcmsFieldSchema>;
  referenceFields: Record<string, MdcmsReferenceMetadata>;
};

export type ParsedMdcmsComponentRegistration = {
  name: string;
  importPath: string;
  description?: string;
  propHints?: Record<string, unknown>;
  propsEditor?: string;
};

export type ParsedMdcmsConfig = {
  project: string;
  serverUrl: string;
  environment?: string;
  contentDirectories: string[];
  locales: ParsedMdcmsLocaleConfig;
  types: ParsedMdcmsTypeDefinition[];
  components: ParsedMdcmsComponentRegistration[];
};

export function defineConfig<TConfig extends MdcmsConfig>(
  config: TConfig,
): TConfig {
  return config;
}

export function defineType<
  TName extends string,
  TFields extends Record<string, MdcmsFieldSchema>,
>(
  name: TName,
  definition: {
    directory?: string;
    localized?: boolean;
    fields: TFields;
  },
): MdcmsTypeDefinition<TName, TFields> {
  return {
    name,
    ...definition,
  };
}

export function reference(targetType: string) {
  const normalizedTargetType = parseRequiredString(targetType, "targetType");

  return z.string().meta({
    [REFERENCE_METADATA_KEY]: {
      targetType: normalizedTargetType,
    },
  });
}

export function parseMdcmsConfig(raw: unknown): ParsedMdcmsConfig {
  const config = expectRecord(raw, "config");
  const types = parseTypes(config.types);
  const contentDirectories = parseContentDirectories(
    config.contentDirectories,
    types,
  );

  return {
    project: parseRequiredString(config.project, "project"),
    serverUrl: parseRequiredString(config.serverUrl, "serverUrl"),
    environment: parseOptionalString(config.environment, "environment"),
    contentDirectories,
    locales: parseLocales(config.locales, types),
    types,
    components: parseComponents(config.components),
  };
}

function parseTypes(value: unknown): ParsedMdcmsTypeDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw invalidConfig("types", "must be an array of type definitions.");
  }

  return value.map((entry, index) => {
    const typeConfig = expectRecord(entry, `types[${index}]`);
    const fields = parseFields(typeConfig.fields, `types[${index}].fields`);

    return {
      name: parseRequiredString(typeConfig.name, `types[${index}].name`),
      directory: normalizeDirectory(
        typeConfig.directory,
        `types[${index}].directory`,
      ),
      localized:
        parseOptionalBoolean(
          typeConfig.localized,
          `types[${index}].localized`,
        ) ?? false,
      fields,
      referenceFields: extractReferenceFields(fields),
    };
  });
}

function parseFields(
  value: unknown,
  field: string,
): Record<string, MdcmsFieldSchema> {
  const fields = expectRecord(value, field);
  const parsedEntries: [string, MdcmsFieldSchema][] = [];

  for (const [key, schema] of Object.entries(fields)) {
    const schemaField = `${field}.${key}`;

    if (!isStandardSchemaLike(schema)) {
      throw invalidConfig(
        schemaField,
        "must be a Standard Schema-compatible validator.",
      );
    }

    parsedEntries.push([key, schema]);
  }

  return Object.fromEntries(parsedEntries);
}

function parseComponents(value: unknown): ParsedMdcmsComponentRegistration[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw invalidConfig("components", "must be an array.");
  }

  return value.map((entry, index) => {
    const component = expectRecord(entry, `components[${index}]`);
    const propHints = component.propHints;

    if (
      propHints !== undefined &&
      (!isPlainObject(propHints) || Array.isArray(propHints))
    ) {
      throw invalidConfig(
        `components[${index}].propHints`,
        "must be an object map when provided.",
      );
    }

    const parsedComponent: ParsedMdcmsComponentRegistration = {
      name: parseRequiredString(component.name, `components[${index}].name`),
      importPath: parseRequiredString(
        component.importPath,
        `components[${index}].importPath`,
      ),
    };

    const description = parseOptionalString(
      component.description,
      `components[${index}].description`,
    );
    const propsEditor = parseOptionalString(
      component.propsEditor,
      `components[${index}].propsEditor`,
    );

    if (description !== undefined) {
      parsedComponent.description = description;
    }

    if (propHints !== undefined) {
      parsedComponent.propHints = propHints as Record<string, unknown>;
    }

    if (propsEditor !== undefined) {
      parsedComponent.propsEditor = propsEditor;
    }

    return parsedComponent;
  });
}

function parseContentDirectories(
  value: unknown,
  types: readonly ParsedMdcmsTypeDefinition[],
): string[] {
  if (value === undefined) {
    if (types.some((typeConfig) => typeConfig.directory !== undefined)) {
      throw invalidConfig(
        "contentDirectories",
        "is required when type directories are configured.",
      );
    }

    return [];
  }

  if (!Array.isArray(value)) {
    throw invalidConfig("contentDirectories", "must be an array.");
  }

  const normalizedDirectories = uniqueStrings(
    value.map((entry, index) => {
      const directory = normalizeDirectory(
        entry,
        `contentDirectories[${index}]`,
        true,
      );

      if (directory === undefined) {
        throw invalidConfig(
          `contentDirectories[${index}]`,
          "must resolve to a non-empty path.",
        );
      }

      return directory;
    }),
    "contentDirectories",
  );

  for (const typeConfig of types) {
    const typeDirectory = typeConfig.directory;

    if (!typeDirectory) {
      continue;
    }

    const covered = normalizedDirectories.some(
      (directory) =>
        directory === typeDirectory ||
        typeDirectory.startsWith(`${directory}/`),
    );

    if (!covered) {
      throw invalidConfig(
        "contentDirectories",
        `must include a directory that covers type "${typeConfig.name}" at "${typeDirectory}".`,
      );
    }
  }

  return normalizedDirectories;
}

function parseLocales(
  value: unknown,
  types: readonly ParsedMdcmsTypeDefinition[],
): ParsedMdcmsLocaleConfig {
  const localizedTypes = types.filter((typeConfig) => typeConfig.localized);

  if (value === undefined) {
    if (localizedTypes.length > 0) {
      throw invalidConfig(
        "locales",
        `is required when localized types are configured (${localizedTypes
          .map((typeConfig) => typeConfig.name)
          .join(", ")}).`,
      );
    }

    return {
      default: IMPLICIT_DEFAULT_LOCALE,
      supported: [IMPLICIT_DEFAULT_LOCALE],
      aliases: {},
      implicit: true,
    };
  }

  const locales = expectRecord(value, "locales");
  const supported = parseSupportedLocales(locales.supported);

  if (supported.length === 0) {
    throw invalidConfig(
      "locales.supported",
      "must contain at least one locale.",
    );
  }

  const defaultLocale = normalizeLocale(
    locales.default,
    "locales.default",
    false,
  );

  if (!supported.includes(defaultLocale)) {
    throw invalidConfig(
      "locales.default",
      "must resolve to an entry in locales.supported.",
    );
  }

  const aliases = parseLocaleAliases(locales.aliases, supported);

  return {
    default: defaultLocale,
    supported,
    aliases,
    implicit: false,
  };
}

function parseSupportedLocales(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw invalidConfig("locales.supported", "must be an array.");
  }

  return uniqueStrings(
    value.map((entry, index) =>
      normalizeLocale(entry, `locales.supported[${index}]`, false),
    ),
    "locales.supported",
  );
}

function parseLocaleAliases(
  value: unknown,
  supported: readonly string[],
): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  const aliases = expectRecord(value, "locales.aliases");
  const normalizedEntries: [string, string][] = [];

  for (const [rawAlias, rawTarget] of Object.entries(aliases)) {
    const normalizedAlias = normalizeLocale(
      rawAlias,
      `locales.aliases.${rawAlias}`,
      false,
    );
    const normalizedTarget = normalizeLocale(
      rawTarget,
      `locales.aliases.${rawAlias}`,
      false,
    );

    if (!supported.includes(normalizedTarget)) {
      throw invalidConfig(
        `locales.aliases.${rawAlias}`,
        `must resolve to one of locales.supported (${supported.join(", ")}).`,
      );
    }

    normalizedEntries.push([normalizedAlias, normalizedTarget]);
  }

  normalizedEntries.sort(([left], [right]) => left.localeCompare(right));
  const result: Record<string, string> = {};

  for (const [alias, target] of normalizedEntries) {
    if (alias in result) {
      throw invalidConfig(
        "locales.aliases",
        `contains duplicate alias key after normalization ("${alias}").`,
      );
    }

    result[alias] = target;
  }

  return result;
}

function extractReferenceFields(
  fields: Record<string, MdcmsFieldSchema>,
): Record<string, MdcmsReferenceMetadata> {
  const referenceEntries = Object.entries(fields).flatMap(([name, schema]) => {
    const metadata = findReferenceMetadata(schema);
    return metadata ? ([[name, metadata]] as const) : [];
  });

  return Object.fromEntries(referenceEntries);
}

function findReferenceMetadata(
  schema: MdcmsFieldSchema,
): MdcmsReferenceMetadata | undefined {
  const stack: unknown[] = [schema];
  const seen = new Set<object>();

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }

    seen.add(current);

    const meta = readSchemaMetadata(current);
    const candidate = isPlainObject(meta)
      ? meta[REFERENCE_METADATA_KEY]
      : undefined;

    if (isPlainObject(candidate) && typeof candidate.targetType === "string") {
      return {
        targetType: candidate.targetType,
      };
    }

    const definition = (current as { _def?: unknown })._def;

    if (isPlainObject(definition)) {
      for (const value of Object.values(definition)) {
        stack.push(value);
      }
    }
  }

  return undefined;
}

function readSchemaMetadata(value: object): unknown {
  const candidate = value as { meta?: () => unknown };
  return typeof candidate.meta === "function" ? candidate.meta() : undefined;
}

function isStandardSchemaLike(value: unknown): value is MdcmsFieldSchema {
  if (!isPlainObject(value)) {
    return false;
  }

  const standard = value["~standard"];

  return (
    isPlainObject(standard) &&
    standard.version === 1 &&
    typeof standard.vendor === "string" &&
    typeof standard.validate === "function"
  );
}

function normalizeLocale(
  value: unknown,
  field: string,
  allowImplicitToken: boolean,
): string {
  const rawValue = parseRequiredString(value, field);

  if (rawValue === IMPLICIT_DEFAULT_LOCALE) {
    if (allowImplicitToken) {
      return rawValue;
    }

    throw invalidConfig(
      field,
      `must not use the reserved token "${IMPLICIT_DEFAULT_LOCALE}".`,
    );
  }

  const raw = rawValue.replaceAll("_", "-");

  try {
    return new Intl.Locale(raw).toString();
  } catch {
    throw invalidConfig(field, "must be a valid BCP 47 locale tag.");
  }
}

function normalizeDirectory(
  value: unknown,
  field: string,
  required = false,
): string | undefined {
  const normalized = required
    ? parseRequiredString(value, field)
    : parseOptionalString(value, field);

  if (normalized === undefined) {
    return undefined;
  }

  const sanitized = normalized
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");

  if (sanitized.length === 0) {
    throw invalidConfig(field, "must resolve to a non-empty path.");
  }

  return sanitized;
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw invalidConfig(field, "must be a string.");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw invalidConfig(field, "must not be empty.");
  }

  return trimmed;
}

function parseOptionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredString(value, field);
}

function parseOptionalBoolean(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw invalidConfig(field, "must be a boolean.");
  }

  return value;
}

function uniqueStrings(values: readonly string[], field?: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      if (field) {
        throw invalidConfig(
          field,
          `contains duplicate value after normalization ("${value}").`,
        );
      }

      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value) || Array.isArray(value)) {
    throw invalidConfig(field, "must be an object.");
  }

  return value as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalidConfig(field: string, message: string): RuntimeError {
  return new RuntimeError({
    code: "INVALID_CONFIG",
    message: `Config field "${field}" ${message}`,
    statusCode: 400,
    details: { field },
  });
}
