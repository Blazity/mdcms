import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { RuntimeError } from "@mdcms/shared";

export type CliContentTypeConfig = {
  name: string;
  directory?: string;
  localized?: boolean;
};

export type CliConfig = {
  serverUrl: string;
  project?: string;
  environment?: string;
  types?: CliContentTypeConfig[];
};

function assertNonEmptyString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RuntimeError({
      code: "INVALID_CONFIG",
      message: `Config field "${field}" must be a string.`,
      statusCode: 400,
      details: { field },
    });
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTypes(value: unknown): CliContentTypeConfig[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new RuntimeError({
      code: "INVALID_CONFIG",
      message: `Config field "types" must be an array.`,
      statusCode: 400,
      details: { field: "types" },
    });
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new RuntimeError({
        code: "INVALID_CONFIG",
        message: `Config field "types[${index}]" must be an object.`,
        statusCode: 400,
        details: { field: `types[${index}]` },
      });
    }

    const candidate = entry as Record<string, unknown>;
    const name =
      assertNonEmptyString(candidate.name, `types[${index}].name`) ??
      assertNonEmptyString(candidate.id, `types[${index}].id`);

    if (!name) {
      throw new RuntimeError({
        code: "INVALID_CONFIG",
        message: `Config field "types[${index}].name" is required.`,
        statusCode: 400,
        details: { field: `types[${index}].name` },
      });
    }

    if (
      candidate.localized !== undefined &&
      typeof candidate.localized !== "boolean"
    ) {
      throw new RuntimeError({
        code: "INVALID_CONFIG",
        message: `Config field "types[${index}].localized" must be a boolean.`,
        statusCode: 400,
        details: { field: `types[${index}].localized` },
      });
    }

    return {
      name,
      directory: assertNonEmptyString(
        candidate.directory,
        `types[${index}].directory`,
      ),
      localized:
        typeof candidate.localized === "boolean"
          ? candidate.localized
          : undefined,
    };
  });
}

export async function loadCliConfig(options: {
  cwd: string;
  configPath?: string;
}): Promise<{ config: CliConfig; configPath: string }> {
  const configPath = resolve(
    options.cwd,
    options.configPath ?? "mdcms.config.ts",
  );

  if (!existsSync(configPath)) {
    throw new RuntimeError({
      code: "CONFIG_NOT_FOUND",
      message: `Could not find config file at "${configPath}".`,
      statusCode: 404,
      details: {
        configPath,
      },
    });
  }

  const configModule = await import(
    `${pathToFileURL(configPath).href}?t=${Date.now()}`
  );
  const raw = (configModule.default ?? configModule) as Record<string, unknown>;
  const serverUrl = assertNonEmptyString(raw.serverUrl, "serverUrl");

  if (!serverUrl) {
    throw new RuntimeError({
      code: "INVALID_CONFIG",
      message: `Config field "serverUrl" is required.`,
      statusCode: 400,
      details: { field: "serverUrl" },
    });
  }

  return {
    config: {
      serverUrl,
      project: assertNonEmptyString(raw.project, "project"),
      environment: assertNonEmptyString(raw.environment, "environment"),
      types: parseTypes(raw.types),
    },
    configPath,
  };
}
