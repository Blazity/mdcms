import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError, type ActionCatalogItem } from "@mdcms/shared";

import {
  createCliRuntimeContext,
  formatCliErrorEnvelope,
  resolveCliEnv,
} from "./cli.js";
import { createCliActionCatalogAdapter } from "./action-catalog-adapter.js";

test("resolveCliEnv parses core env and applies CLI defaults", () => {
  const env = resolveCliEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    APP_VERSION: "1.0.0",
  } as NodeJS.ProcessEnv);

  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.LOG_LEVEL, "debug");
  assert.equal(env.APP_VERSION, "1.0.0");
  assert.equal(env.CLI_NAME, "mdcms");
});

test("createCliRuntimeContext wires env and logger", () => {
  const context = createCliRuntimeContext({
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    APP_VERSION: "1.0.0",
    CLI_NAME: "mdcms-cli",
  } as NodeJS.ProcessEnv);

  assert.equal(context.env.CLI_NAME, "mdcms-cli");
  assert.ok(context.logger);
});

test("createCliRuntimeContext sets LOG_LEVEL to debug when verbose is true", () => {
  const context = createCliRuntimeContext(
    {
      NODE_ENV: "test",
      APP_VERSION: "1.0.0",
    } as NodeJS.ProcessEnv,
    { verbose: true },
  );

  assert.equal(context.env.LOG_LEVEL, "debug");
});

test("createCliRuntimeContext respects explicit LOG_LEVEL over verbose", () => {
  const context = createCliRuntimeContext(
    {
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      APP_VERSION: "1.0.0",
    } as NodeJS.ProcessEnv,
    { verbose: true },
  );

  assert.equal(context.env.LOG_LEVEL, "warn");
});

test("createCliRuntimeContext defaults to info when verbose is false", () => {
  const context = createCliRuntimeContext(
    {
      NODE_ENV: "test",
      APP_VERSION: "1.0.0",
    } as NodeJS.ProcessEnv,
    { verbose: false },
  );

  assert.equal(context.env.LOG_LEVEL, "info");
});

test("formatCliErrorEnvelope keeps RuntimeError code", () => {
  const envelope = formatCliErrorEnvelope(
    new RuntimeError({
      code: "INVALID_INPUT",
      message: "Bad argument.",
      statusCode: 400,
    }),
  );

  assert.equal(envelope.status, "error");
  assert.equal(envelope.code, "INVALID_INPUT");
  assert.equal(envelope.message, "Bad argument.");
});

test("createCliActionCatalogAdapter lists actions from /api/v1/actions", async () => {
  const adapter = createCliActionCatalogAdapter("http://localhost", {
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

test("createCliActionCatalogAdapter resolves detail and validates shape", async () => {
  const adapter = createCliActionCatalogAdapter("http://localhost", {
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
