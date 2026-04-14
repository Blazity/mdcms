import {
  buildSchemaRegistrySyncPayloadBase,
  parseMdcmsConfig,
  serializeSchemaRegistrySyncHashInput,
  type MdcmsConfig as SharedMdcmsConfig,
  type ParsedMdcmsConfig,
  type SchemaRegistrySyncPayload,
} from "@mdcms/shared";

export type StudioDocumentRouteSchemaCapability =
  | {
      canWrite: true;
      environment: string;
      schemaHash: string;
    }
  | {
      canWrite: false;
      reason: StudioDocumentRouteSchemaReadOnlyReason;
      message: string;
    };

export type StudioDocumentRouteSchemaReadOnlyReason =
  | "missing-environment"
  | "schema-unavailable";

export type StudioDocumentRouteSchemaDetails =
  | {
      canWrite: true;
      environment: string;
      syncPayload: SchemaRegistrySyncPayload;
    }
  | {
      canWrite: false;
      reason: StudioDocumentRouteSchemaReadOnlyReason;
      message: string;
    };

export type StudioDocumentRoutePreparedMetadata = {
  schemaHashesByEnvironment: Record<string, string>;
  environmentFieldTargets: Record<string, Record<string, string[]>>;
};

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error("Browser crypto is required to derive a schema hash.");
  }

  const bytes = encodeUtf8(value);
  const digest = await subtle.digest(
    "SHA-256",
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );

  return bytesToHex(new Uint8Array(digest));
}

function createReadOnlyCapability(
  reason: StudioDocumentRouteSchemaReadOnlyReason,
  message: string,
): Extract<StudioDocumentRouteSchemaCapability, { canWrite: false }> {
  return {
    canWrite: false,
    reason,
    message,
  };
}

function hasResolvedEnvironment(
  config: ParsedMdcmsConfig,
  environment: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    config.resolvedEnvironments,
    environment,
  );
}

function listResolvedEnvironments(config: ParsedMdcmsConfig): string[] {
  return Object.keys(config.resolvedEnvironments).sort((left, right) =>
    left.localeCompare(right),
  );
}

function resolveEnvironmentFieldTargets(
  config: ParsedMdcmsConfig,
): Record<string, Record<string, string[]>> {
  const environmentNames = listResolvedEnvironments(config);

  if (environmentNames.length <= 1) {
    return {};
  }

  const fieldTargets = new Map<string, Map<string, Set<string>>>();

  for (const environmentName of environmentNames) {
    const resolvedEnvironment = config.resolvedEnvironments[environmentName];

    if (!resolvedEnvironment) {
      continue;
    }

    for (const [typeName, typeDefinition] of Object.entries(
      resolvedEnvironment.types,
    )) {
      const typeFieldTargets =
        fieldTargets.get(typeName) ?? new Map<string, Set<string>>();

      for (const fieldName of Object.keys(typeDefinition.fields)) {
        const targets = typeFieldTargets.get(fieldName) ?? new Set<string>();
        targets.add(environmentName);
        typeFieldTargets.set(fieldName, targets);
      }

      fieldTargets.set(typeName, typeFieldTargets);
    }
  }

  const result = Object.fromEntries(
    Array.from(fieldTargets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([typeName, typeFieldTargets]) => {
        const scopedFields = Object.fromEntries(
          Array.from(typeFieldTargets.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .flatMap(([fieldName, targets]) => {
              const sortedTargets = Array.from(targets).sort((left, right) =>
                left.localeCompare(right),
              );

              return sortedTargets.length === environmentNames.length
                ? []
                : [[fieldName, sortedTargets] as const];
            }),
        );

        return [typeName, scopedFields] as const;
      })
      .filter(([, scopedFields]) => Object.keys(scopedFields).length > 0),
  );

  return result;
}

async function buildStudioSchemaSyncPayload(
  config: ParsedMdcmsConfig,
  environment: string,
): Promise<SchemaRegistrySyncPayload> {
  const payloadBase = buildSchemaRegistrySyncPayloadBase(config, environment);
  const schemaHash = await sha256Hex(
    serializeSchemaRegistrySyncHashInput({
      environment,
      ...payloadBase,
    }),
  );

  return {
    ...payloadBase,
    schemaHash,
  };
}

async function resolveSchemaHashesByEnvironment(
  config: ParsedMdcmsConfig,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    listResolvedEnvironments(config).map(async (environment) => {
      const payload = await buildStudioSchemaSyncPayload(config, environment);

      return [environment, payload.schemaHash] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function resolveStudioDocumentRoutePreparedMetadata(
  config: SharedMdcmsConfig,
): Promise<StudioDocumentRoutePreparedMetadata> {
  const parsedConfig = parseMdcmsConfig(config);
  const environment = parsedConfig.environment?.trim();

  if (!environment) {
    throw new Error(
      "Studio writes require an active environment in the local Studio config.",
    );
  }

  if (!hasResolvedEnvironment(parsedConfig, environment)) {
    throw new Error(
      `Studio writes require a resolved schema for environment "${environment}".`,
    );
  }

  return {
    schemaHashesByEnvironment:
      await resolveSchemaHashesByEnvironment(parsedConfig),
    environmentFieldTargets: resolveEnvironmentFieldTargets(parsedConfig),
  };
}

export async function resolveStudioDocumentRouteSchemaCapability(
  config: SharedMdcmsConfig,
): Promise<StudioDocumentRouteSchemaCapability> {
  const details = await resolveStudioDocumentRouteSchemaDetails(config);

  if (!details.canWrite) {
    return details;
  }

  return {
    canWrite: true,
    environment: details.environment,
    schemaHash: details.syncPayload.schemaHash,
  };
}

export async function resolveStudioDocumentRouteSchemaDetails(
  config: SharedMdcmsConfig,
): Promise<StudioDocumentRouteSchemaDetails> {
  let parsedConfig: ParsedMdcmsConfig;

  try {
    parsedConfig = parseMdcmsConfig(config);
  } catch (error) {
    return createReadOnlyCapability(
      "schema-unavailable",
      error instanceof Error
        ? error.message
        : "Studio writes require a valid authored schema configuration.",
    );
  }

  const environment = parsedConfig.environment?.trim();

  if (!environment) {
    return createReadOnlyCapability(
      "missing-environment",
      "Studio writes require an active environment in the local Studio config.",
    );
  }

  if (!hasResolvedEnvironment(parsedConfig, environment)) {
    return createReadOnlyCapability(
      "schema-unavailable",
      `Studio writes require a resolved schema for environment "${environment}".`,
    );
  }

  try {
    const syncPayload = await buildStudioSchemaSyncPayload(
      parsedConfig,
      environment,
    );

    return {
      canWrite: true,
      environment,
      syncPayload,
    };
  } catch (error) {
    return createReadOnlyCapability(
      "schema-unavailable",
      error instanceof Error
        ? `Studio could not derive a local schema hash: ${error.message}`
        : "Studio could not derive a local schema hash for editor writes.",
    );
  }
}
