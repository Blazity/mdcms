import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import {
  createCliRuntimeContext,
  formatCliErrorEnvelope,
  resolveCliEnv,
} from "./cli.js";

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
