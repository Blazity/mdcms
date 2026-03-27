import {
  parseMdcmsConfig,
  serializeResolvedEnvironmentSchema,
  type JsonObject,
  type MdcmsConfig as SharedMdcmsConfig,
  type ParsedMdcmsConfig,
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

function toRawConfigSnapshot(config: ParsedMdcmsConfig): JsonObject {
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
): StudioDocumentRouteSchemaCapability {
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

export async function resolveStudioDocumentRouteSchemaCapability(
  config: SharedMdcmsConfig,
): Promise<StudioDocumentRouteSchemaCapability> {
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
    const rawConfigSnapshot = toRawConfigSnapshot(parsedConfig);
    const resolvedSchema = serializeResolvedEnvironmentSchema(
      parsedConfig,
      environment,
    );
    const schemaHash = await sha256Hex(
      JSON.stringify({
        environment,
        rawConfigSnapshot,
        resolvedSchema,
      }),
    );

    return {
      canWrite: true,
      environment,
      schemaHash,
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
