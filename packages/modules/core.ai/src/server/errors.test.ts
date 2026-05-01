import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { APICallError, NoObjectGeneratedError, TypeValidationError } from "ai";
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

  test("maps NoObjectGeneratedError to AI_OUTPUT_INVALID", () => {
    const noObject = new NoObjectGeneratedError({
      message: "no object",
      cause: undefined,
      text: "garbage",
      response: { id: "r", timestamp: new Date(), modelId: "m" },
      usage: {
        inputTokens: undefined,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: undefined,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: undefined,
      },
      finishReason: "stop",
    });
    const mapped = mapProviderError(noObject);
    assert.equal(mapped.code, "AI_OUTPUT_INVALID");
    assert.equal(mapped.statusCode, 422);
  });

  test("maps TypeValidationError to AI_OUTPUT_INVALID", () => {
    const typeError = new TypeValidationError({
      value: { foo: "bar" },
      cause: new Error("schema check failed"),
    });
    const mapped = mapProviderError(typeError);
    assert.equal(mapped.code, "AI_OUTPUT_INVALID");
  });

  test("maps APICallError 429 to AI_RATE_LIMITED", () => {
    const rate = new APICallError({
      message: "rate limited",
      url: "https://example",
      requestBodyValues: {},
      statusCode: 429,
    });
    const mapped = mapProviderError(rate);
    assert.equal(mapped.code, "AI_RATE_LIMITED");
    assert.equal(mapped.statusCode, 429);
  });

  test("maps APICallError 413 to AI_CONTEXT_TOO_LARGE", () => {
    const tooLarge = new APICallError({
      message: "context too large",
      url: "https://example",
      requestBodyValues: {},
      statusCode: 413,
    });
    const mapped = mapProviderError(tooLarge);
    assert.equal(mapped.code, "AI_CONTEXT_TOO_LARGE");
    assert.equal(mapped.statusCode, 413);
  });

  test("maps generic APICallError to AI_PROVIDER_UNAVAILABLE", () => {
    const apiError = new APICallError({
      message: "boom",
      url: "https://example",
      requestBodyValues: {},
      statusCode: 500,
    });
    const mapped = mapProviderError(apiError);
    assert.equal(mapped.code, "AI_PROVIDER_UNAVAILABLE");
  });
});
