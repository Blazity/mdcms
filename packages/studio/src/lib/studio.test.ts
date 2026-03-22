import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError, type ActionCatalogItem } from "@mdcms/shared";

import {
  createStudioEmbedConfig,
  createStudioRuntimeContext,
  formatStudioErrorEnvelope,
  resolveStudioEnv,
} from "./studio.js";
import { createStudioActionCatalogAdapter } from "./action-catalog-adapter.js";
import { StudioShellFrame } from "./studio-component.js";
import { loadStudioDocumentShell } from "./document-shell.js";

test("resolveStudioEnv parses core env and applies Studio defaults", () => {
  const env = resolveStudioEnv({
    NODE_ENV: "production",
    LOG_LEVEL: "warn",
    APP_VERSION: "2.0.0",
  } as NodeJS.ProcessEnv);

  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.LOG_LEVEL, "warn");
  assert.equal(env.APP_VERSION, "2.0.0");
  assert.equal(env.STUDIO_NAME, "studio");
});

test("createStudioRuntimeContext wires env and logger", () => {
  const context = createStudioRuntimeContext({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    APP_VERSION: "2.0.0",
    STUDIO_NAME: "authoring-ui",
  } as NodeJS.ProcessEnv);

  assert.equal(context.env.STUDIO_NAME, "authoring-ui");
  assert.ok(context.logger);
});

test("createStudioEmbedConfig returns a plain serializable studio shell config", () => {
  const config = createStudioEmbedConfig({
    project: "marketing-site",
    environment: "staging",
    serverUrl: "http://localhost:4000",
    types: [
      {
        name: "post",
        directory: "content/posts",
        fields: {
          title: {
            "~standard": {
              version: 1,
              vendor: "test",
              validate: () => ({ value: "title" }),
            },
          },
        },
        extend(overlay) {
          return overlay;
        },
      },
    ],
  });

  assert.deepEqual(config, {
    project: "marketing-site",
    environment: "staging",
    serverUrl: "http://localhost:4000",
  });
});

test("createStudioEmbedConfig rejects missing environment values", () => {
  assert.throws(
    () =>
      createStudioEmbedConfig({
        project: "marketing-site",
        serverUrl: "http://localhost:4000",
      }),
    /environment/,
  );
});

test("formatStudioErrorEnvelope keeps RuntimeError code", () => {
  const envelope = formatStudioErrorEnvelope(
    new RuntimeError({
      code: "STUDIO_RUNTIME_ERROR",
      message: "Cannot load studio runtime.",
      statusCode: 500,
    }),
  );

  assert.equal(envelope.status, "error");
  assert.equal(envelope.code, "STUDIO_RUNTIME_ERROR");
  assert.equal(envelope.message, "Cannot load studio runtime.");
});

test("createStudioActionCatalogAdapter lists actions from /api/v1/actions", async () => {
  const adapter = createStudioActionCatalogAdapter("http://localhost", {
    fetcher: async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "http://localhost/api/v1/actions");
      assert.equal(init?.method, "GET");

      const payload: ActionCatalogItem[] = [
        {
          id: "content.list",
          kind: "query",
          method: "GET",
          path: "/api/v1/content",
          permissions: ["content:read"],
        },
      ];

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await adapter.list();

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "content.list");
});

test("createStudioActionCatalogAdapter resolves detail and validates shape", async () => {
  const adapter = createStudioActionCatalogAdapter("http://localhost", {
    fetcher: async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(
        String(input),
        "http://localhost/api/v1/actions/content.publish",
      );
      assert.equal(init?.method, "GET");

      return new Response(
        JSON.stringify({
          id: "content.publish",
          kind: "command",
          method: "POST",
          path: "/api/v1/content/:id/publish",
          permissions: ["content:publish"],
        } satisfies ActionCatalogItem),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await adapter.getById("content.publish");
  assert.equal(result.id, "content.publish");
});

test("StudioShellFrame renders deterministic startup metadata", () => {
  const node = StudioShellFrame({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    basePath: "/admin",
    startupState: "loading",
  });

  assert.equal(typeof node, "object");
  assert.equal(node.props["data-testid"], "mdcms-studio-root");
  assert.equal(node.props["data-mdcms-project"], "marketing-site");
  assert.equal(node.props["data-mdcms-server-url"], "http://localhost:4000");
  assert.equal(node.props["data-mdcms-base-path"], "/admin");
  assert.equal(node.props["data-mdcms-brand"], "MDCMS");
  assert.equal(node.props["data-mdcms-state"], "loading");
});

test("StudioShellFrame renders loading startup message", () => {
  const node = StudioShellFrame({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    basePath: "/admin",
    startupState: "loading",
  });

  assert.equal(node.props["data-mdcms-state"], "loading");
  assert.equal(
    node.props.children[0].props.children[0].props.children[2].props.children,
    "Loading Studio...",
  );
});

test("StudioShellFrame renders fatal startup errors", () => {
  const node = StudioShellFrame({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    basePath: "/admin",
    startupState: "error",
    errorMessage: "Bootstrap request failed.",
  });

  assert.equal(node.props["data-mdcms-state"], "error");
  const headerChildren =
    node.props.children[0].props.children[0].props.children.filter(Boolean);
  assert.equal(headerChildren.length, 2);
  assert.equal(
    node.props.children[1].props.children[0].props.children,
    "Studio startup failed",
  );
  assert.equal(
    node.props.children[1].props.children[1].props.children,
    "Bootstrap request failed.",
  );
});

test("loadStudioDocumentShell fetches draft content with scoped headers", async () => {
  const result = await loadStudioDocumentShell(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    {
      type: "BlogPost",
      documentId: "11111111-1111-4111-8111-111111111111",
      locale: "en",
    },
    {
      fetcher: async (input, init) => {
        assert.equal(
          String(input),
          "http://localhost:4000/api/v1/content/11111111-1111-4111-8111-111111111111?draft=true",
        );
        assert.equal(
          (init?.headers as Record<string, string>)["x-mdcms-project"],
          "marketing-site",
        );
        assert.equal(
          (init?.headers as Record<string, string>)["x-mdcms-environment"],
          "staging",
        );
        assert.equal(
          (init?.headers as Record<string, string>)["x-mdcms-locale"],
          "en",
        );

        return new Response(
          JSON.stringify({
            data: {
              documentId: "11111111-1111-4111-8111-111111111111",
              type: "BlogPost",
              locale: "en",
              path: "blog/launch-notes",
              body: "# Launch Notes",
              updatedAt: "2026-03-04T10:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    },
  );

  assert.equal(result.state, "ready");
  assert.equal(result.data?.path, "blog/launch-notes");
});

test("loadStudioDocumentShell exposes typed error code for failed responses", async () => {
  const result = await loadStudioDocumentShell(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    {
      type: "BlogPost",
      documentId: "11111111-1111-4111-8111-111111111111",
      locale: "en",
    },
    {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            code: "FORBIDDEN",
            message: "Document is outside of allowed scope.",
          }),
          {
            status: 403,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    },
  );

  assert.equal(result.state, "error");
  assert.equal(result.errorCode, "FORBIDDEN");
  assert.equal(result.errorMessage, "Document is outside of allowed scope.");
});
