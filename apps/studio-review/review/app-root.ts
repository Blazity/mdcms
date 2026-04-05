import { existsSync } from "node:fs";
import { resolve } from "node:path";

const REVIEW_APP_PATH_SEGMENT = "apps/studio-review";

function looksLikeStudioReviewAppRoot(candidatePath: string): boolean {
  return (
    existsSync(resolve(candidatePath, "app")) &&
    existsSync(resolve(candidatePath, "package.json"))
  );
}

export function resolveStudioReviewAppRoot(
  currentWorkingDirectory = process.cwd(),
): string {
  if (looksLikeStudioReviewAppRoot(currentWorkingDirectory)) {
    return currentWorkingDirectory;
  }

  const nestedCandidate = resolve(currentWorkingDirectory, REVIEW_APP_PATH_SEGMENT);

  if (looksLikeStudioReviewAppRoot(nestedCandidate)) {
    return nestedCandidate;
  }

  return currentWorkingDirectory.endsWith(REVIEW_APP_PATH_SEGMENT)
    ? currentWorkingDirectory
    : nestedCandidate;
}
