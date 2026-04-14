import assert from "node:assert/strict";
import { test } from "bun:test";

import { RuntimeError } from "../runtime/error.js";
import {
  assertEnvironmentCreateInput,
  assertEnvironmentDefinitionsMeta,
  assertEnvironmentListResponse,
  assertEnvironmentSummary,
} from "./environments.js";

test("assertEnvironmentCreateInput accepts a valid payload", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentCreateInput({
      name: "staging",
      extends: "production",
    }),
  );
});

test("assertEnvironmentCreateInput rejects blank name", () => {
  assert.throws(
    () =>
      assertEnvironmentCreateInput({
        name: "   ",
      }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_INPUT" &&
      error.statusCode === 400 &&
      error.message.includes("value.name"),
  );
});

test("assertEnvironmentCreateInput rejects non-object payloads", () => {
  assert.throws(
    () => assertEnvironmentCreateInput(null),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_INPUT" &&
      error.statusCode === 400,
  );
});

test("assertEnvironmentSummary accepts a valid summary", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentSummary({
      id: "env-production",
      project: "marketing-site",
      name: "production",
      extends: null,
      isDefault: true,
      createdAt: "2026-03-19T10:00:00.000Z",
    }),
  );
});

test("assertEnvironmentSummary accepts summaries without extends", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentSummary({
      id: "env-production",
      project: "marketing-site",
      name: "production",
      isDefault: true,
      createdAt: "2026-03-19T10:00:00.000Z",
    }),
  );
});

test("assertEnvironmentSummary rejects invalid isDefault values", () => {
  assert.throws(
    () =>
      assertEnvironmentSummary({
        id: "env-production",
        project: "marketing-site",
        name: "production",
        extends: null,
        isDefault: "yes",
        createdAt: "2026-03-19T10:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_INPUT" &&
      error.statusCode === 400 &&
      error.message.includes("value.isDefault"),
  );
});

test("assertEnvironmentSummary uses the provided path in error messages", () => {
  assert.throws(
    () => assertEnvironmentSummary(null, "response.data"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_INPUT" &&
      error.message.includes("response.data"),
  );
});

test("assertEnvironmentDefinitionsMeta accepts ready and missing metadata", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentDefinitionsMeta({
      definitionsStatus: "ready",
      configSnapshotHash: "sha256:abc123",
      syncedAt: "2026-03-19T10:00:00.000Z",
    }),
  );

  assert.doesNotThrow(() =>
    assertEnvironmentDefinitionsMeta({
      definitionsStatus: "missing",
    }),
  );
});

test("assertEnvironmentDefinitionsMeta rejects incomplete ready metadata", () => {
  assert.throws(
    () =>
      assertEnvironmentDefinitionsMeta({
        definitionsStatus: "ready",
        syncedAt: "2026-03-19T10:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "INVALID_INPUT" &&
      error.message.includes("value.configSnapshotHash"),
  );
});

test("assertEnvironmentListResponse validates environment rows with readiness metadata", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentListResponse({
      data: [
        {
          id: "env-production",
          project: "marketing-site",
          name: "production",
          extends: null,
          isDefault: true,
          createdAt: "2026-03-19T10:00:00.000Z",
        },
      ],
      meta: {
        definitionsStatus: "ready",
        configSnapshotHash: "sha256:abc123",
        syncedAt: "2026-03-19T10:00:00.000Z",
      },
    }),
  );
});
