import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertStudioBootstrapManifest,
  type StudioBootstrapManifest,
} from "@mdcms/shared";

import { createStudioRuntimePublication } from "./studio-bootstrap.js";

async function withTempDir<T>(
  prefix: string,
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), prefix));

  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("createStudioRuntimePublication builds one validated manifest with mode module", async () => {
  await withTempDir("studio-publication-", async (directory) => {
    const sourceFile = join(directory, "remote.ts");
    const outDir = join(directory, "dist");
    await writeFile(
      sourceFile,
      "export const mount = (_container: unknown, _ctx: unknown) => () => {};\n",
      "utf8",
    );

    const publication = await createStudioRuntimePublication({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
      mode: "iframe",
    });

    const manifest = publication.manifest satisfies StudioBootstrapManifest;
    assertStudioBootstrapManifest(manifest, "publication.manifest");

    assert.equal(manifest.mode, "module");
    assert.equal(publication.buildId, manifest.buildId);
    assert.equal(publication.entryFile.length > 0, true);
  });
});

test("getAsset returns runtime file metadata for existing active build assets", async () => {
  await withTempDir("studio-publication-", async (directory) => {
    const sourceFile = join(directory, "remote.ts");
    const outDir = join(directory, "dist");
    await writeFile(
      sourceFile,
      "export const mount = (_container: unknown, _ctx: unknown) => () => {};\n",
      "utf8",
    );

    const publication = await createStudioRuntimePublication({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
    });

    const asset = await publication.getAsset({
      buildId: publication.buildId,
      assetPath: publication.entryFile,
    });

    assert.equal(asset !== undefined, true);

    if (!asset) {
      return;
    }

    assert.equal(asset.contentType, "text/javascript; charset=utf-8");
    assert.equal(asset.absolutePath.endsWith(publication.entryFile), true);
    assert.equal(asset.body.byteLength > 0, true);
  });
});

test("getAsset serves sourcemap assets as json", async () => {
  await withTempDir("studio-publication-", async (directory) => {
    const sourceFile = join(directory, "remote.ts");
    const outDir = join(directory, "dist");
    const mapPath = join(outDir, "assets", "manual-build", "runtime.mjs.map");

    await writeFile(
      sourceFile,
      "export const mount = (_container: unknown, _ctx: unknown) => () => {};\n",
      "utf8",
    );
    await mkdir(join(outDir, "assets", "manual-build"), { recursive: true });
    await writeFile(mapPath, '{"version":3}\n', "utf8");

    const publication = await createStudioRuntimePublication({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
    });

    const asset = await publication.getAsset({
      buildId: "manual-build",
      assetPath: "runtime.mjs.map",
    });

    assert.equal(asset, undefined);

    const emittedMapPath = `${publication.entryFile}.map`;
    await mkdir(join(outDir, "assets", publication.buildId), {
      recursive: true,
    });
    await writeFile(
      join(outDir, "assets", publication.buildId, emittedMapPath),
      '{"version":3}\n',
      "utf8",
    );

    const emittedAsset = await publication.getAsset({
      buildId: publication.buildId,
      assetPath: emittedMapPath,
    });

    assert.equal(emittedAsset?.contentType, "application/json; charset=utf-8");
  });
});

test("getAsset returns undefined for unknown build ids, missing files, and traversal paths", async () => {
  await withTempDir("studio-publication-", async (directory) => {
    const sourceFile = join(directory, "remote.ts");
    const outDir = join(directory, "dist");
    await writeFile(
      sourceFile,
      "export const mount = (_container: unknown, _ctx: unknown) => () => {};\n",
      "utf8",
    );

    const publication = await createStudioRuntimePublication({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
    });

    const unknownBuild = await publication.getAsset({
      buildId: "unknown-build",
      assetPath: publication.entryFile,
    });
    assert.equal(unknownBuild, undefined);

    const missingAsset = await publication.getAsset({
      buildId: publication.buildId,
      assetPath: "missing-file.mjs",
    });
    assert.equal(missingAsset, undefined);

    const escapedAsset = await publication.getAsset({
      buildId: publication.buildId,
      assetPath: "../../../etc/passwd",
    });
    assert.equal(escapedAsset, undefined);
  });
});
