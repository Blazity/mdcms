import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import {
  assertStudioRuntimePublication,
  type StudioRuntimePublicationVerificationInput,
} from "./bootstrap-verification.js";
import { buildStudioRuntimeArtifacts } from "./build-runtime.js";

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

async function createVerificationInput(
  directory: string,
): Promise<StudioRuntimePublicationVerificationInput> {
  const sourceFile = join(directory, "remote.ts");
  const outDir = join(directory, "dist");

  await writeFile(
    sourceFile,
    "export const mount = (_container: unknown, _ctx: unknown) => () => {};\n",
    "utf8",
  );

  const build = await buildStudioRuntimeArtifacts({
    sourceFile,
    outDir,
    studioVersion: "1.2.3",
    minStudioPackageVersion: "0.1.0",
    minHostBridgeVersion: "1.0.0",
  });

  return {
    manifest: build.manifest,
    runtimeBytes: await readFile(build.entryPath),
    compatibility: {
      studioPackageVersion: "0.1.0",
      hostBridgeVersion: "1.0.0",
    },
  };
}

test("assertStudioRuntimePublication accepts a valid build output", async () => {
  await withTempDir("studio-runtime-verification-", async (directory) => {
    const input = await createVerificationInput(directory);

    await assert.doesNotReject(() => assertStudioRuntimePublication(input));
  });
});

test("assertStudioRuntimePublication rejects incompatible compatibility bounds", async () => {
  await withTempDir("studio-runtime-verification-", async (directory) => {
    const input = await createVerificationInput(directory);

    await assert.rejects(
      () =>
        assertStudioRuntimePublication({
          ...input,
          compatibility: {
            studioPackageVersion: "0.0.9",
            hostBridgeVersion: "1.0.0",
          },
        }),
      /minStudioPackageVersion/,
    );

    await assert.rejects(
      () =>
        assertStudioRuntimePublication({
          ...input,
          compatibility: {
            studioPackageVersion: "0.1.0",
            hostBridgeVersion: "0.9.9",
          },
        }),
      /minHostBridgeVersion/,
    );
  });
});

test("assertStudioRuntimePublication rejects integrity mismatches", async () => {
  await withTempDir("studio-runtime-verification-", async (directory) => {
    const input = await createVerificationInput(directory);
    const tamperedBytes = new TextEncoder().encode("tampered-runtime");

    await assert.rejects(
      () =>
        assertStudioRuntimePublication({
          ...input,
          runtimeBytes: tamperedBytes,
        }),
      /integritySha256/,
    );
  });
});

test("assertStudioRuntimePublication rejects invalid placeholder signature and key id", async () => {
  await withTempDir("studio-runtime-verification-", async (directory) => {
    const input = await createVerificationInput(directory);

    await assert.rejects(
      () =>
        assertStudioRuntimePublication({
          ...input,
          manifest: {
            ...input.manifest,
            signature: "invalid-signature",
          },
        }),
      /signature/,
    );

    await assert.rejects(
      () =>
        assertStudioRuntimePublication({
          ...input,
          manifest: {
            ...input.manifest,
            keyId: "invalid-key-id",
          },
        }),
      /keyId/,
    );
  });
});

test("assertStudioRuntimePublication rejects malformed manifest payloads", async () => {
  await withTempDir("studio-runtime-verification-", async (directory) => {
    const input = await createVerificationInput(directory);

    await assert.rejects(
      () =>
        assertStudioRuntimePublication({
          ...input,
          manifest: {
            ...input.manifest,
            mode: "worker" as unknown as (typeof input.manifest)["mode"],
          } as typeof input.manifest,
        }),
      /mode/,
    );
  });
});
