import assert from "node:assert/strict";
import { test } from "bun:test";

import { RuntimeError } from "./error.js";
import { createConsoleLogger } from "./logger.js";
import {
  createNamedRuntimeContext,
  formatRuntimeErrorEnvelope,
  resolveNamedRuntimeEnv,
} from "./surface-runtime.js";

test("resolveNamedRuntimeEnv extends validated core env values", () => {
  const env = resolveNamedRuntimeEnv(
    {
      NODE_ENV: "test",
      LOG_LEVEL: "debug",
      APP_VERSION: "1.2.3",
      CLI_NAME: "mdcms",
    } as NodeJS.ProcessEnv,
    ({ rawEnv }) => ({
      CLI_NAME: rawEnv.CLI_NAME?.trim() || "mdcms",
    }),
  );

  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.LOG_LEVEL, "debug");
  assert.equal(env.APP_VERSION, "1.2.3");
  assert.equal(env.CLI_NAME, "mdcms");
});

test("createNamedRuntimeContext wires logger with env level and context", () => {
  let capturedLevel = "";
  let capturedContext: Record<string, unknown> = {};

  const context = createNamedRuntimeContext({
    rawEnv: {
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      APP_VERSION: "1.0.0",
      CLI_NAME: "mdcms",
    } as NodeJS.ProcessEnv,
    resolveEnv: (rawEnv) =>
      resolveNamedRuntimeEnv(rawEnv, ({ rawEnv: sourceEnv }) => ({
        CLI_NAME: sourceEnv.CLI_NAME?.trim() || "mdcms",
      })),
    loggerContext: (env) => ({
      runtime: "cli",
      cliName: env.CLI_NAME,
    }),
    createLogger: (options) => {
      const resolvedOptions = options ?? {};
      capturedLevel = resolvedOptions.level ?? "";
      capturedContext = resolvedOptions.context ?? {};

      return createConsoleLogger({
        ...resolvedOptions,
        sink: () => undefined,
      });
    },
  });

  assert.equal(capturedLevel, "warn");
  assert.deepEqual(capturedContext, {
    runtime: "cli",
    cliName: "mdcms",
  });
  assert.equal(context.env.CLI_NAME, "mdcms");
});

test("formatRuntimeErrorEnvelope preserves RuntimeError details", () => {
  const envelope = formatRuntimeErrorEnvelope(
    new RuntimeError({
      code: "INVALID_ENV",
      message: "Invalid env input.",
      details: { key: "PORT" },
      statusCode: 400,
    }),
    "req-1",
  );

  assert.equal(envelope.code, "INVALID_ENV");
  assert.equal(envelope.message, "Invalid env input.");
  assert.equal(envelope.requestId, "req-1");
  assert.deepEqual(envelope.details, { key: "PORT" });
});
