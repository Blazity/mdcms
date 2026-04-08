import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildStudioRuntimeArtifacts,
  type StudioRuntimeBuildResult,
} from "@mdcms/studio/build-runtime";

import { resolveStudioReviewAppRoot } from "./app-root";
import { getReviewRuntimeBuildPaths } from "./runtime-artifacts";

const REVIEW_RUNTIME_STUDIO_VERSION = "0.0.1";
const REVIEW_RUNTIME_MIN_STUDIO_PACKAGE_VERSION = "0.0.1";
const REVIEW_RUNTIME_MIN_HOST_BRIDGE_VERSION = "1.0.0";

export function resolveStudioProjectRoot(
  appRoot = resolveStudioReviewAppRoot(),
): string {
  const studioProjectRootCandidates = [
    resolve(process.cwd(), "packages/studio"),
    resolve(appRoot, "../../packages/studio"),
  ];

  return (
    studioProjectRootCandidates.find((candidate) => existsSync(candidate)) ??
    studioProjectRootCandidates[0]
  );
}

export function getReviewRuntimeWatchRoots(
  appRoot = resolveStudioReviewAppRoot(),
): string[] {
  return [
    resolve(appRoot, "review"),
    resolve(appRoot, "../../packages/studio/src"),
    resolve(appRoot, "../../packages/shared/src"),
  ];
}

export async function buildReviewRuntimeArtifacts(
  appRoot = resolveStudioReviewAppRoot(),
): Promise<StudioRuntimeBuildResult> {
  const { outDir } = getReviewRuntimeBuildPaths(appRoot);

  return await buildStudioRuntimeArtifacts({
    projectRoot: resolveStudioProjectRoot(appRoot),
    sourceFile: `${appRoot}/review/runtime-entry.ts`,
    outDir,
    studioVersion: REVIEW_RUNTIME_STUDIO_VERSION,
    minStudioPackageVersion: REVIEW_RUNTIME_MIN_STUDIO_PACKAGE_VERSION,
    minHostBridgeVersion: REVIEW_RUNTIME_MIN_HOST_BRIDGE_VERSION,
  });
}
