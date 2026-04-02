import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { discoverUntrackedFiles } from "./discover.js";
import type { ScopedManifest } from "./manifest.js";

async function withTempDir(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-discover-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("discoverUntrackedFiles returns files not in manifest", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content", "posts"), { recursive: true });
    await writeFile(join(cwd, "content/posts/tracked.md"), "# Tracked\n", "utf8");
    await writeFile(join(cwd, "content/posts/new-post.md"), "# New\n", "utf8");
    await writeFile(join(cwd, "content/posts/another.mdx"), "# Another\n", "utf8");

    const manifest: ScopedManifest = {
      "doc-1": {
        path: "content/posts/tracked.md",
        format: "md",
        draftRevision: 1,
        publishedVersion: null,
        hash: "abc",
      },
    };

    const result = await discoverUntrackedFiles({
      cwd,
      contentDirectories: ["content"],
      manifest,
    });

    const paths = result.map((f) => f.path).sort();
    assert.deepEqual(paths, [
      "content/posts/another.mdx",
      "content/posts/new-post.md",
    ]);
  });
});

test("discoverUntrackedFiles ignores non-md/mdx files", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content"), { recursive: true });
    await writeFile(join(cwd, "content/readme.txt"), "hello", "utf8");
    await writeFile(join(cwd, "content/data.json"), "{}", "utf8");

    const result = await discoverUntrackedFiles({
      cwd,
      contentDirectories: ["content"],
      manifest: {},
    });

    assert.equal(result.length, 0);
  });
});

test("discoverUntrackedFiles returns empty when all files are tracked", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content", "posts"), { recursive: true });
    await writeFile(join(cwd, "content/posts/hello.md"), "# Hello\n", "utf8");

    const manifest: ScopedManifest = {
      "doc-1": {
        path: "content/posts/hello.md",
        format: "md",
        draftRevision: 1,
        publishedVersion: null,
        hash: "abc",
      },
    };

    const result = await discoverUntrackedFiles({
      cwd,
      contentDirectories: ["content"],
      manifest,
    });

    assert.equal(result.length, 0);
  });
});

test("discoverUntrackedFiles scans multiple content directories", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await mkdir(join(cwd, "pages"), { recursive: true });
    await writeFile(join(cwd, "content/blog/post.md"), "# Post\n", "utf8");
    await writeFile(join(cwd, "pages/about.md"), "# About\n", "utf8");

    const result = await discoverUntrackedFiles({
      cwd,
      contentDirectories: ["content", "pages"],
      manifest: {},
    });

    const paths = result.map((f) => f.path).sort();
    assert.deepEqual(paths, ["content/blog/post.md", "pages/about.md"]);
  });
});

test("discoverUntrackedFiles handles missing content directory gracefully", async () => {
  await withTempDir(async (cwd) => {
    const result = await discoverUntrackedFiles({
      cwd,
      contentDirectories: ["content"],
      manifest: {},
    });

    assert.equal(result.length, 0);
  });
});
