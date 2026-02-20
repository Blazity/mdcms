import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import {
  createStudioRuntimeContext,
  formatStudioErrorEnvelope,
  resolveStudioEnv,
} from "./studio.js";

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
