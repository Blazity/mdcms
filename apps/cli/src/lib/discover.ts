import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { ScopedManifest } from "./manifest.js";

export type UntrackedFile = {
  path: string;
};

async function walkDirectory(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return results;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await walkDirectory(fullPath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".md") || lower.endsWith(".mdx")) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

export async function discoverUntrackedFiles(input: {
  cwd: string;
  contentDirectories: string[];
  manifest: ScopedManifest;
}): Promise<UntrackedFile[]> {
  const trackedPaths = new Set(
    Object.values(input.manifest).map((entry) => entry.path),
  );

  const untracked: UntrackedFile[] = [];

  for (const dir of input.contentDirectories) {
    const absoluteDir = join(input.cwd, dir);
    const files = await walkDirectory(absoluteDir);

    for (const absolutePath of files) {
      const relativePath = relative(input.cwd, absolutePath)
        .split(sep)
        .join("/");

      if (!trackedPaths.has(relativePath)) {
        untracked.push({ path: relativePath });
      }
    }
  }

  return untracked.sort((a, b) => a.path.localeCompare(b.path));
}
