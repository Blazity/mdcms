import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import type { AiProposal } from "@mdcms/shared";

import { buildAuditRecord } from "./audit.js";

const occurredAt = new Date("2026-05-01T00:00:00.000Z");

const proposal: AiProposal = {
  proposalId: "p_1",
  kind: "replace_selection",
  project: "demo",
  environment: "draft",
  type: "page",
  locale: "en",
  summary: "ok",
  operations: [
    {
      op: "replace_selection",
      selectionId: "sel_1",
      originalText: "old",
      replacementText: "new",
    },
  ],
  validation: { status: "valid" },
  expiresAt: "2026-05-01T00:05:00.000Z",
  provider: {
    providerId: "echo",
    model: "echo-1",
    promptTemplateId: "copy_improvement.v1",
  },
};

describe("buildAuditRecord", () => {
  test("captures success case with proposal ids and usage", () => {
    const record = buildAuditRecord({
      taskKind: "copy_improvement",
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "copy_improvement.v1",
      occurredAt,
      outcome: "succeeded",
      validation: { status: "valid" },
      proposals: [proposal],
      usage: { promptTokens: 12, completionTokens: 7, costUsd: 0.0001 },
    });

    assert.equal(record.outcome, "succeeded");
    assert.equal(record.providerId, "echo");
    assert.equal(record.model, "echo-1");
    assert.equal(record.promptTemplateId, "copy_improvement.v1");
    assert.deepEqual(record.proposalIds, ["p_1"]);
    assert.deepEqual(record.usage, {
      promptTokens: 12,
      completionTokens: 7,
      costUsd: 0.0001,
    });
    assert.equal(record.occurredAt, "2026-05-01T00:00:00.000Z");
  });

  test("captures provider_error case with error code and message", () => {
    const record = buildAuditRecord({
      taskKind: "copy_improvement",
      providerId: "null",
      promptTemplateId: "copy_improvement.v1",
      occurredAt,
      outcome: "provider_error",
      errorCode: "AI_DISABLED",
      errorMessage: "AI provider is not configured for this deployment.",
    });

    assert.equal(record.outcome, "provider_error");
    assert.equal(record.errorCode, "AI_DISABLED");
    assert.equal(record.providerId, "null");
    assert.equal(record.model, "");
    assert.equal(record.proposalIds, undefined);
  });

  test("drops empty usage objects", () => {
    const record = buildAuditRecord({
      taskKind: "copy_improvement",
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "copy_improvement.v1",
      occurredAt,
      outcome: "succeeded",
      proposals: [proposal],
      usage: {},
    });

    assert.equal(record.usage, undefined);
  });

  test("captures invalid_output case with validation errors", () => {
    const record = buildAuditRecord({
      taskKind: "seo_improvement",
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "seo_improvement.v1",
      occurredAt,
      outcome: "invalid_output",
      validation: {
        status: "invalid",
        errors: [{ code: "AI_OUTPUT_INVALID", message: "bad shape" }],
      },
      errorCode: "AI_OUTPUT_INVALID",
      errorMessage: "bad shape",
    });

    assert.equal(record.outcome, "invalid_output");
    assert.equal(record.validation.status, "invalid");
  });
});
