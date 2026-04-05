import { buildReviewRuntimeArtifacts } from "../review/runtime-build";

buildReviewRuntimeArtifacts()
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
