import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import { aiError, isAiErrorCode, mapProviderError } from "./errors.js";

describe("aiError", () => {
  test("uses default status code per AI error code", () => {
    assert.equal(aiError("AI_DISABLED", "off").statusCode, 403);
    assert.equal(aiError("AI_PROVIDER_UNAVAILABLE", "x").statusCode, 503);
    assert.equal(aiError("AI_RATE_LIMITED", "x").statusCode, 429);
    assert.equal(aiError("AI_CONTEXT_TOO_LARGE", "x").statusCode, 413);
    assert.equal(aiError("AI_OUTPUT_INVALID", "x").statusCode, 422);
    assert.equal(aiError("AI_UNSUPPORTED_TASK", "x").statusCode, 400);
  });

  test("respects explicit statusCode override", () => {
    assert.equal(
      aiError("AI_PROVIDER_UNAVAILABLE", "x", undefined, 502).statusCode,
      502,
    );
  });

  test("forwards details", () => {
    const error = aiError("AI_OUTPUT_INVALID", "boom", { path: "operations" });
    assert.deepEqual(error.details, { path: "operations" });
  });
});

describe("isAiErrorCode", () => {
  test("matches all known codes", () => {
    [
      "AI_DISABLED",
      "AI_PROVIDER_UNAVAILABLE",
      "AI_RATE_LIMITED",
      "AI_CONTEXT_TOO_LARGE",
      "AI_OUTPUT_INVALID",
      "AI_UNSUPPORTED_TASK",
    ].forEach((code) => assert.equal(isAiErrorCode(code), true));
  });

  test("rejects unrelated codes", () => {
    assert.equal(isAiErrorCode("INTERNAL_ERROR"), false);
    assert.equal(isAiErrorCode("ai_disabled"), false);
  });
});

describe("mapProviderError", () => {
  test("passes through existing AI_* RuntimeErrors", () => {
    const original = aiError("AI_DISABLED", "off");
    const mapped = mapProviderError(original);
    assert.equal(mapped, original);
  });

  test("does not pass through unrelated RuntimeError codes", () => {
    const unrelated = new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "boom",
      statusCode: 500,
    });
    const mapped = mapProviderError(unrelated);
    assert.equal(mapped.code, "AI_PROVIDER_UNAVAILABLE");
    assert.equal(mapped.statusCode, 503);
  });

  test("collapses generic Errors to AI_PROVIDER_UNAVAILABLE", () => {
    const mapped = mapProviderError(new Error("network down"));
    assert.equal(mapped.code, "AI_PROVIDER_UNAVAILABLE");
    assert.equal(mapped.statusCode, 503);
  });

  test("does not leak provider error message", () => {
    const mapped = mapProviderError(new Error("API_KEY=sk-secret invalid"));
    assert.equal(
      mapped.message.includes("sk-secret"),
      false,
      "mapped message must not echo provider error text",
    );
  });

  test("handles non-Error throws", () => {
    const mapped = mapProviderError("string failure");
    assert.equal(mapped.code, "AI_PROVIDER_UNAVAILABLE");
  });
});
