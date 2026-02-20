import assert from "node:assert/strict";
import { test } from "node:test";

import { createServerRequestHandler } from "./server.js";

const baseEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
} as NodeJS.ProcessEnv;

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
