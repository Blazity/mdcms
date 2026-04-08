import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  buildReviewRuntimeArtifacts,
  getReviewRuntimeWatchRoots,
} from "../review/runtime-build";

const DEFAULT_POLL_INTERVAL_MS = 750;

async function collectFileEntries(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFileEntries(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function createWatchSignature(watchRoots: string[]): Promise<string> {
  const rows: string[] = [];

  for (const watchRoot of watchRoots) {
    const files = await collectFileEntries(watchRoot);

    for (const filePath of files) {
      const metadata = await stat(filePath);
      rows.push(
        `${watchRoot}:${relative(watchRoot, filePath)}:${metadata.size}:${metadata.mtimeMs}`,
      );
    }
  }

  rows.sort();
  return rows.join("|");
}

async function rebuildRuntime(reason: string): Promise<void> {
  const build = await buildReviewRuntimeArtifacts();
  console.info(
    `[studio-review-runtime-watch] rebuilt (${reason}) ${build.entryFile} (${build.buildId})`,
  );
}

async function main(): Promise<void> {
  const watchRoots = getReviewRuntimeWatchRoots();
  const intervalMs = Number.parseInt(
    process.env.MDCMS_STUDIO_REVIEW_RUNTIME_WATCH_INTERVAL_MS ?? "",
    10,
  );
  const pollIntervalMs = Number.isFinite(intervalMs)
    ? Math.max(intervalMs, 100)
    : DEFAULT_POLL_INTERVAL_MS;
  let previousSignature = await createWatchSignature(watchRoots);

  console.info(
    `[studio-review-runtime-watch] polling ${watchRoots.join(", ")} every ${pollIntervalMs}ms`,
  );

  while (true) {
    await sleep(pollIntervalMs);

    let nextSignature: string;
    try {
      nextSignature = await createWatchSignature(watchRoots);
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error(
        `[studio-review-runtime-watch] failed to scan source trees: ${message}`,
      );
      continue;
    }

    if (nextSignature === previousSignature) {
      continue;
    }

    previousSignature = nextSignature;

    try {
      await rebuildRuntime("source change");
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error(`[studio-review-runtime-watch] build failed: ${message}`);
    }
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[studio-review-runtime-watch] fatal error: ${message}`);
  process.exitCode = 1;
});
