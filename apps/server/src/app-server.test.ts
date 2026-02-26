import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";

import { createAppServerRequestHandler } from "./app-server.js";

const env = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "1.0.0",
  PORT: "4000",
  SERVICE_NAME: "mdcms-app-server",
} as NodeJS.ProcessEnv;

const envWithoutAppVersion = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  PORT: "4000",
  SERVICE_NAME: "mdcms-app-server",
} as NodeJS.ProcessEnv;

const logger = createConsoleLogger({
  level: "trace",
  sink: () => undefined,
});

test("createAppServerRequestHandler surfaces module actions in /api/v1/actions", async () => {
  const { handler, moduleLoadReport } = createAppServerRequestHandler({
    env,
    logger,
  });

  const response = await handler(
    new Request("http://localhost/api/v1/actions"),
  );
  const body = (await response.json()) as Array<{ id: string }>;

  assert.equal(response.status, 200);
  assert.equal(moduleLoadReport.loadedModuleIds.length > 0, true);
  assert.deepEqual(
    body.map((entry) => entry.id),
    ["core.system.ping", "domain.content.preview"],
  );
});

test("createAppServerRequestHandler mounts server module routes", async () => {
  const { handler } = createAppServerRequestHandler({
    env,
    logger,
  });

  const coreResponse = await handler(
    new Request("http://localhost/api/v1/modules/core-system/ping"),
  );
  const coreBody = (await coreResponse.json()) as Record<string, unknown>;

  assert.equal(coreResponse.status, 200);
  assert.equal(coreBody.moduleId, "core.system");

  const contentResponse = await handler(
    new Request("http://localhost/api/v1/modules/domain-content/preview"),
  );
  const contentBody = (await contentResponse.json()) as Record<string, unknown>;

  assert.equal(contentResponse.status, 200);
  assert.equal(contentBody.moduleId, "domain.content");
});

test("createAppServerRequestHandler loads bundled modules when APP_VERSION is unset", async () => {
  const { moduleLoadReport } = createAppServerRequestHandler({
    env: envWithoutAppVersion,
    logger,
  });

  assert.deepEqual(moduleLoadReport.loadedModuleIds, [
    "core.system",
    "domain.content",
  ]);
});
