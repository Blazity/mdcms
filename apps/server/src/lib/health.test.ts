import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionCatalogItem } from "@mdcms/shared";

import { createServerRequestHandler } from "./server.js";

const baseEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
} as NodeJS.ProcessEnv;

const actionCatalog: ActionCatalogItem[] = [
  {
    id: "content.publish",
    kind: "command",
    method: "POST",
    path: "/api/v1/content/:id/publish",
    permissions: ["content:publish"],
    requestSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    },
    responseSchema: {
      type: "object",
      properties: {
        published: { type: "boolean" },
      },
    },
  },
  {
    id: "content.list",
    kind: "query",
    method: "GET",
    path: "/api/v1/content",
    permissions: ["content:read"],
    studio: {
      visible: true,
      label: "List content",
    },
    cli: {
      visible: true,
      inputMode: "json",
    },
  },
];

test("createServerRequestHandler returns process health for GET /healthz", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    startedAtMs: Date.parse("2026-02-20T00:00:00.000Z"),
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });
  const response = await handler(new Request("http://localhost/healthz"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "mdcms-server");
  assert.equal(body.version, "9.9.9");
  assert.equal(body.uptimeSeconds, 10);
});

test("unknown routes return a NOT_FOUND error envelope", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });
  const response = await handler(new Request("http://localhost/missing"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.equal(body.status, "error");
  assert.equal(body.code, "NOT_FOUND");
});

test("health handler failures are normalized to INTERNAL_ERROR envelopes", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    healthCheck: () => {
      throw new Error("health check failed");
    },
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });
  const response = await handler(new Request("http://localhost/healthz"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 500);
  assert.equal(body.status, "error");
  assert.equal(body.code, "INTERNAL_ERROR");
});

test("GET /api/v1/actions returns deterministic action catalog payload", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    actions: actionCatalog,
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });
  const response = await handler(
    new Request("http://localhost/api/v1/actions"),
  );
  const body = (await response.json()) as ActionCatalogItem[];

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.map((action) => action.id),
    ["content.list", "content.publish"],
  );
  assert.deepEqual(body[1]?.requestSchema, actionCatalog[0]?.requestSchema);
  assert.deepEqual(body[1]?.responseSchema, actionCatalog[0]?.responseSchema);
});

test("GET /api/v1/actions/:id returns one action definition", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    actions: actionCatalog,
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });
  const response = await handler(
    new Request("http://localhost/api/v1/actions/content.publish"),
  );
  const body = (await response.json()) as ActionCatalogItem;

  assert.equal(response.status, 200);
  assert.equal(body.id, "content.publish");
  assert.equal(body.kind, "command");
});

test("action visibility policy filters list and hides detail responses", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    actions: actionCatalog,
    isActionVisible: ({ action }) => action.id !== "content.publish",
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });

  const listResponse = await handler(
    new Request("http://localhost/api/v1/actions"),
  );
  const listBody = (await listResponse.json()) as ActionCatalogItem[];

  assert.equal(listResponse.status, 200);
  assert.deepEqual(
    listBody.map((action) => action.id),
    ["content.list"],
  );

  const detailResponse = await handler(
    new Request("http://localhost/api/v1/actions/content.publish"),
  );
  const detailBody = (await detailResponse.json()) as Record<string, unknown>;

  assert.equal(detailResponse.status, 404);
  assert.equal(detailBody.code, "NOT_FOUND");
});

test("unprefixed /actions path is rejected to enforce /api/v1 base path", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    actions: actionCatalog,
    now: () => new Date("2026-02-20T00:00:10.000Z"),
  });
  const response = await handler(new Request("http://localhost/actions"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.equal(body.code, "NOT_FOUND");
});
