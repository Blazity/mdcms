import { existsSync } from "node:fs";
import { buildStudioRuntimeArtifacts } from "@mdcms/studio/build-runtime";
import { resolve } from "node:path";

import { getReviewRuntimeBuildPaths } from "../review/runtime-artifacts";

const { appRoot, outDir } = getReviewRuntimeBuildPaths();
const studioProjectRootCandidates = [
  resolve(process.cwd(), "packages/studio"),
  resolve(appRoot, "../../packages/studio"),
];
const studioProjectRoot =
  studioProjectRootCandidates.find((candidate) => existsSync(candidate)) ??
  studioProjectRootCandidates[0];

buildStudioRuntimeArtifacts({
  projectRoot: studioProjectRoot,
  sourceFile: `${appRoot}/review/runtime-entry.ts`,
  outDir,
  studioVersion: "0.0.1",
  minStudioPackageVersion: "0.0.1",
  minHostBridgeVersion: "1.0.0",
})
  .then((result) => {
    console.info(
      `[studio-review-runtime] built ${result.entryFile} (${result.buildId}) -> ${result.bootstrapPath}`,
    );
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[studio-review-runtime] build failed: ${message}`);
    process.exitCode = 1;
  });
