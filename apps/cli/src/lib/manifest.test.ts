import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import {
  loadScopedManifest,
  resolveScopedManifestPath,
  writeScopedManifestAtomic,
} from "./manifest.js";

async function withTempDir(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-cli-manifest-"));

  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("loadScopedManifest returns empty map for missing file", async () => {
  await withTempDir(async (cwd) => {
    const path = resolveScopedManifestPath({
      cwd,
      project: "marketing-site",
      environment: "staging",
    });
    const manifest = await loadScopedManifest(path);

    assert.deepEqual(manifest, {});
  });
});

test("loadScopedManifest rejects invalid top-level and drifted entry schema", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = resolveScopedManifestPath({
      cwd,
      project: "marketing-site",
      environment: "staging",
    });
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });

    await writeFile(manifestPath, "[]", "utf8");
    await assert.rejects(
      () => loadScopedManifest(manifestPath),
      (error: unknown) => {
        const candidate = error as { code?: string };
        return candidate?.code === "INVALID_MANIFEST";
      },
    );

    await writeFile(
      manifestPath,
      JSON.stringify({
        "doc-1": {
          path: "content/blog/hello.en.md",
          format: "md",
          draftRevision: 2,
          publishedVersion: 1,
          hash: "abc",
          extra: true,
        },
      }),
      "utf8",
    );
    await assert.rejects(
      () => loadScopedManifest(manifestPath),
      (error: unknown) => {
        const candidate = error as { code?: string };
        return candidate?.code === "INVALID_MANIFEST";
      },
    );
  });
});

test("writeScopedManifestAtomic writes and loads strict scoped manifest", async () => {
  await withTempDir(async (cwd) => {
    const path = resolveScopedManifestPath({
      cwd,
      project: "marketing-site",
      environment: "staging",
    });
    const manifest = {
      "doc-1": {
        path: "content/blog/hello.en.md",
        format: "md" as const,
        draftRevision: 2,
        publishedVersion: 1,
        hash: "abc123",
      },
    };

    await writeScopedManifestAtomic(path, manifest);
    const loaded = await loadScopedManifest(path);
    assert.deepEqual(loaded, manifest);

    const raw = await readFile(path, "utf8");
    assert.equal(raw.includes('"doc-1"'), true);
  });
});
