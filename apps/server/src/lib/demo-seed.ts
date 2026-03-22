import { createHash } from "node:crypto";

import {
  serializeResolvedEnvironmentSchema,
  type JsonObject,
  type ParsedMdcmsConfig,
} from "@mdcms/shared";

import { createDatabaseEnvironmentStore } from "./environments-api.js";
import { loadServerConfig } from "./config.js";
import type { DrizzleDatabase } from "./db.js";
import {
  DEFAULT_ENVIRONMENT_NAME,
  ensureProjectProvisioned,
  resolveProjectEnvironmentScope,
} from "./project-provisioning.js";
import { createDatabaseSchemaStore } from "./schema-api.js";

export const DEFAULT_DEMO_CONFIG_PATH = "../studio-example/mdcms.config.ts";

export type EnsureDemoScopeProvisionedOptions = {
  db: DrizzleDatabase;
  project: string;
  environment: string;
  cwd?: string;
  configPath?: string;
};

function createMissingConfigError(input: {
  environment: string;
  cwd: string;
  configPath: string;
}): Error {
  return new Error(
    `Demo seed environment "${input.environment}" requires a readable mdcms.config.ts with an "environments.${input.environment}" definition. Checked ${input.configPath} from ${input.cwd}.`,
  );
}

async function loadDemoConfig(
  options: Pick<
    EnsureDemoScopeProvisionedOptions,
    "cwd" | "configPath" | "environment"
  >,
): Promise<{ config: ParsedMdcmsConfig; configPath: string }> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_DEMO_CONFIG_PATH;
  const loaded = await loadServerConfig({
    cwd,
    configPath,
  });

  if (!loaded) {
    throw createMissingConfigError({
      environment: options.environment,
      cwd,
      configPath,
    });
  }

  return loaded;
}

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

function buildSchemaSyncPayload(
  config: ParsedMdcmsConfig,
  environment: string,
): {
  rawConfigSnapshot: JsonObject;
  resolvedSchema: ReturnType<typeof serializeResolvedEnvironmentSchema>;
  schemaHash: string;
} {
  const rawConfigSnapshot = toRawConfigSnapshot(config);
  const resolvedSchema = serializeResolvedEnvironmentSchema(
    config,
    environment,
  );
  const schemaHash = createHash("sha256")
    .update(
      JSON.stringify({
        environment,
        rawConfigSnapshot,
        resolvedSchema,
      }),
    )
    .digest("hex");

  return {
    rawConfigSnapshot,
    resolvedSchema,
    schemaHash,
  };
}

export async function ensureDemoScopeProvisioned(
  options: EnsureDemoScopeProvisionedOptions,
): Promise<void> {
  const existing = await resolveProjectEnvironmentScope(options.db, {
    project: options.project,
    environment: options.environment,
    createIfMissing: options.environment === DEFAULT_ENVIRONMENT_NAME,
  });

  if (existing) {
    return;
  }

  await ensureProjectProvisioned(options.db, {
    project: options.project,
  });

  if (options.environment === DEFAULT_ENVIRONMENT_NAME) {
    return;
  }

  const loaded = await loadDemoConfig(options);

  const definition = loaded.config.environments[options.environment];

  if (!definition) {
    throw new Error(
      `Demo seed environment "${options.environment}" is not defined in ${loaded.configPath}.`,
    );
  }

  const environmentStore = createDatabaseEnvironmentStore({
    db: options.db,
    getConfig: async () => loaded.config,
  });

  await environmentStore.create(options.project, {
    name: options.environment,
    ...(definition.extends ? { extends: definition.extends } : {}),
  });
}

export async function ensureDemoSchemaSynced(
  options: EnsureDemoScopeProvisionedOptions,
): Promise<void> {
  await ensureDemoScopeProvisioned(options);

  const loaded = await loadDemoConfig(options);
  const payload = buildSchemaSyncPayload(loaded.config, options.environment);
  const schemaStore = createDatabaseSchemaStore({
    db: options.db,
  });

  await schemaStore.sync(
    {
      project: options.project,
      environment: options.environment,
    },
    payload,
  );
}
