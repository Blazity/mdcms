import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runMdcmsCli } from "./framework.js";
import { createInitCommand } from "./init.js";
import { createMockPrompter } from "./init/prompt.js";

async function withTempDir(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-cli-init-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function createMockFetcher(
  handlers: Record<
    string,
    (url: string, init?: RequestInit) => Response | Promise<Response>
  >,
): typeof fetch {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler(url, init);
      }
    }

    return new Response("Not Found", { status: 404 });
  };
}

function createDefaultFetchHandlers() {
  return {
    "/healthz": () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    "/api/v1/projects": (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string };
        return new Response(
          JSON.stringify({
            data: {
              id: "proj-001",
              slug: body.name,
              name: body.name,
              environments: [{ id: "env-001", name: "production" }],
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/environments")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "env-001", name: "production" },
              { id: "env-002", name: "staging" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "proj-001",
              slug: "my-project",
              name: "my-project",
              environmentCount: 2,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    "/api/v1/schema": () =>
      new Response(
        JSON.stringify({
          data: {
            schemaHash:
              "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
            syncedAt: "2026-03-31T12:00:00.000Z",
            affectedTypes: ["post"],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    "/api/v1/content": () =>
      new Response(
        JSON.stringify({
          data: {
            documentId: "doc-hello-001",
            draftRevision: 1,
            publishedVersion: null,
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
  };
}

test("full init wizard creates config, schema state, and manifest", async () => {
  await withTempDir(async (cwd) => {
    await mkdir(join(cwd, "content", "posts"), { recursive: true });
    await writeFile(
      join(cwd, "content", "posts", "hello.md"),
      "---\ntitle: Hello World\nslug: hello\n---\nBody content\n",
    );

    const fetcher = createMockFetcher(createDefaultFetchHandlers());

    const prompter = createMockPrompter({
      text: ["http://localhost:4000"],
      select: ["my-project", "staging"],
      multiSelect: [["content/posts"]],
      confirm: [true, true, false],
    });

    let stdoutOutput = "";

    const command = createInitCommand({
      prompter,
      fetcher,
      skipAuth: true,
    });

    const exitCode = await runMdcmsCli(["init"], {
      cwd,
      commands: [command],
      stdout: {
        write: (chunk: string) => {
          stdoutOutput += chunk;
        },
      },
      stderr: { write: () => undefined },
      fetcher,
    });

    assert.equal(exitCode, 0);

    const configPath = join(cwd, "mdcms.config.ts");
    assert.ok(existsSync(configPath), "mdcms.config.ts should exist");
    const configContent = await readFile(configPath, "utf-8");
    assert.ok(
      configContent.includes("my-project"),
      "config should contain project",
    );
    assert.ok(
      configContent.includes("http://localhost:4000"),
      "config should contain serverUrl",
    );
    assert.ok(
      configContent.includes("defineType"),
      "config should contain defineType",
    );

    const schemaStatePath = join(
      cwd,
      ".mdcms",
      "schema",
      "my-project.staging.json",
    );
    assert.ok(existsSync(schemaStatePath), "schema state file should exist");
    const schemaState = JSON.parse(await readFile(schemaStatePath, "utf-8"));
    assert.equal(typeof schemaState.schemaHash, "string");
    assert.equal(schemaState.syncedAt, "2026-03-31T12:00:00.000Z");

    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "my-project.staging.json",
    );
    assert.ok(existsSync(manifestPath), "manifest file should exist");
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    assert.ok(
      manifest["doc-hello-001"],
      "manifest should contain document entry",
    );
    assert.equal(manifest["doc-hello-001"].format, "md");
    assert.equal(manifest["doc-hello-001"].draftRevision, 1);
  });
});

test("init fails when server unreachable", async () => {
  await withTempDir(async (cwd) => {
    const fetcher = createMockFetcher({
      "/healthz": () => new Response("Service Unavailable", { status: 503 }),
    });

    const prompter = createMockPrompter({
      text: ["http://localhost:4000"],
    });

    let stderrOutput = "";

    const command = createInitCommand({
      prompter,
      fetcher,
      skipAuth: true,
    });

    const exitCode = await runMdcmsCli(["init"], {
      cwd,
      commands: [command],
      stdout: { write: () => undefined },
      stderr: {
        write: (chunk: string) => {
          stderrOutput += chunk;
        },
      },
      fetcher,
    });

    assert.equal(exitCode, 1);
  });
});

test("init with no content files still generates config", async () => {
  await withTempDir(async (cwd) => {
    const fetcher = createMockFetcher({
      ...createDefaultFetchHandlers(),
      "/api/v1/schema": (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { schemaHash: string };
        return new Response(
          JSON.stringify({
            data: {
              schemaHash: body.schemaHash,
              syncedAt: "2026-03-31T12:00:00.000Z",
              affectedTypes: [],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const prompter = createMockPrompter({
      text: ["http://localhost:4000"],
      select: ["my-project", "production"],
      multiSelect: [],
      confirm: [true],
    });

    const command = createInitCommand({
      prompter,
      fetcher,
      skipAuth: true,
    });

    const exitCode = await runMdcmsCli(["init"], {
      cwd,
      commands: [command],
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      fetcher,
    });

    assert.equal(exitCode, 0);

    const configPath = join(cwd, "mdcms.config.ts");
    assert.ok(existsSync(configPath), "mdcms.config.ts should exist");
    const configContent = await readFile(configPath, "utf-8");
    assert.ok(
      configContent.includes("my-project"),
      "config should contain project",
    );
  });
});

test("init with create new project flow", async () => {
  await withTempDir(async (cwd) => {
    const fetcher = createMockFetcher({
      ...createDefaultFetchHandlers(),
      "/api/v1/projects": (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { name: string };
          return new Response(
            JSON.stringify({
              data: {
                id: "proj-new",
                slug: body.name,
                name: body.name,
                environments: [{ id: "env-001", name: "production" }],
              },
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/environments")) {
          return new Response(
            JSON.stringify({
              data: [{ id: "env-001", name: "production" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const prompter = createMockPrompter({
      text: ["http://localhost:4000", "new-project"],
      select: ["__create_new__", "production"],
      multiSelect: [],
      confirm: [true],
    });

    const command = createInitCommand({
      prompter,
      fetcher,
      skipAuth: true,
    });

    const exitCode = await runMdcmsCli(["init"], {
      cwd,
      commands: [command],
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      fetcher,
    });

    assert.equal(exitCode, 0);

    const configPath = join(cwd, "mdcms.config.ts");
    assert.ok(existsSync(configPath), "mdcms.config.ts should exist");
    const configContent = await readFile(configPath, "utf-8");
    assert.ok(
      configContent.includes("new-project"),
      "config should contain new project name",
    );
  });
});
