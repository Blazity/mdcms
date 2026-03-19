import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "./error.js";
import { extendEnv, parseCoreEnv, parseDatabaseEnv } from "./env.js";

test("parseCoreEnv applies default values when optional vars are missing", () => {
  const env = parseCoreEnv({} as NodeJS.ProcessEnv);

  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.LOG_LEVEL, "info");
  assert.equal(env.APP_VERSION, "0.0.0");
});

test("parseCoreEnv rejects invalid NODE_ENV and LOG_LEVEL values", () => {
  assert.throws(
    () => parseCoreEnv({ NODE_ENV: "staging" } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );

  assert.throws(
    () => parseCoreEnv({ LOG_LEVEL: "silent" } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );
});

test("parseCoreEnv trims NODE_ENV and LOG_LEVEL values before validation", () => {
  const env = parseCoreEnv({
    NODE_ENV: " production ",
    LOG_LEVEL: " warn ",
  } as NodeJS.ProcessEnv);

  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.LOG_LEVEL, "warn");
});

test("parseCoreEnv rejects blank NODE_ENV and LOG_LEVEL values", () => {
  assert.throws(
    () => parseCoreEnv({ NODE_ENV: "   " } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.details?.key === "NODE_ENV" &&
      error.details?.value === "   ",
  );

  assert.throws(
    () => parseCoreEnv({ LOG_LEVEL: "   " } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_ENV" &&
      error.details?.key === "LOG_LEVEL" &&
      error.details?.value === "   ",
  );
});

test("extendEnv composes extension values on top of CoreEnv", () => {
  const core = parseCoreEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    APP_VERSION: "1.2.3",
  } as NodeJS.ProcessEnv);

  const extended = extendEnv(core, () => ({
    SERVICE_NAME: "mdcms-server",
  }));

  assert.equal(extended.NODE_ENV, "test");
  assert.equal(extended.LOG_LEVEL, "debug");
  assert.equal(extended.APP_VERSION, "1.2.3");
  assert.equal(extended.SERVICE_NAME, "mdcms-server");
});

test("parseDatabaseEnv validates required DATABASE_URL and defaults", () => {
  const env = parseDatabaseEnv({
    DATABASE_URL: "postgresql://mdcms:mdcms@localhost:5432/mdcms",
  } as NodeJS.ProcessEnv);

  assert.equal(
    env.DATABASE_URL,
    "postgresql://mdcms:mdcms@localhost:5432/mdcms",
  );
});

test("parseDatabaseEnv rejects missing DATABASE_URL", () => {
  assert.throws(
    () => parseDatabaseEnv({} as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_ENV",
  );
});
