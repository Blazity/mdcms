import { resolve } from "node:path";

const REVIEW_APP_PATH_SEGMENT = "apps/studio-review";

export function resolveStudioReviewAppRoot(
  currentWorkingDirectory = process.cwd(),
): string {
  return currentWorkingDirectory.endsWith(REVIEW_APP_PATH_SEGMENT)
    ? currentWorkingDirectory
    : resolve(currentWorkingDirectory, REVIEW_APP_PATH_SEGMENT);
}
