import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const CLI_CONFIG_FILE_NAMES = [
  "mdcms.config.ts",
  "mdcms.config.js",
  "mdcms.config.mjs",
] as const;

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function resolveCliConfigPath(options: {
  cwd: string;
  configPath?: string;
}): Promise<string> {
  if (options.configPath) {
    return resolve(options.cwd, options.configPath);
  }

  let current = resolve(options.cwd);

  while (true) {
    for (const fileName of CLI_CONFIG_FILE_NAMES) {
      const candidate = join(current, fileName);
      if (await isFile(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(options.cwd, "mdcms.config.ts");
    }
    current = parent;
  }
}

export async function resolveCliConfigRoot(options: {
  cwd: string;
  configPath?: string;
}): Promise<string> {
  if (options.configPath) {
    return dirname(resolve(options.cwd, options.configPath));
  }

  const configPath = await resolveCliConfigPath(options);
  return dirname(configPath);
}
