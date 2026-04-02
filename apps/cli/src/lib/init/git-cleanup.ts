import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync, execSync } from "node:child_process";
import { join } from "node:path";

const HEADER = "# mdcms managed content";

export async function updateGitignore(
  cwd: string,
  managedDirectories: string[],
): Promise<void> {
  const gitignorePath = join(cwd, ".gitignore");

  const existing = existsSync(gitignorePath)
    ? await readFile(gitignorePath, "utf8")
    : "";

  const existingLines = new Set(
    existing
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );

  const newEntries: string[] = [];

  if (!existingLines.has(".mdcms/") && !existingLines.has(".mdcms")) {
    newEntries.push(".mdcms/");
  }

  for (const dir of managedDirectories) {
    const withSlash = dir.endsWith("/") ? dir : `${dir}/`;
    const withoutSlash = dir.endsWith("/") ? dir.slice(0, -1) : dir;

    if (!existingLines.has(withSlash) && !existingLines.has(withoutSlash)) {
      newEntries.push(withSlash);
    }
  }

  if (newEntries.length === 0) {
    return;
  }

  let content = existing;

  // Ensure the existing content ends with a newline before appending
  if (content.length > 0 && !content.endsWith("\n")) {
    content += "\n";
  }

  // Add a blank line separator if existing content is non-empty
  if (content.length > 0 && !content.endsWith("\n\n")) {
    content += "\n";
  }

  content += `${HEADER}\n`;
  for (const entry of newEntries) {
    content += `${entry}\n`;
  }

  await writeFile(gitignorePath, content, "utf8");
}

export async function detectTrackedFiles(
  cwd: string,
  managedDirectories: string[],
): Promise<string[]> {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      stdio: "ignore",
    });
  } catch {
    return [];
  }

  const tracked: string[] = [];

  for (const dir of managedDirectories) {
    try {
      const output = execFileSync("git", ["ls-files", dir], {
        cwd,
        encoding: "utf8",
      });

      const lines = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      tracked.push(...lines);
    } catch {
      // Directory may not exist or not have tracked files — skip
    }
  }

  return tracked;
}

export async function untrackFiles(
  cwd: string,
  directories: string[],
): Promise<string[]> {
  const removed: string[] = [];

  for (const dir of directories) {
    try {
      const output = execFileSync("git", ["rm", "-r", "--cached", dir], {
        cwd,
        encoding: "utf8",
      });

      const lines = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        // Format: rm 'path/to/file'
        const match = line.match(/^rm '(.+)'$/);
        if (match) {
          removed.push(match[1]!);
        }
      }
    } catch {
      // Directory may not be tracked — skip
    }
  }

  return removed;
}
