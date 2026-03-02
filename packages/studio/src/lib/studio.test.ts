import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError, type ActionCatalogItem } from "@mdcms/shared";

import {
  createStudioRuntimeContext,
  formatStudioErrorEnvelope,
  resolveStudioEnv,
} from "./studio.js";
import { createStudioActionCatalogAdapter } from "./action-catalog-adapter.js";
import { Studio } from "./studio-component.js";

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

test("Studio renders deterministic embed shell marker", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      serverUrl: "http://localhost:4000",
    },
  });

  assert.equal(typeof node, "object");
  assert.equal(node.props["data-testid"], "mdcms-studio-root");
  assert.equal(node.props["data-mdcms-project"], "marketing-site");
  assert.equal(node.props["data-mdcms-server-url"], "http://localhost:4000");
});
