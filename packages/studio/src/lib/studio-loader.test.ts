import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { HostBridgeV1 } from "@mdcms/shared";

import { buildStudioRuntimeArtifacts } from "./build-runtime.js";
import { loadStudioRuntime } from "./studio-loader.js";

const validHostBridge: HostBridgeV1 = {
  version: "1",
  resolveComponent: () => null,
  renderMdxPreview: () => () => {},
};

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

async function createRuntimeFixture(directory: string) {
  const sourceFile = join(directory, "remote.ts");
  const outDir = join(directory, "dist");

  await writeFile(
    sourceFile,
    "export const mount = (_container, _ctx) => () => {};\n",
    "utf8",
  );

  const build = await buildStudioRuntimeArtifacts({
    sourceFile,
    outDir,
    studioVersion: "1.2.3",
    minStudioPackageVersion: "0.0.1",
    minHostBridgeVersion: "1.0.0",
  });

  return {
    manifest: build.manifest,
    runtimeBytes: await readFile(build.entryPath),
  };
}

test("loadStudioRuntime fetches bootstrap, verifies runtime, and mounts the remote module", async () => {
  await withTempDir("studio-loader-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);
    const fetchLog: string[] = [];
    const container = { textContent: "" };
    const contexts: unknown[] = [];

    const unmount = await loadStudioRuntime({
      config: {
        project: "marketing-site",
        environment: "staging",
        serverUrl: "http://localhost:4000",
      },
      basePath: "/admin",
      container,
      hostBridge: validHostBridge,
      fetcher: async (input) => {
        const url = String(input);
        fetchLog.push(url);

        if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
          return new Response(
            JSON.stringify({
              data: fixture.manifest,
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        if (url === "http://localhost:4000" + fixture.manifest.entryUrl) {
          return new Response(new Uint8Array(fixture.runtimeBytes), {
            status: 200,
            headers: {
              "content-type": "text/javascript; charset=utf-8",
            },
          });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      },
      loadRemoteModule: async (entryUrl) => {
        assert.equal(
          entryUrl,
          "http://localhost:4000" + fixture.manifest.entryUrl,
        );

        return {
          mount: (target: unknown, context: unknown) => {
            assert.equal(target, container);
            contexts.push(context);
            return () => {
              contexts.push("unmounted");
            };
          },
        };
      },
    });

    assert.deepEqual(fetchLog, [
      "http://localhost:4000/api/v1/studio/bootstrap",
      "http://localhost:4000" + fixture.manifest.entryUrl,
    ]);
    assert.deepEqual(contexts, [
      {
        apiBaseUrl: "http://localhost:4000",
        basePath: "/admin",
        auth: { mode: "cookie" },
        hostBridge: validHostBridge,
      },
    ]);

    unmount();

    assert.deepEqual(contexts, [
      {
        apiBaseUrl: "http://localhost:4000",
        basePath: "/admin",
        auth: { mode: "cookie" },
        hostBridge: validHostBridge,
      },
      "unmounted",
    ]);
  });
});

test("loadStudioRuntime rejects malformed bootstrap payloads", async () => {
  await assert.rejects(() =>
    loadStudioRuntime({
      config: {
        project: "marketing-site",
        environment: "staging",
        serverUrl: "http://localhost:4000",
      },
      basePath: "/admin",
      container: {},
      hostBridge: validHostBridge,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            data: {
              apiVersion: "1",
              studioVersion: "1.2.3",
              mode: "iframe",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      loadRemoteModule: async () => {
        throw new Error("should not import remote module");
      },
    }),
  );
});

test("loadStudioRuntime rejects integrity mismatches before importing the remote module", async () => {
  await withTempDir("studio-loader-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);
    let importCount = 0;

    await assert.rejects(() =>
      loadStudioRuntime({
        config: {
          project: "marketing-site",
          environment: "staging",
          serverUrl: "http://localhost:4000",
        },
        basePath: "/admin",
        container: {},
        hostBridge: validHostBridge,
        fetcher: async (input) => {
          const url = String(input);

          if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
            return new Response(
              JSON.stringify({
                data: fixture.manifest,
              }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              },
            );
          }

          return new Response(new TextEncoder().encode("tampered-runtime"), {
            status: 200,
            headers: {
              "content-type": "text/javascript; charset=utf-8",
            },
          });
        },
        loadRemoteModule: async () => {
          importCount += 1;
          return {
            mount: () => () => {},
          };
        },
      }),
    );

    assert.equal(importCount, 0);
  });
});

test("loadStudioRuntime surfaces remote mount failures", async () => {
  await withTempDir("studio-loader-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);

    await assert.rejects(
      () =>
        loadStudioRuntime({
          config: {
            project: "marketing-site",
            environment: "staging",
            serverUrl: "http://localhost:4000",
          },
          basePath: "/admin",
          container: {},
          hostBridge: validHostBridge,
          fetcher: async (input) => {
            const url = String(input);

            if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
              return new Response(
                JSON.stringify({
                  data: fixture.manifest,
                }),
                {
                  status: 200,
                  headers: {
                    "content-type": "application/json",
                  },
                },
              );
            }

            return new Response(new Uint8Array(fixture.runtimeBytes), {
              status: 200,
              headers: {
                "content-type": "text/javascript; charset=utf-8",
              },
            });
          },
          loadRemoteModule: async () => ({
            mount: () => {
              throw new Error("mount failed");
            },
          }),
        }),
      /mount failed/,
    );
  });
});
