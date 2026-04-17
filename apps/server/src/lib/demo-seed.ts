import type { ParsedMdcmsConfig } from "@mdcms/shared";
import { buildSchemaSyncPayload } from "@mdcms/shared/server";

import { createDatabaseEnvironmentStore } from "./environments-api.js";
import { loadServerConfig } from "./config.js";
import type { DrizzleDatabase } from "./db.js";
import { upsertProjectEnvironmentTopologySnapshot } from "./environment-topology.js";
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

function assertConfigProjectMatch(
  loaded: { config: ParsedMdcmsConfig; configPath: string },
  targetProject: string,
): void {
  if (loaded.config.project === targetProject) {
    return;
  }

  throw new Error(
    [
      `Project mismatch: config at "${loaded.configPath}" declares project "${loaded.config.project}" but the demo seed targets project "${targetProject}".`,
      "",
      "To fix:",
      `  - Update the "project" field in the config to "${targetProject}"`,
      `  - Or set MDCMS_DEMO_PROJECT="${loaded.config.project}" to match the config`,
    ].join("\n"),
  );
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
  assertConfigProjectMatch(loaded, options.project);

  const definition = loaded.config.environments[options.environment];

  if (!definition) {
    throw new Error(
      `Demo seed environment "${options.environment}" is not defined in ${loaded.configPath}.`,
    );
  }

  await upsertProjectEnvironmentTopologySnapshot(options.db, {
    project: options.project,
    rawConfigSnapshot: buildSchemaSyncPayload(
      loaded.config,
      DEFAULT_ENVIRONMENT_NAME,
    ).rawConfigSnapshot,
    syncedAt: new Date(),
  });

  const environmentStore = createDatabaseEnvironmentStore({
    db: options.db,
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
  assertConfigProjectMatch(loaded, options.project);
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
