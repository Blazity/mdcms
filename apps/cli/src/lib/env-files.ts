import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseDotenv } from "dotenv";

import { resolveCliConfigRoot } from "./config-path.js";

export type CliEnvFileWarning = {
  filePath: string;
  message: string;
};

export type LoadCliEnvFilesOptions = {
  cwd: string;
  configPath?: string;
  env: NodeJS.ProcessEnv;
  disabled?: boolean;
};

export type LoadCliEnvFilesResult = {
  envRoot: string;
  loadedFiles: string[];
  warnings: CliEnvFileWarning[];
};

function normalizeMode(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "development";
}

function getEnvFileNames(mode: string): string[] {
  return [
    ".env",
    `.env.${mode}`,
    ...(mode === "test" ? [] : [".env.local"]),
    `.env.${mode}.local`,
  ];
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function validateEnvFileSyntax(filePath: string, content: string): void {
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      return;
    }

    const candidate = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trimStart()
      : trimmed;

    if (!/^[A-Za-z_][A-Za-z0-9_.-]*\s*=/.test(candidate)) {
      throw new Error(`Invalid env assignment at ${filePath}:${index + 1}.`);
    }
  });
}

export async function loadCliEnvFiles(
  options: LoadCliEnvFilesOptions,
): Promise<LoadCliEnvFilesResult> {
  const envRoot = await resolveCliConfigRoot({
    cwd: options.cwd,
    configPath: options.configPath,
  });
  const loadedFiles: string[] = [];
  const warnings: CliEnvFileWarning[] = [];

  if (options.disabled) {
    return { envRoot, loadedFiles, warnings };
  }

  if (!options.env.NODE_ENV || options.env.NODE_ENV.trim().length === 0) {
    options.env.NODE_ENV = "development";
  }

  const protectedKeys = new Set(
    Object.keys(options.env).filter((key) => options.env[key] !== undefined),
  );
  const mode = normalizeMode(options.env.NODE_ENV);

  for (const fileName of getEnvFileNames(mode)) {
    const filePath = join(envRoot, fileName);
    let content: string;

    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : undefined;

      if (code !== "ENOENT") {
        warnings.push({
          filePath,
          message: formatUnknownError(error),
        });
      }
      continue;
    }

    try {
      validateEnvFileSyntax(filePath, content);
      const parsed = parseDotenv(content);
      for (const [key, value] of Object.entries(parsed)) {
        if (!protectedKeys.has(key)) {
          options.env[key] = value;
        }
      }
      loadedFiles.push(filePath);
    } catch (error) {
      warnings.push({
        filePath,
        message: formatUnknownError(error),
      });
    }
  }

  return { envRoot, loadedFiles, warnings };
}
