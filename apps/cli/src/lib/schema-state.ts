import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SchemaStateFile } from "@mdcms/shared";

export type { SchemaStateFile };

type SchemaStateScope = {
  cwd: string;
  project: string;
  environment: string;
};

/**
 * Builds the filesystem path for a schema state JSON file for the given scope.
 *
 * @param input - Scope specifying `cwd` (base working directory), `project`, and `environment`
 * @returns The filesystem path to the schema state JSON file (`<cwd>/.mdcms/schema/<project>.<environment>.json`)
 */
export function resolveSchemaStatePath(input: SchemaStateScope): string {
  return join(
    input.cwd,
    ".mdcms",
    "schema",
    `${input.project}.${input.environment}.json`,
  );
}

/**
 * Read and parse the persisted schema state for the given scope.
 *
 * Attempts to read the schema state file for `scope` and parse it as JSON.
 * If the file does not exist or contains invalid JSON, `undefined` is returned.
 *
 * @param scope - Scope object identifying `cwd`, `project`, and `environment` for the target state file
 * @returns The parsed `SchemaStateFile` if present and valid, `undefined` otherwise.
 */
export async function readSchemaState(
  scope: SchemaStateScope,
): Promise<SchemaStateFile | undefined> {
  const path = resolveSchemaStatePath(scope);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(raw) as SchemaStateFile;
  } catch {
    return undefined;
  }
}

/**
 * Persist schema state to the file determined by the provided scope using an atomic write.
 *
 * @param scope - Scope identifying the working directory, project, and environment that determine the target file path
 * @param state - Schema state object to serialize and persist
 * @throws The underlying filesystem error if writing or renaming the temporary file fails; the temporary file is removed before the error is rethrown
 */
export async function writeSchemaState(
  scope: SchemaStateScope,
  state: SchemaStateFile,
): Promise<void> {
  const path = resolveSchemaStatePath(scope);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  await writeFile(tempPath, payload, "utf8");
  try {
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
