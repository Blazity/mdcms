import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { StudioBootstrapManifest } from "@mdcms/shared";
import { resolveStudioReviewAppRoot } from "./app-root";

export type ReviewRuntimeBuildPaths = {
  appRoot: string;
  outDir: string;
  latestBootstrapPath: string;
};

export function getReviewRuntimeBuildPaths(
  appRoot = resolveStudioReviewAppRoot(),
): ReviewRuntimeBuildPaths {
  const outDir = resolve(appRoot, ".generated/runtime");

  return {
    appRoot,
    outDir,
    latestBootstrapPath: resolve(outDir, "bootstrap/latest.json"),
  };
}

export function resolveReviewRuntimeAssetPath(
  outDir: string,
  buildId: string,
  fileName: string,
): string {
  return resolve(outDir, "assets", buildId, fileName);
}

export function scopeReviewRuntimeManifestToScenario(
  manifest: StudioBootstrapManifest,
  scenario: string,
): StudioBootstrapManifest {
  return manifest.entryUrl.startsWith("/")
    ? {
        ...manifest,
        entryUrl: `/review-api/${scenario}${manifest.entryUrl}`,
      }
    : manifest;
}

export async function readReviewRuntimeBootstrapManifest(
  appRoot?: string,
): Promise<StudioBootstrapManifest> {
  const { latestBootstrapPath } = getReviewRuntimeBuildPaths(appRoot);
  const raw = await readFile(latestBootstrapPath, "utf8");

  return JSON.parse(raw) as StudioBootstrapManifest;
}

export async function readReviewRuntimeAsset(input: {
  appRoot?: string;
  buildId: string;
  fileName: string;
}): Promise<Uint8Array> {
  const { outDir } = getReviewRuntimeBuildPaths(input.appRoot);
  const filePath = resolveReviewRuntimeAssetPath(
    outDir,
    input.buildId,
    input.fileName,
  );

  return new Uint8Array(await readFile(filePath));
}
