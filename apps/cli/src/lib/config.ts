import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  RuntimeError,
  parseMdcmsConfig,
  type ParsedMdcmsConfig,
  type ParsedMdcmsTypeDefinition,
} from "@mdcms/shared";

export type CliContentTypeConfig = Pick<
  ParsedMdcmsTypeDefinition,
  "name" | "directory" | "localized"
> &
  Partial<Pick<ParsedMdcmsTypeDefinition, "fields" | "referenceFields">>;

export type CliConfig = Pick<
  ParsedMdcmsConfig,
  "serverUrl" | "project" | "environment"
> & {
  contentDirectories?: ParsedMdcmsConfig["contentDirectories"];
  locales?: ParsedMdcmsConfig["locales"];
  types?: CliContentTypeConfig[];
  components?: ParsedMdcmsConfig["components"];
  environments?: ParsedMdcmsConfig["environments"];
  resolvedEnvironments?: ParsedMdcmsConfig["resolvedEnvironments"];
};

export type LoadedCliConfig = CliConfig &
  Pick<
    ParsedMdcmsConfig,
    | "contentDirectories"
    | "locales"
    | "components"
    | "environments"
    | "resolvedEnvironments"
  > & {
    types: CliContentTypeConfig[];
  };

/**
 * Load and parse the CLI configuration file from the given working directory.
 *
 * @param options.cwd - Directory used to resolve the configuration file
 * @param options.configPath - Optional path to the config file relative to `cwd`; defaults to `"mdcms.config.ts"`
 * @returns An object containing `config`: the parsed CLI configuration and `configPath`: the resolved absolute path to the loaded config file
 * @throws {RuntimeError} When the config file does not exist (`code: "CONFIG_NOT_FOUND"`, `statusCode: 404`) or when importing the file fails (`code: "CONFIG_LOAD_FAILED"`, `statusCode: 400`)
 */
export async function loadCliConfig(options: {
  cwd: string;
  configPath?: string;
}): Promise<{ config: LoadedCliConfig; configPath: string }> {
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

  let configModule: Record<string, unknown>;
  try {
    configModule = await import(
      `${pathToFileURL(configPath).href}?t=${Date.now()}`
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Unknown import error";

    throw new RuntimeError({
      code: "CONFIG_LOAD_FAILED",
      message: `Failed to load config from "${configPath}": ${message}`,
      statusCode: 400,
      details: { configPath },
    });
  }

  return {
    config: parseMdcmsConfig(
      configModule.default ?? configModule,
    ) as LoadedCliConfig,
    configPath,
  };
}
