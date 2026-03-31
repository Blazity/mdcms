import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SchemaStateFile } from "@mdcms/shared";

export type { SchemaStateFile };

type SchemaStateScope = {
  cwd: string;
  project: string;
  environment: string;
};

export function resolveSchemaStatePath(input: SchemaStateScope): string {
  return join(
    input.cwd,
    ".mdcms",
    "schema",
    `${input.project}.${input.environment}.json`,
  );
}

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
