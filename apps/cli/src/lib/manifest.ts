import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { RuntimeError } from "@mdcms/shared";

export type ScopedManifestEntry = {
  path: string;
  format: "md" | "mdx";
  draftRevision: number;
  publishedVersion: number | null;
  hash: string;
};

export type ScopedManifest = Record<string, ScopedManifestEntry>;

function assertString(
  value: unknown,
  field: string,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest field "${field}" must be a string.`,
      statusCode: 400,
      details: { field },
    });
  }

  const trimmed = value.trim();

  if (!options.allowEmpty && trimmed.length === 0) {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest field "${field}" cannot be empty.`,
      statusCode: 400,
      details: { field },
    });
  }

  return trimmed;
}

function assertInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest field "${field}" must be a non-negative integer.`,
      statusCode: 400,
      details: { field },
    });
  }

  return value;
}

function assertNoUnknownKeys(
  input: object,
  field: string,
  allowed: string[],
): void {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));

  if (unknown.length > 0) {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest field "${field}" has unknown keys: ${unknown.join(", ")}.`,
      statusCode: 400,
      details: { field, unknownKeys: unknown },
    });
  }
}

function parseScopedManifestEntry(
  documentId: string,
  value: unknown,
): ScopedManifestEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest entry "${documentId}" must be an object.`,
      statusCode: 400,
      details: {
        documentId,
      },
    });
  }

  const candidate = value as Record<string, unknown>;
  assertNoUnknownKeys(candidate, documentId, [
    "path",
    "format",
    "draftRevision",
    "publishedVersion",
    "hash",
  ]);
  const format = assertString(candidate.format, `${documentId}.format`);

  if (format !== "md" && format !== "mdx") {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest field "${documentId}.format" must be "md" or "mdx".`,
      statusCode: 400,
      details: {
        field: `${documentId}.format`,
      },
    });
  }

  const publishedVersionRaw = candidate.publishedVersion;
  const publishedVersion =
    publishedVersionRaw === null
      ? null
      : assertInteger(publishedVersionRaw, `${documentId}.publishedVersion`);

  return {
    path: assertString(candidate.path, `${documentId}.path`),
    format,
    draftRevision: assertInteger(
      candidate.draftRevision,
      `${documentId}.draftRevision`,
    ),
    publishedVersion,
    hash: assertString(candidate.hash, `${documentId}.hash`),
  };
}

export function resolveScopedManifestPath(input: {
  cwd: string;
  project: string;
  environment: string;
}): string {
  return join(
    input.cwd,
    ".mdcms",
    "manifests",
    `${input.project}.${input.environment}.json`,
  );
}

export async function loadScopedManifest(
  path: string,
): Promise<ScopedManifest> {
  if (!existsSync(path)) {
    return {};
  }

  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RuntimeError({
      code: "INVALID_MANIFEST",
      message: `Manifest at "${path}" must be an object map.`,
      statusCode: 400,
      details: { path },
    });
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const manifest: ScopedManifest = {};

  for (const [documentId, value] of entries) {
    const normalizedDocumentId = assertString(documentId, "documentId", {
      allowEmpty: false,
    });
    manifest[normalizedDocumentId] = parseScopedManifestEntry(
      normalizedDocumentId,
      value,
    );
  }

  return manifest;
}

export async function writeScopedManifestAtomic(
  path: string,
  manifest: ScopedManifest,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;

  await writeFile(tempPath, payload, "utf8");

  try {
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
