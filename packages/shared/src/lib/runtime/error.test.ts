import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError, serializeError } from "./error.js";

test("serializeError returns a stable internal envelope for unknown values", () => {
  const now = new Date("2026-02-20T00:00:00.000Z");
  const envelope = serializeError(
    { unexpected: true },
    { now, requestId: "req-1" },
  );

  assert.equal(envelope.status, "error");
  assert.equal(envelope.code, "INTERNAL_ERROR");
  assert.equal(envelope.message, "Unexpected runtime error.");
  assert.equal(envelope.requestId, "req-1");
  assert.equal(envelope.timestamp, "2026-02-20T00:00:00.000Z");
  assert.equal("details" in envelope, false);
});

test("serializeError preserves RuntimeError code and details", () => {
  const now = new Date("2026-02-20T00:00:00.000Z");
  const envelope = serializeError(
    new RuntimeError({
      code: "INVALID_ENV",
      message: "Invalid env input.",
      details: { key: "PORT" },
      statusCode: 500,
    }),
    { now },
  );

  assert.equal(envelope.status, "error");
  assert.equal(envelope.code, "INVALID_ENV");
  assert.equal(envelope.message, "Invalid env input.");
  assert.deepEqual(envelope.details, { key: "PORT" });
  assert.equal(envelope.timestamp, "2026-02-20T00:00:00.000Z");
});
