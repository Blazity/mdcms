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
};

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

  return {
    config: parseMdcmsConfig(configModule.default ?? configModule),
    configPath,
  };
}
