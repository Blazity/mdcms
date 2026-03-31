import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { scanContentFiles } from "./scan.js";

async function withTempDir(
  run: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-cli-scan-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("discovers .md and .mdx files in nested directories", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(join(cwd, "content", "index.md"), "# Hello\n");
    await writeFile(
      join(cwd, "content", "blog", "post.mdx"),
      "---\ntitle: Post\n---\nBody\n",
    );

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 2);
    assert.equal(files[0]!.relativePath, "content/blog/post.mdx");
    assert.equal(files[0]!.format, "mdx");
    assert.equal(files[1]!.relativePath, "content/index.md");
    assert.equal(files[1]!.format, "md");
  });
});

test("skips node_modules, .git, .mdcms, dist, build", async () => {
  await withTempDir(async (cwd) => {
    const skipDirs = ["node_modules", ".git", ".mdcms", "dist", "build"];
    for (const dir of skipDirs) {
      await mkdir(join(cwd, dir), { recursive: true });
      await writeFile(join(cwd, dir, "secret.md"), "# Hidden\n");
    }
    await writeFile(join(cwd, "visible.md"), "# Visible\n");

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.equal(files[0]!.relativePath, "visible.md");
  });
});

test("extracts frontmatter keys from discovered files", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(
      join(cwd, "page.md"),
      "---\ntitle: Hello\ndate: 2026-01-01\ntags:\n  - a\n  - b\n---\nBody\n",
    );

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0]!.frontmatterKeys, ["title", "date", "tags"]);
    assert.equal(files[0]!.frontmatter["title"], "Hello");
  });
});

test("detects locale hint from frontmatter key", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(
      join(cwd, "page.md"),
      "---\nlocale: fr\ntitle: Bonjour\n---\nBody\n",
    );

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0]!.localeHint, {
      source: "frontmatter",
      rawValue: "fr",
    });
  });
});

test("detects locale hint from filename suffix (e.g., about.fr.md)", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(join(cwd, "about.fr.md"), "# About\n");

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0]!.localeHint, {
      source: "suffix",
      rawValue: "fr",
    });
  });
});

test("detects locale hint from folder segment (e.g., content/fr/about.md)", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content", "fr"), { recursive: true });
    await writeFile(join(cwd, "content", "fr", "about.md"), "# About\n");

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0]!.localeHint, {
      source: "folder",
      rawValue: "fr",
    });
  });
});

test("frontmatter locale takes precedence over suffix", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(
      join(cwd, "page.de.md"),
      "---\nlang: fr\n---\nBody\n",
    );

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0]!.localeHint, {
      source: "frontmatter",
      rawValue: "fr",
    });
  });
});

test("files without frontmatter have empty keys and no locale hint", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(join(cwd, "plain.md"), "Just a plain file.\n");

    const files = await scanContentFiles(cwd);

    assert.equal(files.length, 1);
    assert.deepEqual(files[0]!.frontmatterKeys, []);
    assert.deepEqual(files[0]!.frontmatter, {});
    assert.equal(files[0]!.localeHint, null);
  });
});
