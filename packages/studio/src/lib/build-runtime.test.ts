import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  STUDIO_RUNTIME_ASSETS_DIRNAME,
  STUDIO_RUNTIME_BOOTSTRAP_DIRNAME,
  buildStudioRuntimeArtifacts,
} from "./build-runtime.js";

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

test("buildStudioRuntimeArtifacts is deterministic for identical source bytes", async () => {
  await withTempDir("studio-runtime-", async (directory) => {
    const sourceFile = join(directory, "app.ts");
    const outDirA = join(directory, "dist-a");
    const outDirB = join(directory, "dist-b");

    await writeFile(sourceFile, "export const marker = 'stable';\n", "utf8");

    const buildA = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir: outDirA,
      studioVersion: "1.2.3",
      mode: "module",
    });
    const buildB = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir: outDirB,
      studioVersion: "1.2.3",
      mode: "module",
    });

    assert.equal(buildA.buildId, buildB.buildId);
    assert.equal(buildA.entryFile, buildB.entryFile);
    assert.equal(buildA.integritySha256, buildB.integritySha256);
    assert.equal(buildA.manifest.entryUrl, buildB.manifest.entryUrl);

    const bootstrapA = JSON.parse(
      await readFile(buildA.bootstrapPath, "utf8"),
    ) as {
      buildId: string;
      entryUrl: string;
    };

    assert.equal(
      bootstrapA.entryUrl,
      `/api/v1/studio/assets/${buildA.buildId}/${buildA.entryFile}`,
    );
    assert.equal(bootstrapA.buildId, buildA.buildId);

    const expectedEntryPathA = join(
      outDirA,
      STUDIO_RUNTIME_ASSETS_DIRNAME,
      buildA.buildId,
      buildA.entryFile,
    );
    const expectedBootstrapPathA = join(
      outDirA,
      STUDIO_RUNTIME_BOOTSTRAP_DIRNAME,
      `${buildA.buildId}.json`,
    );

    assert.equal(buildA.entryPath, expectedEntryPathA);
    assert.equal(buildA.bootstrapPath, expectedBootstrapPathA);
  });
});

test("buildStudioRuntimeArtifacts changes buildId and integrity when source changes", async () => {
  await withTempDir("studio-runtime-", async (directory) => {
    const sourceFile = join(directory, "app.ts");
    const outDirA = join(directory, "dist-a");
    const outDirB = join(directory, "dist-b");

    await writeFile(sourceFile, "export const marker = 'v1';\n", "utf8");
    const buildA = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir: outDirA,
      studioVersion: "1.2.3",
      mode: "module",
    });

    await writeFile(sourceFile, "export const marker = 'v2';\n", "utf8");
    const buildB = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir: outDirB,
      studioVersion: "1.2.3",
      mode: "module",
    });

    assert.notEqual(buildA.buildId, buildB.buildId);
    assert.notEqual(buildA.integritySha256, buildB.integritySha256);
  });
});

test("buildStudioRuntimeArtifacts resolves the default project root from the package location", async () => {
  await withTempDir("studio-runtime-cwd-", async (directory) => {
    const outDir = join(directory, "dist");
    const originalCwd = process.cwd();

    process.chdir(directory);

    try {
      const build = await buildStudioRuntimeArtifacts({
        outDir,
        studioVersion: "1.2.3",
        mode: "module",
      });

      assert.equal(build.entryPath.startsWith(`${outDir}/`), true);
      assert.equal((await readFile(build.entryPath, "utf8")).length > 0, true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

test("buildStudioRuntimeArtifacts writes bundled JavaScript runtime entry", async () => {
  await withTempDir("studio-runtime-", async (directory) => {
    const sourceFile = join(directory, "app.ts");
    const helperFile = join(directory, "helper.ts");
    const outDir = join(directory, "dist");

    await writeFile(
      helperFile,
      [
        "export function helperValue(): string {",
        "  return 'bundled-helper';",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await writeFile(
      sourceFile,
      [
        "import { helperValue } from './helper.ts';",
        "",
        "export type RuntimeMountContext = { apiBaseUrl: string };",
        "",
        "export function mount(_: unknown, context: RuntimeMountContext): string {",
        "  return `${context.apiBaseUrl}-${helperValue()}`;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const build = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
      mode: "module",
    });

    const emittedSource = await readFile(build.entryPath, "utf8");
    assert.equal(emittedSource.includes("from './helper"), false);
    await rm(helperFile, { force: true });

    const runtimeModule = (await import(
      pathToFileURL(build.entryPath).href
    )) as {
      mount: (_: unknown, context: { apiBaseUrl: string }) => string;
    };
    assert.equal(
      runtimeModule.mount(null, { apiBaseUrl: "http://example.test" }),
      "http://example.test-bundled-helper",
    );
  });
});

test("buildStudioRuntimeArtifacts forces the bootstrap manifest to module mode", async () => {
  await withTempDir("studio-runtime-", async (directory) => {
    const sourceFile = join(directory, "app.ts");
    const outDir = join(directory, "dist");

    await writeFile(
      sourceFile,
      "export const mount = () => () => {};\n",
      "utf8",
    );

    const build = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
      mode: "iframe" as unknown as "module",
    });

    assert.equal(build.manifest.mode, "module");
  });
});

test("buildStudioRuntimeArtifacts emits a stylesheet asset beside the runtime entry", async () => {
  await withTempDir("studio-runtime-", async (directory) => {
    const sourceFile = join(directory, "app.ts");
    const outDir = join(directory, "dist");

    await writeFile(
      sourceFile,
      "export const mount = () => () => {};\n",
      "utf8",
    );

    const build = await buildStudioRuntimeArtifacts({
      sourceFile,
      outDir,
      studioVersion: "1.2.3",
      mode: "module",
    });

    assert.match(build.cssFile, /^studio-runtime\.[a-f0-9]{16}\.css$/);
    assert.equal(
      build.cssPath,
      join(outDir, STUDIO_RUNTIME_ASSETS_DIRNAME, build.buildId, build.cssFile),
    );
    const emittedStylesheet = await readFile(build.cssPath, "utf8");

    assert.equal(emittedStylesheet.length > 0, true);
    assert.equal(emittedStylesheet.includes("@import 'tailwindcss'"), false);
    assert.equal(emittedStylesheet.includes(".bg-background"), true);
  });
});
