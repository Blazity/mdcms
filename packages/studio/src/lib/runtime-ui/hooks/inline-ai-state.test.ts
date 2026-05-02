import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import type { StudioAiProposal } from "../../ai-route-api.js";
import {
  classifiedToTopLevelInlineAiState,
  classifyInlineAiError,
  inlineAiTransformResultToState,
  intentForAction,
  selectionRequiredForAction,
} from "./inline-ai-state.js";

function buildProposal(
  overrides: Partial<StudioAiProposal> = {},
): StudioAiProposal {
  return {
    proposalId: "p_1",
    kind: "replace_selection",
    project: "demo",
    environment: "draft",
    documentId: "doc_1",
    baseDraftRevision: 4,
    type: "post",
    locale: "en",
    summary: "Tighter.",
    operations: [
      {
        op: "replace_selection",
        selectionId: "sel_1",
        originalText: "Hello",
        replacementText: "Hi",
      },
    ],
    validation: { status: "valid" },
    expiresAt: "2026-05-01T00:05:00.000Z",
    provider: {
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "copy_improvement.v1",
    },
    ...overrides,
  };
}

describe("inlineAiTransformResultToState", () => {
  test("empty proposals → empty state with intent retained", () => {
    const state = inlineAiTransformResultToState({
      intent: { action: "rewrite" },
      proposals: [],
    });

    assert.equal(state.status, "empty");
    if (state.status === "empty") {
      assert.equal(state.intent.action, "rewrite");
    }
  });

  test("valid proposal → proposal state", () => {
    const state = inlineAiTransformResultToState({
      intent: { action: "rewrite" },
      proposals: [buildProposal()],
    });

    assert.equal(state.status, "proposal");
  });

  test("invalid proposal → validation_invalid state", () => {
    const state = inlineAiTransformResultToState({
      intent: { action: "rewrite" },
      proposals: [
        buildProposal({
          validation: {
            status: "invalid",
            errors: [{ code: "MDX_UNKNOWN_COMPONENT", message: "Unknown" }],
          },
        }),
      ],
    });

    assert.equal(state.status, "validation_invalid");
  });
});

describe("classifyInlineAiError", () => {
  test("AI_DISABLED maps to forbidden", () => {
    const classified = classifyInlineAiError(
      new RuntimeError({
        code: "AI_DISABLED",
        message: "no provider",
        statusCode: 403,
      }),
    );
    assert.equal(classified.kind, "forbidden");
  });

  test("AI_PROPOSAL_EXPIRED maps to stale", () => {
    const classified = classifyInlineAiError(
      new RuntimeError({
        code: "AI_PROPOSAL_EXPIRED",
        message: "expired",
        statusCode: 410,
      }),
    );
    assert.equal(classified.kind, "stale");
  });

  test("FORBIDDEN maps to forbidden", () => {
    const classified = classifyInlineAiError(
      new RuntimeError({
        code: "FORBIDDEN",
        message: "no scope",
        statusCode: 403,
      }),
    );
    assert.equal(classified.kind, "forbidden");
  });

  test("non-runtime errors map to error with AI_REQUEST_FAILED", () => {
    const classified = classifyInlineAiError(new Error("network down"));
    assert.equal(classified.kind, "error");
    if (classified.kind === "error") {
      assert.equal(classified.code, "AI_REQUEST_FAILED");
      assert.equal(classified.message, "network down");
    }
  });
});

describe("classifiedToTopLevelInlineAiState", () => {
  test("stale becomes top-level error with AI_PROPOSAL_CONFLICT", () => {
    const state = classifiedToTopLevelInlineAiState({
      kind: "stale",
      message: "stale",
    });
    assert.equal(state.status, "error");
    if (state.status === "error") {
      assert.equal(state.code, "AI_PROPOSAL_CONFLICT");
    }
  });

  test("forbidden becomes top-level forbidden", () => {
    const state = classifiedToTopLevelInlineAiState({
      kind: "forbidden",
      message: "no",
    });
    assert.equal(state.status, "forbidden");
  });
});

describe("selectionRequiredForAction", () => {
  test("requires selection for inline transforms", () => {
    assert.equal(selectionRequiredForAction("rewrite"), true);
    assert.equal(selectionRequiredForAction("change_tone"), true);
  });

  test("does not require selection for SEO/MDX insertion", () => {
    assert.equal(selectionRequiredForAction("improve_seo"), false);
    assert.equal(selectionRequiredForAction("insert_mdx_component"), false);
  });
});

describe("intentForAction", () => {
  test("change_tone packs detail as tone", () => {
    const intent = intentForAction("change_tone", "friendly");
    assert.equal(intent.tone, "friendly");
  });

  test("improve_seo packs detail as keyword", () => {
    const intent = intentForAction("improve_seo", "headless cms");
    assert.equal(intent.keyword, "headless cms");
  });

  test("insert_mdx_component packs detail as componentIntent", () => {
    const intent = intentForAction("insert_mdx_component", "callout");
    assert.equal(intent.componentIntent, "callout");
  });

  test("plain rewrite has no extra fields", () => {
    const intent = intentForAction("rewrite", "ignored");
    assert.deepEqual(intent, { action: "rewrite" });
  });
});
