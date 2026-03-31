import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import type { ContentDocumentResponse } from "@mdcms/shared";
import { z } from "zod";
import { defineConfig, defineType, parseMdcmsConfig } from "@mdcms/shared";

import { runMdcmsCli } from "./framework.js";

type RemoteDocument = Pick<
  ContentDocumentResponse,
  | "documentId"
  | "type"
  | "locale"
  | "path"
  | "format"
  | "draftRevision"
  | "publishedVersion"
>;

async function withTempDir(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "mdcms-cli-push-"));

  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function createSuccessResponse(data: RemoteDocument): Response {
  return new Response(
    JSON.stringify({
      data,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function hashRawContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("push updates an existing manifest-tracked document via PUT", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-1": {
            path: "content/blog/hello-world.en.md",
            format: "md",
            draftRevision: 1,
            publishedVersion: 1,
            hash: "old-hash",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const localPath = join(cwd, "content/blog/hello-world.en.md");
    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(
      localPath,
      '---\ntitle: "Hello World"\n---\n\nUpdated draft body\n',
      "utf8",
    );

    let requestCount = 0;
    const exitCode = await runMdcmsCli(["push", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async (input, init) => {
        requestCount += 1;
        assert.equal(String(input).endsWith("/api/v1/content/doc-1"), true);
        assert.equal(init?.method, "PUT");

        const body = JSON.parse(String(init?.body)) as {
          format: string;
          body: string;
          frontmatter: Record<string, unknown>;
          draftRevision: number;
          publishedVersion: number | null;
        };
        assert.equal(body.format, "md");
        assert.equal(body.body.includes("Updated draft body"), true);
        assert.equal(body.frontmatter.title, "Hello World");
        assert.equal(body.draftRevision, 1);
        assert.equal(body.publishedVersion, 1);

        return createSuccessResponse({
          documentId: "doc-1",
          type: "BlogPost",
          locale: "en",
          path: "content/blog/hello-world",
          format: "md",
          draftRevision: 2,
          publishedVersion: 1,
        });
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 0);
    assert.equal(requestCount, 1);

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      {
        draftRevision: number;
        hash: string;
      }
    >;

    assert.equal(manifest["doc-1"]?.draftRevision, 2);
    assert.notEqual(manifest["doc-1"]?.hash, "old-hash");
  });
});

test("push falls back to POST and rewrites manifest key when PUT target is missing", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-missing": {
            path: "content/blog/new-post.en.md",
            format: "md",
            draftRevision: 1,
            publishedVersion: null,
            hash: "old-hash",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(
      join(cwd, "content/blog/new-post.en.md"),
      '---\ntitle: "New Post"\n---\n\nHello\n',
      "utf8",
    );

    let putCalls = 0;
    let postCalls = 0;
    const exitCode = await runMdcmsCli(["push", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async (input, init) => {
        const url = String(input);

        if (url.endsWith("/api/v1/content/doc-missing")) {
          putCalls += 1;
          assert.equal(init?.method, "PUT");
          return new Response(
            JSON.stringify({
              code: "NOT_FOUND",
              message: "Document not found.",
            }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          );
        }

        assert.equal(url.endsWith("/api/v1/content"), true);
        postCalls += 1;
        assert.equal(init?.method, "POST");

        const body = JSON.parse(String(init?.body)) as {
          type: string;
          locale: string;
          path: string;
          format: string;
        };

        assert.equal(body.type, "BlogPost");
        assert.equal(body.locale, "en");
        assert.equal(body.path, "content/blog/new-post");
        assert.equal(body.format, "md");

        return createSuccessResponse({
          documentId: "doc-created",
          type: "BlogPost",
          locale: "en",
          path: "content/blog/new-post",
          format: "md",
          draftRevision: 1,
          publishedVersion: null,
        });
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 0);
    assert.equal(putCalls, 1);
    assert.equal(postCalls, 1);

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      { path: string }
    >;

    assert.equal(existsSync(join(cwd, "content/blog/new-post.en.md")), true);
    assert.equal(manifest["doc-missing"], undefined);
    assert.equal(manifest["doc-created"]?.path, "content/blog/new-post.en.md");
  });
});

test("push sends only changed documents and skips unchanged manifest entries", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await mkdir(join(cwd, "content", "blog"), { recursive: true });

    const changedContent = "# Changed\n";
    const unchangedOneContent = "# Unchanged one\n";
    const unchangedTwoContent = "# Unchanged two\n";

    await writeFile(
      join(cwd, "content/blog/changed.en.md"),
      changedContent,
      "utf8",
    );
    await writeFile(
      join(cwd, "content/blog/unchanged-one.en.md"),
      unchangedOneContent,
      "utf8",
    );
    await writeFile(
      join(cwd, "content/blog/unchanged-two.en.md"),
      unchangedTwoContent,
      "utf8",
    );

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-changed": {
            path: "content/blog/changed.en.md",
            format: "md",
            draftRevision: 1,
            publishedVersion: null,
            hash: "outdated-hash",
          },
          "doc-unchanged-1": {
            path: "content/blog/unchanged-one.en.md",
            format: "md",
            draftRevision: 4,
            publishedVersion: null,
            hash: hashRawContent(unchangedOneContent),
          },
          "doc-unchanged-2": {
            path: "content/blog/unchanged-two.en.md",
            format: "md",
            draftRevision: 7,
            publishedVersion: 2,
            hash: hashRawContent(unchangedTwoContent),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    let stdout = "";
    let requestCount = 0;
    const exitCode = await runMdcmsCli(["push", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async (input, init) => {
        requestCount += 1;
        assert.equal(
          String(input).endsWith("/api/v1/content/doc-changed"),
          true,
        );
        assert.equal(init?.method, "PUT");
        return createSuccessResponse({
          documentId: "doc-changed",
          type: "BlogPost",
          locale: "en",
          path: "content/blog/changed",
          format: "md",
          draftRevision: 2,
          publishedVersion: null,
        });
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: {
        write: (chunk) => {
          stdout += chunk;
        },
      },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 0);
    assert.equal(requestCount, 1);
    assert.equal(stdout.includes("Unchanged (skipped): 2"), true);
  });
});

test("push exits successfully without API calls when no changed documents are found", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await mkdir(join(cwd, "content", "blog"), { recursive: true });

    const localContent = "# Stable document\n";
    await writeFile(
      join(cwd, "content/blog/stable.en.md"),
      localContent,
      "utf8",
    );
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-stable": {
            path: "content/blog/stable.en.md",
            format: "md",
            draftRevision: 3,
            publishedVersion: 1,
            hash: hashRawContent(localContent),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    let stdout = "";
    let requestCount = 0;
    let confirmCount = 0;
    const exitCode = await runMdcmsCli(["push"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        requestCount += 1;
        throw new Error("fetch should not be called");
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: {
        write: (chunk) => {
          stdout += chunk;
        },
      },
      stderr: { write: () => undefined },
      confirm: async () => {
        confirmCount += 1;
        return true;
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(requestCount, 0);
    assert.equal(confirmCount, 0);
    assert.equal(
      stdout.includes("No changed manifest-tracked documents to push"),
      true,
    );
  });
});

test("push treats missing manifest hash as changed and repairs hash after success", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await mkdir(join(cwd, "content", "blog"), { recursive: true });

    const localContent = "# Missing hash compatibility\n";
    await writeFile(
      join(cwd, "content/blog/missing-hash.en.md"),
      localContent,
      "utf8",
    );
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-legacy": {
            path: "content/blog/missing-hash.en.md",
            format: "md",
            draftRevision: 1,
            publishedVersion: null,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    let requestCount = 0;
    const exitCode = await runMdcmsCli(["push", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        requestCount += 1;
        return createSuccessResponse({
          documentId: "doc-legacy",
          type: "BlogPost",
          locale: "en",
          path: "content/blog/missing-hash",
          format: "md",
          draftRevision: 2,
          publishedVersion: null,
        });
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 0);
    assert.equal(requestCount, 1);

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      { hash?: string }
    >;
    assert.equal(typeof manifest["doc-legacy"]?.hash, "string");
    assert.equal((manifest["doc-legacy"]?.hash ?? "").length > 0, true);
  });
});

test("push fails with deterministic error on unsupported file extension", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-1": {
            path: "content/blog/hello-world.txt",
            format: "md",
            draftRevision: 1,
            publishedVersion: null,
            hash: "old-hash",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(join(cwd, "content/blog/hello-world.txt"), "hello", "utf8");

    let stderr = "";
    const exitCode = await runMdcmsCli(["push", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        throw new Error("fetch should not be called");
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: { write: () => undefined },
      stderr: {
        write: (chunk) => {
          stderr += chunk;
        },
      },
      confirm: async () => true,
    });

    assert.equal(exitCode, 1);
    assert.equal(stderr.includes("UNSUPPORTED_EXTENSION"), true);
  });
});

test("push reports stale document as failed and continues pushing remaining documents", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-stale": {
            path: "content/blog/stale-post.en.md",
            format: "md",
            draftRevision: 1,
            publishedVersion: null,
            hash: "old-hash-1",
          },
          "doc-fresh": {
            path: "content/blog/fresh-post.en.md",
            format: "md",
            draftRevision: 3,
            publishedVersion: 2,
            hash: "old-hash-2",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(
      join(cwd, "content/blog/stale-post.en.md"),
      '---\ntitle: "Stale"\n---\nstale body\n',
      "utf8",
    );
    await writeFile(
      join(cwd, "content/blog/fresh-post.en.md"),
      '---\ntitle: "Fresh"\n---\nfresh body\n',
      "utf8",
    );

    const stdoutChunks: string[] = [];
    let requestCount = 0;

    const exitCode = await runMdcmsCli(["push", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async (input) => {
        requestCount += 1;
        const url = String(input);

        if (url.endsWith("/api/v1/content/doc-stale")) {
          return new Response(
            JSON.stringify({
              code: "STALE_DRAFT_REVISION",
              message: "Draft has been modified since your last pull.",
              statusCode: 409,
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          );
        }

        return createSuccessResponse({
          documentId: "doc-fresh",
          type: "BlogPost",
          locale: "en",
          path: "content/blog/fresh-post",
          format: "md",
          draftRevision: 4,
          publishedVersion: 2,
        });
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: {
        write: (chunk: string) => {
          stdoutChunks.push(chunk);
        },
      },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    // Exit code 1 because there is at least one failure
    assert.equal(exitCode, 1);
    // Both documents were sent
    assert.equal(requestCount, 2);

    const output = stdoutChunks.join("");

    // Stale doc reported as failed
    assert.ok(output.includes("[FAILED]"));
    assert.ok(output.includes("doc-stale"));
    assert.ok(output.includes("STALE_DRAFT_REVISION"));

    // Fresh doc reported as updated
    assert.ok(output.includes("[UPDATED]"));
    assert.ok(output.includes("doc-fresh"));

    // Actionable summary printed
    assert.ok(output.includes("cms pull"));

    // Manifest updated for fresh doc, stale doc unchanged
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as Record<string, { draftRevision: number; hash: string }>;
    assert.equal(manifest["doc-fresh"]?.draftRevision, 4);
    assert.equal(manifest["doc-stale"]?.draftRevision, 1);
    assert.equal(manifest["doc-stale"]?.hash, "old-hash-1");
  });
});

test("push --dry-run prints plan without performing API calls", async () => {
  await withTempDir(async (cwd) => {
    const manifestPath = join(
      cwd,
      ".mdcms",
      "manifests",
      "marketing-site.staging.json",
    );
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          "doc-1": {
            path: "content/blog/hello-world.en.md",
            format: "md",
            draftRevision: 1,
            publishedVersion: null,
            hash: "old-hash",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await mkdir(join(cwd, "content", "blog"), { recursive: true });
    await writeFile(
      join(cwd, "content/blog/hello-world.en.md"),
      "# Hello\n",
      "utf8",
    );

    let requestCount = 0;
    let stdout = "";
    const exitCode = await runMdcmsCli(["push", "--dry-run"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        requestCount += 1;
        throw new Error("fetch should not be called");
      },
      loadConfig: async () => ({
        config: {
          serverUrl: "http://localhost:4000",
          project: "marketing-site",
          environment: "staging",
          types: [
            {
              name: "BlogPost",
              directory: "content/blog",
              localized: true,
            },
          ],
        },
        configPath: join(cwd, "mdcms.config.ts"),
      }),
      stdout: {
        write: (chunk) => {
          stdout += chunk;
        },
      },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 0);
    assert.equal(requestCount, 0);
    assert.equal(stdout.includes("Unchanged (skipped): 0"), true);
  });
});

test("push --validate --dry-run passes valid documents without API calls", async () => {
  await withTempDir(async (cwd) => {
    const config = parseMdcmsConfig(
      defineConfig({
        serverUrl: "http://localhost:4000",
        project: "test-project",
        environment: "staging",
        contentDirectories: ["content"],
        types: [
          defineType("Post", {
            directory: "content/posts",
            localized: false,
            fields: {
              title: z.string(),
            },
          }),
        ],
        environments: { staging: {} },
      }),
    );

    const manifestPath = join(cwd, ".mdcms", "manifests", "test-project.staging.json");
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({
        "doc-1": {
          path: "content/posts/hello.md",
          format: "md",
          draftRevision: 1,
          publishedVersion: null,
          hash: "old-hash",
        },
      }),
      "utf8",
    );

    await mkdir(join(cwd, "content", "posts"), { recursive: true });
    await writeFile(
      join(cwd, "content/posts/hello.md"),
      '---\ntitle: "Hello"\n---\nBody\n',
      "utf8",
    );

    let requestCount = 0;
    let stdout = "";

    const exitCode = await runMdcmsCli(["push", "--validate", "--dry-run"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        requestCount += 1;
        throw new Error("fetch should not be called");
      },
      loadConfig: async () => ({ config, configPath: join(cwd, "mdcms.config.ts") }),
      stdout: { write: (chunk: string) => { stdout += chunk; } },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 0);
    assert.equal(requestCount, 0);
    assert.equal(stdout.includes("Validation passed"), true);
  });
});

test("push --validate --dry-run exits 1 on validation errors", async () => {
  await withTempDir(async (cwd) => {
    const config = parseMdcmsConfig(
      defineConfig({
        serverUrl: "http://localhost:4000",
        project: "test-project",
        environment: "staging",
        contentDirectories: ["content"],
        types: [
          defineType("Post", {
            directory: "content/posts",
            localized: false,
            fields: {
              title: z.string(),
              order: z.number(),
            },
          }),
        ],
        environments: { staging: {} },
      }),
    );

    const manifestPath = join(cwd, ".mdcms", "manifests", "test-project.staging.json");
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({
        "doc-1": {
          path: "content/posts/bad.md",
          format: "md",
          draftRevision: 1,
          publishedVersion: null,
          hash: "old-hash",
        },
      }),
      "utf8",
    );

    await mkdir(join(cwd, "content", "posts"), { recursive: true });
    await writeFile(
      join(cwd, "content/posts/bad.md"),
      "---\norder: not-a-number\n---\nBody\n",
      "utf8",
    );

    let stderr = "";
    let requestCount = 0;

    const exitCode = await runMdcmsCli(["push", "--validate", "--dry-run"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        requestCount += 1;
        throw new Error("fetch should not be called");
      },
      loadConfig: async () => ({ config, configPath: join(cwd, "mdcms.config.ts") }),
      stdout: { write: () => undefined },
      stderr: { write: (chunk: string) => { stderr += chunk; } },
      confirm: async () => true,
    });

    assert.equal(exitCode, 1);
    assert.equal(requestCount, 0);
    assert.equal(stderr.includes("title"), true);
    assert.equal(stderr.includes("required"), true);
    assert.equal(stderr.includes("order"), true);
    assert.equal(stderr.includes("number"), true);
  });
});

test("push --validate blocks push on errors even without --dry-run", async () => {
  await withTempDir(async (cwd) => {
    const config = parseMdcmsConfig(
      defineConfig({
        serverUrl: "http://localhost:4000",
        project: "test-project",
        environment: "staging",
        contentDirectories: ["content"],
        types: [
          defineType("Post", {
            directory: "content/posts",
            localized: false,
            fields: {
              title: z.string(),
            },
          }),
        ],
        environments: { staging: {} },
      }),
    );

    const manifestPath = join(cwd, ".mdcms", "manifests", "test-project.staging.json");
    await mkdir(join(cwd, ".mdcms", "manifests"), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({
        "doc-1": {
          path: "content/posts/bad.md",
          format: "md",
          draftRevision: 1,
          publishedVersion: null,
          hash: "old-hash",
        },
      }),
      "utf8",
    );

    await mkdir(join(cwd, "content", "posts"), { recursive: true });
    await writeFile(
      join(cwd, "content/posts/bad.md"),
      "---\n---\nBody\n",
      "utf8",
    );

    let requestCount = 0;

    const exitCode = await runMdcmsCli(["push", "--validate", "--force"], {
      cwd,
      env: {} as NodeJS.ProcessEnv,
      fetcher: async () => {
        requestCount += 1;
        throw new Error("fetch should not be called");
      },
      loadConfig: async () => ({ config, configPath: join(cwd, "mdcms.config.ts") }),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
      confirm: async () => true,
    });

    assert.equal(exitCode, 1);
    assert.equal(requestCount, 0);
  });
});
