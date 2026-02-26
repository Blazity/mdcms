import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";

import { createServerRequestHandlerWithModules } from "./runtime-with-modules.js";

const env = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "1.0.0",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
  DATABASE_URL: "postgres://test:test@localhost:5432/mdcms_test",
} as NodeJS.ProcessEnv;

const envWithoutAppVersion = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
  DATABASE_URL: "postgres://test:test@localhost:5432/mdcms_test",
} as NodeJS.ProcessEnv;

const logger = createConsoleLogger({
  level: "trace",
  sink: () => undefined,
});

test("createServerRequestHandlerWithModules surfaces module actions in /api/v1/actions", async () => {
  const { handler, moduleLoadReport, dbConnection } =
    createServerRequestHandlerWithModules({
      env,
      logger,
    });

  try {
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
  } finally {
    await dbConnection.close();
  }
});

test("createServerRequestHandlerWithModules mounts server module routes", async () => {
  const { handler, dbConnection } = createServerRequestHandlerWithModules({
    env,
    logger,
  });

  try {
    const coreResponse = await handler(
      new Request("http://localhost/api/v1/modules/core-system/ping"),
    );
    const coreBody = (await coreResponse.json()) as Record<string, unknown>;

    assert.equal(coreResponse.status, 200);
    assert.equal(coreBody.moduleId, "core.system");

    const contentResponse = await handler(
      new Request("http://localhost/api/v1/modules/domain-content/preview"),
    );
    const contentBody = (await contentResponse.json()) as Record<
      string,
      unknown
    >;

    assert.equal(contentResponse.status, 200);
    assert.equal(contentBody.moduleId, "domain.content");
  } finally {
    await dbConnection.close();
  }
});

test("createServerRequestHandlerWithModules loads bundled modules when APP_VERSION is unset", async () => {
  const { moduleLoadReport, dbConnection } =
    createServerRequestHandlerWithModules({
      env: envWithoutAppVersion,
      logger,
    });

  try {
    assert.deepEqual(moduleLoadReport.loadedModuleIds, [
      "core.system",
      "domain.content",
    ]);
  } finally {
    await dbConnection.close();
  }
});
