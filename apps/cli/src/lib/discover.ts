import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { ScopedManifest } from "./manifest.js";

export type UntrackedFile = {
  path: string;
};

/**
 * Recursively collects paths of Markdown files under the given directory.
 *
 * Traverses `dir` and returns full paths for files whose names end with `.md` or `.mdx` (case-insensitive).
 *
 * @param dir - Path of the directory to traverse
 * @returns An array of matching file paths found under `dir`
 *
 * If `dir` does not exist, returns an empty array. Other filesystem errors are propagated.
 */
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

/**
 * Finds Markdown (`.md`/`.mdx`) files inside the provided content directories that are not present in the manifest.
 *
 * The returned file paths are relative to `input.cwd` and the result is sorted by `path` using locale order.
 * If a content directory does not exist, it is treated as empty (no files discovered).
 *
 * @param input - The discovery inputs.
 * @param input.cwd - The current working directory used to resolve and relativize file paths.
 * @param input.contentDirectories - Directories (relative to `cwd`) to recursively scan for `.md` and `.mdx` files.
 * @param input.manifest - A ScopedManifest whose entries' `path` fields denote tracked files.
 * @returns An array of `UntrackedFile` objects for files found in the content directories whose relative paths are not present in the manifest.
 */
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
      const relativePath = relative(input.cwd, absolutePath);

      if (!trackedPaths.has(relativePath)) {
        untracked.push({ path: relativePath });
      }
    }
  }

  return untracked.sort((a, b) => a.path.localeCompare(b.path));
}
