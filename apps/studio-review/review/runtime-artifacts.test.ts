import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { resolveStudioReviewAppRoot } from "./app-root";
import {
  getReviewRuntimeBuildPaths,
  resolveReviewRuntimeAssetPath,
  scopeReviewRuntimeManifestToScenario,
} from "./runtime-artifacts";

test("resolveStudioReviewAppRoot does not duplicate the app path", () => {
  assert.equal(
    resolveStudioReviewAppRoot("/workspace/apps/studio-review"),
    "/workspace/apps/studio-review",
  );
});

test("resolveStudioReviewAppRoot expands from the workspace root", () => {
  assert.equal(
    resolveStudioReviewAppRoot("/workspace"),
    resolve("/workspace", "apps/studio-review"),
  );
});

test("resolveStudioReviewAppRoot accepts a direct app root", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "studio-review-root-"));
  await mkdir(resolve(tempRoot, "app"));
  await writeFile(resolve(tempRoot, "mdcms.config.ts"), "export default {};\n");
  await writeFile(resolve(tempRoot, "package.json"), "{\n  \"name\": \"test\"\n}\n");

  assert.equal(resolveStudioReviewAppRoot(tempRoot), tempRoot);
});

test("review runtime paths stay scoped under the review app", () => {
  const paths = getReviewRuntimeBuildPaths("/workspace/apps/studio-review");

  assert.match(paths.outDir, /apps\/studio-review\/.generated\/runtime$/);
  assert.match(
    resolveReviewRuntimeAssetPath(paths.outDir, "build-1", "main.js"),
    /apps\/studio-review\/.generated\/runtime\/assets\/build-1\/main\.js$/,
  );
});

test("scopeReviewRuntimeManifestToScenario prefixes root entry urls", () => {
  const manifest = scopeReviewRuntimeManifestToScenario(
    {
      apiVersion: "1",
      studioVersion: "0.0.1",
      mode: "module",
      entryUrl: "/api/v1/studio/assets/build-1/main.mjs",
      integritySha256: "hash",
      signature: "signature",
      keyId: "key",
      buildId: "build-1",
      minStudioPackageVersion: "0.0.1",
      minHostBridgeVersion: "1.0.0",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
    "editor",
  );

  assert.equal(
    manifest.entryUrl,
    "/review-api/editor/api/v1/studio/assets/build-1/main.mjs",
  );
});
