import { createHash } from "node:crypto";

import { RuntimeError, type JsonObject } from "@mdcms/shared";
import { eq } from "drizzle-orm";

import type { DrizzleDatabase } from "./db.js";
import { projectEnvironmentTopologySnapshots } from "./db/schema.js";
import { DEFAULT_ENVIRONMENT_NAME } from "./project-provisioning.js";

export type PersistedEnvironmentDefinition = {
  name: string;
  extends: string | null;
  isDefault: boolean;
};

export type ProjectEnvironmentTopologySnapshot = {
  project: string;
  configSnapshotHash: string;
  syncedAt: string;
  definitions: PersistedEnvironmentDefinition[];
};

function createInvalidInputError(
  field: string,
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message,
    statusCode: 400,
    details: {
      field,
      ...details,
    },
  });
}

function createInternalError(message: string): RuntimeError {
  return new RuntimeError({
    code: "INTERNAL_ERROR",
    message,
    statusCode: 500,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createInvalidInputError(
      field,
      `Field "${field}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function parseOptionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return parseRequiredString(value, field);
}

function parseStoredRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createInternalError(
      `Persisted environment topology field "${field}" is invalid.`,
    );
  }

  return value.trim();
}

function parseStoredOptionalString(
  value: unknown,
  field: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return parseStoredRequiredString(value, field);
}

export function readEnvironmentDefinitionsFromRawConfigSnapshot(
  rawConfigSnapshot: JsonObject,
): PersistedEnvironmentDefinition[] {
  const environmentsCandidate = rawConfigSnapshot.environments;

  if (!isRecord(environmentsCandidate)) {
    throw createInvalidInputError(
      "payload.rawConfigSnapshot.environments",
      'Field "payload.rawConfigSnapshot.environments" must be an object.',
      {
        path: "payload.rawConfigSnapshot.environments",
      },
    );
  }

  return Object.entries(environmentsCandidate)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([environmentName, definition]) => {
      const name = parseRequiredString(
        environmentName,
        `payload.rawConfigSnapshot.environments.${environmentName}`,
      );

      if (!isRecord(definition)) {
        throw createInvalidInputError(
          `payload.rawConfigSnapshot.environments.${name}`,
          `Field "payload.rawConfigSnapshot.environments.${name}" must be an object.`,
          {
            path: `payload.rawConfigSnapshot.environments.${name}`,
          },
        );
      }

      return {
        name,
        extends: parseOptionalString(
          definition.extends,
          `payload.rawConfigSnapshot.environments.${name}.extends`,
        ),
        isDefault: name === DEFAULT_ENVIRONMENT_NAME,
      };
    });
}

export function createConfigSnapshotHash(
  rawConfigSnapshot: JsonObject,
): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(rawConfigSnapshot))
    .digest("hex")}`;
}

function parseStoredDefinitions(
  value: unknown,
): PersistedEnvironmentDefinition[] {
  if (!Array.isArray(value)) {
    throw createInternalError(
      "Persisted environment topology snapshot is invalid.",
    );
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw createInternalError(
        `Persisted environment topology entry ${index} is invalid.`,
      );
    }

    const name = parseStoredRequiredString(
      entry.name,
      `definitions[${index}].name`,
    );
    const extendsName = parseStoredOptionalString(
      entry.extends,
      `definitions[${index}].extends`,
    );

    if (typeof entry.isDefault !== "boolean") {
      throw createInternalError(
        `Persisted environment topology entry ${index} is invalid.`,
      );
    }

    return {
      name,
      extends: extendsName,
      isDefault: entry.isDefault,
    };
  });
}

export async function upsertProjectEnvironmentTopologySnapshot(
  db: DrizzleDatabase,
  input: {
    project: string;
    rawConfigSnapshot: JsonObject;
    syncedAt: Date;
  },
): Promise<void> {
  const definitions = readEnvironmentDefinitionsFromRawConfigSnapshot(
    input.rawConfigSnapshot,
  );
  const configSnapshotHash = createConfigSnapshotHash(input.rawConfigSnapshot);

  await db
    .insert(projectEnvironmentTopologySnapshots)
    .values({
      project: input.project,
      configSnapshotHash,
      definitions,
      syncedAt: input.syncedAt,
    })
    .onConflictDoUpdate({
      target: [projectEnvironmentTopologySnapshots.project],
      set: {
        configSnapshotHash,
        definitions,
        syncedAt: input.syncedAt,
      },
    });
}

export async function loadProjectEnvironmentTopologySnapshot(
  db: DrizzleDatabase,
  project: string,
): Promise<ProjectEnvironmentTopologySnapshot | undefined> {
  const row = await db.query.projectEnvironmentTopologySnapshots.findFirst({
    where: eq(projectEnvironmentTopologySnapshots.project, project),
  });

  if (!row) {
    return undefined;
  }

  return {
    project: row.project,
    configSnapshotHash: row.configSnapshotHash,
    syncedAt: row.syncedAt.toISOString(),
    definitions: parseStoredDefinitions(row.definitions),
  };
}
