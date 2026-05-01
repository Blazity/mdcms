import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import { ECHO_PROVIDER_ID } from "./echo.js";
import { AI_PROVIDER_ENV_KEY, resolveAiProvider } from "./factory.js";
import { NULL_PROVIDER_ID } from "./null.js";

describe("resolveAiProvider", () => {
  test("returns null provider when env var is missing", () => {
    const provider = resolveAiProvider({ env: {} });
    assert.equal(provider.id, NULL_PROVIDER_ID);
  });

  test("returns null provider when env var is 'disabled'", () => {
    const provider = resolveAiProvider({
      env: { [AI_PROVIDER_ENV_KEY]: "disabled" },
    });
    assert.equal(provider.id, NULL_PROVIDER_ID);
  });

  test("returns echo provider when env var is 'echo'", () => {
    const provider = resolveAiProvider({
      env: { [AI_PROVIDER_ENV_KEY]: "echo" },
    });
    assert.equal(provider.id, ECHO_PROVIDER_ID);
  });

  test("normalizes case and whitespace", () => {
    const provider = resolveAiProvider({
      env: { [AI_PROVIDER_ENV_KEY]: "  ECHO  " },
    });
    assert.equal(provider.id, ECHO_PROVIDER_ID);
  });

  test("throws AI_PROVIDER_UNAVAILABLE for unknown ids", () => {
    assert.throws(
      () =>
        resolveAiProvider({
          env: { [AI_PROVIDER_ENV_KEY]: "anthropic" },
        }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "AI_PROVIDER_UNAVAILABLE",
    );
  });

  test("null provider throws AI_DISABLED on use", async () => {
    const provider = resolveAiProvider({ env: {} });

    await assert.rejects(
      () =>
        provider.complete({
          taskKind: "copy_improvement",
          promptTemplateId: "copy_improvement.v1",
          system: "x",
          user: "y",
        }),
      (error) => error instanceof RuntimeError && error.code === "AI_DISABLED",
    );
  });
});
