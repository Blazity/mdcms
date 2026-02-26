import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "../runtime/error.js";
import { assertContentScope } from "./content-scope.js";

const validScope = {
  projectId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  environmentId: "f0e1d2c3-b4a5-6789-0abc-def123456789",
};

test("assertContentScope accepts a valid scope", () => {
  assert.doesNotThrow(() => assertContentScope(validScope));
});

test("assertContentScope rejects null", () => {
  assert.throws(
    () => assertContentScope(null),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONTENT_SCOPE" &&
      error.statusCode === 400,
  );
});

test("assertContentScope rejects non-object", () => {
  assert.throws(
    () => assertContentScope("not-an-object"),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_CONTENT_SCOPE",
  );
});

test("assertContentScope rejects non-UUID projectId", () => {
  assert.throws(
    () => assertContentScope({ ...validScope, projectId: "not-a-uuid" }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONTENT_SCOPE" &&
      error.message.includes("projectId"),
  );
});

test("assertContentScope rejects missing environmentId", () => {
  assert.throws(
    () => assertContentScope({ projectId: validScope.projectId }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_CONTENT_SCOPE" &&
      error.message.includes("environmentId"),
  );
});

test("assertContentScope rejects array", () => {
  assert.throws(
    () => assertContentScope([]),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "INVALID_CONTENT_SCOPE",
  );
});

test("assertContentScope uses custom path in error messages", () => {
  assert.throws(
    () => assertContentScope(null, "request.scope"),
    (error: unknown) =>
      error instanceof RuntimeError && error.message.includes("request.scope"),
  );
});
