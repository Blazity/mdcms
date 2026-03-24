import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  RuntimeError,
  type MdxExtractedProps,
  type HostBridgeV1,
  type StudioBootstrapManifest,
  type StudioBootstrapReadyResponse,
} from "@mdcms/shared";

import { buildStudioRuntimeArtifacts } from "./build-runtime.js";
import { loadStudioRuntime, type MdcmsConfig } from "./studio-loader.js";

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

async function withLocationOrigin<T>(
  origin: string,
  run: () => Promise<T>,
): Promise<T> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );

  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      origin,
    },
  });

  try {
    return await run();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "location", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "location");
    }
  }
}

async function createRuntimeFixture(directory: string) {
  const sourceFile = join(directory, "remote.ts");
  const outDir = join(directory, "dist");

  await mkdir(directory, { recursive: true });

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

function createReadyBootstrapPayload(input: {
  manifest: StudioBootstrapManifest;
  source?: "active" | "lastKnownGood";
  recovery?: {
    rejectedBuildId: string;
    rejectionReason: "integrity" | "signature" | "compatibility";
  };
}): StudioBootstrapReadyResponse {
  if (input.source === "lastKnownGood") {
    return {
      data: {
        status: "ready",
        source: "lastKnownGood",
        manifest: input.manifest,
        recovery: input.recovery,
      },
    };
  }

  return {
    data: {
      status: "ready",
      source: "active",
      manifest: input.manifest,
    },
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
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: fixture.manifest,
              }),
            ),
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

test("loadStudioRuntime derives a local mdx catalog and editor resolver from config components", async () => {
  await withTempDir("studio-loader-mdx-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);
    const contexts: unknown[] = [];
    const Chart = () => null;
    const ChartEditor = () => null;
    const config: MdcmsConfig = {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
      components: [
        {
          name: "Chart",
          importPath: "@/components/mdx/Chart",
          description: "Render a chart",
          propsEditor: "@/components/mdx/Chart.editor",
          load: async () => Chart,
          loadPropsEditor: async () => ChartEditor,
          extractedProps: {
            title: { type: "string", required: false },
          },
        },
      ],
    };

    await loadStudioRuntime({
      config,
      basePath: "/admin",
      container: {},
      fetcher: async (input) => {
        const url = String(input);

        if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
          return new Response(
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: fixture.manifest,
              }),
            ),
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
      loadRemoteModule: async () => ({
        mount: (_target: unknown, context: unknown) => {
          contexts.push(context);
          return () => {};
        },
      }),
    });

    const context = contexts[0] as {
      hostBridge: HostBridgeV1;
      mdx?: {
        catalog: {
          components: Array<{
            name: string;
            importPath: string;
            description?: string;
            propsEditor?: string;
            extractedProps?: MdxExtractedProps;
          }>;
        };
        resolvePropsEditor: (name: string) => unknown | null;
      };
    };

    assert.deepEqual(context.mdx?.catalog.components, [
      {
        name: "Chart",
        importPath: "@/components/mdx/Chart",
        description: "Render a chart",
        propsEditor: "@/components/mdx/Chart.editor",
        extractedProps: {
          title: { type: "string", required: false },
        },
      },
    ]);
    assert.equal(context.hostBridge.resolveComponent("Chart"), Chart);
    assert.equal(context.mdx?.resolvePropsEditor("Chart"), ChartEditor);
  });
});

test("loadStudioRuntime composes a caller hostBridge with config-derived component resolution", async () => {
  await withTempDir("studio-loader-compose-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);
    const contexts: unknown[] = [];
    const Chart = () => null;
    const Custom = () => null;
    const customHostBridge: HostBridgeV1 = {
      version: "1",
      resolveComponent: (name) => (name === "Custom" ? Custom : null),
      renderMdxPreview: () => () => {},
    };

    await loadStudioRuntime({
      config: {
        project: "marketing-site",
        environment: "staging",
        serverUrl: "http://localhost:4000",
        components: [
          {
            name: "Chart",
            importPath: "@/components/mdx/Chart",
            load: async () => Chart,
          },
        ],
      },
      basePath: "/admin",
      container: {},
      hostBridge: customHostBridge,
      fetcher: async (input) => {
        const url = String(input);

        if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
          return new Response(
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: fixture.manifest,
              }),
            ),
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
      loadRemoteModule: async () => ({
        mount: (_target: unknown, context: unknown) => {
          contexts.push(context);
          return () => {};
        },
      }),
    });

    const bridge = (contexts[0] as { hostBridge: HostBridgeV1 }).hostBridge;

    assert.equal(bridge.resolveComponent("Custom"), Custom);
    assert.equal(bridge.resolveComponent("Chart"), Chart);
  });
});

test("loadStudioRuntime fetches the remote runtime while local mdx loaders are still pending", async () => {
  await withTempDir("studio-loader-parallel-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);
    const events: string[] = [];
    let resolveComponentLoad: ((value: unknown) => void) | undefined;
    let resolveRuntimeFetchStarted: (() => void) | undefined;
    const runtimeFetchStarted = new Promise<void>((resolve) => {
      resolveRuntimeFetchStarted = resolve;
    });

    const runtimeLoad = loadStudioRuntime({
      config: {
        project: "marketing-site",
        environment: "staging",
        serverUrl: "http://localhost:4000",
        components: [
          {
            name: "Chart",
            importPath: "@/components/mdx/Chart",
            load: async () => {
              events.push("component-load-start");

              return await new Promise<unknown>((resolve) => {
                resolveComponentLoad = resolve;
              });
            },
          },
        ],
      },
      basePath: "/admin",
      container: {},
      fetcher: async (input) => {
        const url = String(input);

        if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
          events.push("bootstrap-fetch");

          return new Response(
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: fixture.manifest,
              }),
            ),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        if (url === "http://localhost:4000" + fixture.manifest.entryUrl) {
          events.push("runtime-fetch");
          resolveRuntimeFetchStarted?.();

          return new Response(new Uint8Array(fixture.runtimeBytes), {
            status: 200,
            headers: {
              "content-type": "text/javascript; charset=utf-8",
            },
          });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      },
      loadRemoteModule: async () => ({
        mount: () => () => {},
      }),
    });

    await runtimeFetchStarted;
    assert.ok(events.includes("bootstrap-fetch"));
    assert.ok(events.includes("component-load-start"));
    assert.ok(events.includes("runtime-fetch"));

    resolveComponentLoad?.(() => null);
    await runtimeLoad;
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
              status: "ready",
              source: "active",
              manifest: {
                apiVersion: "1",
                studioVersion: "1.2.3",
                mode: "iframe",
              },
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

test("loadStudioRuntime keeps generic cross-origin bootstrap fetch failures neutral", async () => {
  await withLocationOrigin("http://localhost:4173", async () => {
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
          fetcher: async () => {
            throw new TypeError("Load failed");
          },
          loadRemoteModule: async () => {
            throw new Error("should not import remote module");
          },
        }),
      (error) => {
        assert.ok(error instanceof RuntimeError);
        assert.equal(error.code, "STUDIO_BOOTSTRAP_FETCH_FAILED");
        assert.match(error.message, /Load failed/);
        assert.doesNotMatch(error.message, /cross-origin request/i);
        assert.doesNotMatch(error.message, /Check CORS or proxy/i);
        assert.equal(error.details?.isCrossOrigin, true);
        assert.equal(error.details?.isOriginPolicyFailure, false);
        return true;
      },
    );
  });
});

test("loadStudioRuntime classifies explicit origin-policy bootstrap fetch failures as CORS guidance", async () => {
  await withLocationOrigin("http://localhost:4173", async () => {
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
          fetcher: async () => {
            throw new TypeError("Blocked by CORS policy");
          },
          loadRemoteModule: async () => {
            throw new Error("should not import remote module");
          },
        }),
      (error) => {
        assert.ok(error instanceof RuntimeError);
        assert.equal(error.code, "STUDIO_BOOTSTRAP_FETCH_FAILED");
        assert.match(error.message, /cross-origin request/i);
        assert.match(error.message, /localhost:4173/);
        assert.match(error.message, /localhost:4000/);
        assert.match(error.message, /Check CORS or proxy/i);
        assert.equal(error.details?.isCrossOrigin, true);
        assert.equal(error.details?.isOriginPolicyFailure, true);
        return true;
      },
    );
  });
});

test("loadStudioRuntime retries transient bootstrap fetch failures before succeeding", async () => {
  await withTempDir("studio-loader-", async (directory) => {
    const fixture = await createRuntimeFixture(directory);
    const fetchLog: string[] = [];
    let bootstrapAttempts = 0;

    const unmount = await loadStudioRuntime({
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
        fetchLog.push(url);

        if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
          bootstrapAttempts += 1;

          if (bootstrapAttempts < 3) {
            throw new TypeError("Load failed");
          }

          return new Response(
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: fixture.manifest,
              }),
            ),
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
        mount: () => () => {},
      }),
    });

    assert.equal(bootstrapAttempts, 3);
    assert.deepEqual(fetchLog, [
      "http://localhost:4000/api/v1/studio/bootstrap",
      "http://localhost:4000/api/v1/studio/bootstrap",
      "http://localhost:4000/api/v1/studio/bootstrap",
      "http://localhost:4000" + fixture.manifest.entryUrl,
    ]);

    unmount();
  });
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
              JSON.stringify(
                createReadyBootstrapPayload({
                  manifest: fixture.manifest,
                }),
              ),
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
                JSON.stringify(
                  createReadyBootstrapPayload({
                    manifest: fixture.manifest,
                  }),
                ),
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

test("loadStudioRuntime retries bootstrap once on integrity rejection and mounts the fallback runtime", async () => {
  await withTempDir("studio-loader-", async (directory) => {
    const activeFixture = await createRuntimeFixture(join(directory, "active"));
    const fallbackFixture = await createRuntimeFixture(
      join(directory, "fallback"),
    );
    const fetchLog: string[] = [];
    const importedUrls: string[] = [];

    const unmount = await loadStudioRuntime({
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
        fetchLog.push(url);

        if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
          return new Response(
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: activeFixture.manifest,
              }),
            ),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        if (
          url ===
          "http://localhost:4000/api/v1/studio/bootstrap?rejectedBuildId=" +
            activeFixture.manifest.buildId +
            "&rejectionReason=integrity"
        ) {
          return new Response(
            JSON.stringify(
              createReadyBootstrapPayload({
                manifest: fallbackFixture.manifest,
                source: "lastKnownGood",
                recovery: {
                  rejectedBuildId: activeFixture.manifest.buildId,
                  rejectionReason: "integrity",
                },
              }),
            ),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        if (url === "http://localhost:4000" + activeFixture.manifest.entryUrl) {
          return new Response(new TextEncoder().encode("tampered-runtime"), {
            status: 200,
            headers: {
              "content-type": "text/javascript; charset=utf-8",
            },
          });
        }

        if (
          url ===
          "http://localhost:4000" + fallbackFixture.manifest.entryUrl
        ) {
          return new Response(new Uint8Array(fallbackFixture.runtimeBytes), {
            status: 200,
            headers: {
              "content-type": "text/javascript; charset=utf-8",
            },
          });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      },
      loadRemoteModule: async (entryUrl) => {
        importedUrls.push(entryUrl);

        return {
          mount: () => () => {},
        };
      },
    });

    assert.deepEqual(fetchLog, [
      "http://localhost:4000/api/v1/studio/bootstrap",
      "http://localhost:4000" + activeFixture.manifest.entryUrl,
      "http://localhost:4000/api/v1/studio/bootstrap?rejectedBuildId=" +
        activeFixture.manifest.buildId +
        "&rejectionReason=integrity",
      "http://localhost:4000" + fallbackFixture.manifest.entryUrl,
    ]);
    assert.deepEqual(importedUrls, [
      "http://localhost:4000" + fallbackFixture.manifest.entryUrl,
    ]);

    unmount();
  });
});

test("loadStudioRuntime stops after one retry when the fallback runtime is also rejected", async () => {
  await withTempDir("studio-loader-", async (directory) => {
    const activeFixture = await createRuntimeFixture(join(directory, "active"));
    const fallbackFixture = await createRuntimeFixture(
      join(directory, "fallback"),
    );
    const fetchLog: string[] = [];
    let importCount = 0;

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
            fetchLog.push(url);

            if (url === "http://localhost:4000/api/v1/studio/bootstrap") {
              return new Response(
                JSON.stringify(
                  createReadyBootstrapPayload({
                    manifest: activeFixture.manifest,
                  }),
                ),
                {
                  status: 200,
                  headers: {
                    "content-type": "application/json",
                  },
                },
              );
            }

            if (
              url ===
              "http://localhost:4000/api/v1/studio/bootstrap?rejectedBuildId=" +
                activeFixture.manifest.buildId +
                "&rejectionReason=integrity"
            ) {
              return new Response(
                JSON.stringify(
                  createReadyBootstrapPayload({
                    manifest: fallbackFixture.manifest,
                    source: "lastKnownGood",
                    recovery: {
                      rejectedBuildId: activeFixture.manifest.buildId,
                      rejectionReason: "integrity",
                    },
                  }),
                ),
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
      (error: unknown) => {
        assert.ok(error instanceof RuntimeError);
        assert.equal(error.code, "STUDIO_RUNTIME_INTEGRITY_MISMATCH");
        return true;
      },
    );

    assert.equal(importCount, 0);
    assert.deepEqual(fetchLog, [
      "http://localhost:4000/api/v1/studio/bootstrap",
      "http://localhost:4000" + activeFixture.manifest.entryUrl,
      "http://localhost:4000/api/v1/studio/bootstrap?rejectedBuildId=" +
        activeFixture.manifest.buildId +
        "&rejectionReason=integrity",
      "http://localhost:4000" + fallbackFixture.manifest.entryUrl,
    ]);
  });
});

test("loadStudioRuntime surfaces deterministic bootstrap disabled and unavailable errors", async () => {
  for (const code of [
    "STUDIO_RUNTIME_DISABLED",
    "STUDIO_RUNTIME_UNAVAILABLE",
  ] as const) {
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
          fetcher: async () =>
            new Response(
              JSON.stringify({
                status: "error",
                code,
                message: `${code} from bootstrap`,
                timestamp: "2026-03-23T00:00:00.000Z",
              }),
              {
                status: 503,
                headers: {
                  "content-type": "application/json",
                },
              },
            ),
          loadRemoteModule: async () => {
            throw new Error("should not import remote module");
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof RuntimeError);
        assert.equal(error.code, code);
        assert.equal(error.message, `${code} from bootstrap`);
        assert.equal(error.statusCode, 503);
        return true;
      },
    );
  }
});
