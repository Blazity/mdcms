import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import { parseMarkdownDocument } from "../push.js";

export type LocaleHint = {
  source: "frontmatter" | "suffix" | "folder";
  rawValue: string;
};

export type DiscoveredFile = {
  relativePath: string;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  frontmatterKeys: string[];
  localeHint: LocaleHint | null;
};

const SKIP_DIRS = new Set(["node_modules", ".git", ".mdcms", "dist", "build"]);

const FRONTMATTER_LOCALE_KEYS = ["locale", "lang", "language"] as const;

const LOCALE_PATTERN = /^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i;

function detectLocaleHint(
  relativePath: string,
  frontmatter: Record<string, unknown>,
): LocaleHint | null {
  // 1. Frontmatter locale keys (highest precedence)
  for (const key of FRONTMATTER_LOCALE_KEYS) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.length > 0) {
      return { source: "frontmatter", rawValue: value };
    }
  }

  // 2. Suffix pattern: file.fr.md or file.fr.mdx
  const basename = relativePath.split("/").pop() ?? "";
  const parts = basename.split(".");
  // e.g. ["about", "fr", "md"] → candidate is parts[-2] when length >= 3
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2]!;
    if (LOCALE_PATTERN.test(candidate)) {
      return { source: "suffix", rawValue: candidate };
    }
  }

  // 3. Folder segment
  const segments = relativePath.split("/");
  // Skip the last segment (filename), check from left to right
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    if (LOCALE_PATTERN.test(segment)) {
      return { source: "folder", rawValue: segment };
    }
  }

  return null;
}

async function walkDirectory(
  dir: string,
  rootDir: string,
  results: DiscoveredFile[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walkDirectory(fullPath, rootDir, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = extname(entry.name).toLowerCase();
    if (ext !== ".md" && ext !== ".mdx") {
      continue;
    }

    const format: "md" | "mdx" = ext === ".mdx" ? "mdx" : "md";
    const relPath = relative(rootDir, fullPath).split(sep).join("/");

    let frontmatter: Record<string, unknown> = {};
    try {
      const content = await readFile(fullPath, "utf-8");
      const parsed = parseMarkdownDocument(content);
      frontmatter = parsed.frontmatter;
    } catch {
      // Malformed frontmatter — treat as empty
    }

    const frontmatterKeys = Object.keys(frontmatter);
    const localeHint = detectLocaleHint(relPath, frontmatter);

    results.push({
      relativePath: relPath,
      format,
      frontmatter,
      frontmatterKeys,
      localeHint,
    });
  }
}

export async function scanContentFiles(
  cwd: string,
): Promise<DiscoveredFile[]> {
  const results: DiscoveredFile[] = [];
  await walkDirectory(cwd, cwd, results);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}
