import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  detectTrackedFiles,
  untrackFiles,
  updateGitignore,
} from "./git-cleanup.js";

async function withTempDir(
  run: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-cli-git-cleanup-"));

  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function initGitRepo(cwd: string): void {
  execSync("git init", { cwd, stdio: "ignore" });
  execSync("git config user.email 'test@test.com'", { cwd, stdio: "ignore" });
  execSync("git config user.name 'Test'", { cwd, stdio: "ignore" });
}

test("updateGitignore creates .gitignore with entries", async () => {
  await withTempDir(async (cwd) => {
    await updateGitignore(cwd, ["content"]);

    const content = await readFile(join(cwd, ".gitignore"), "utf8");
    assert.ok(content.includes("# mdcms managed content"));
    assert.ok(content.includes(".mdcms/"));
    assert.ok(content.includes("content/"));
    assert.ok(content.endsWith("\n"));
  });
});

test("updateGitignore appends to existing .gitignore", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(join(cwd, ".gitignore"), "node_modules/\n", "utf8");

    await updateGitignore(cwd, ["content"]);

    const content = await readFile(join(cwd, ".gitignore"), "utf8");
    assert.ok(content.startsWith("node_modules/\n"));
    assert.ok(content.includes("# mdcms managed content"));
    assert.ok(content.includes(".mdcms/"));
    assert.ok(content.includes("content/"));
    // No double newlines beyond the intentional separator
    assert.ok(!content.includes("\n\n\n"));
  });
});

test("updateGitignore does not duplicate existing entries", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(
      join(cwd, ".gitignore"),
      "node_modules/\n.mdcms/\ncontent/\n",
      "utf8",
    );

    await updateGitignore(cwd, ["content"]);

    // File should not have been modified (no new entries)
    const content = await readFile(join(cwd, ".gitignore"), "utf8");
    assert.ok(!content.includes("# mdcms managed content"));
    assert.equal(content, "node_modules/\n.mdcms/\ncontent/\n");
  });
});

test("detectTrackedFiles returns empty when not a git repo", async () => {
  await withTempDir(async (cwd) => {
    const result = await detectTrackedFiles(cwd, ["content"]);
    assert.deepEqual(result, []);
  });
});

test("detectTrackedFiles returns tracked files in managed dirs", async () => {
  await withTempDir(async (cwd) => {
    initGitRepo(cwd);

    // Create content files
    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(join(cwd, "content", "blog", "hello.md"), "# Hello\n");
    await writeFile(join(cwd, "content", "blog", "world.md"), "# World\n");

    // Create a file outside managed dirs
    await writeFile(join(cwd, "README.md"), "# Readme\n");

    // Stage and commit everything
    execSync("git add -A", { cwd, stdio: "ignore" });
    execSync('git commit -m "initial"', { cwd, stdio: "ignore" });

    const tracked = await detectTrackedFiles(cwd, ["content"]);
    assert.equal(tracked.length, 2);
    assert.ok(tracked.includes("content/blog/hello.md"));
    assert.ok(tracked.includes("content/blog/world.md"));
  });
});

test("untrackFiles removes files from git index but keeps them on disk", async () => {
  await withTempDir(async (cwd) => {
    initGitRepo(cwd);

    await mkdir(join(cwd, "content"), { recursive: true });
    await writeFile(join(cwd, "content", "post.md"), "# Post\n");

    execSync("git add -A", { cwd, stdio: "ignore" });
    execSync('git commit -m "initial"', { cwd, stdio: "ignore" });

    const removed = await untrackFiles(cwd, ["content"]);
    assert.ok(removed.length > 0);

    // File still exists on disk
    const content = await readFile(join(cwd, "content", "post.md"), "utf8");
    assert.equal(content, "# Post\n");

    // File is no longer tracked
    const tracked = await detectTrackedFiles(cwd, ["content"]);
    assert.deepEqual(tracked, []);
  });
});
