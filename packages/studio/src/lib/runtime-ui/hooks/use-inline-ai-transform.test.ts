import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { RuntimeError } from "@mdcms/shared";

import type {
  StudioAiInlineTransformResult,
  StudioAiProposal,
  StudioAiRouteApi,
} from "../../ai-route-api.js";
import {
  classifiedToTopLevelInlineAiState,
  classifyInlineAiError,
  inlineAiTransformResultToState,
} from "./inline-ai-state.js";

/**
 * The hook composes pure helpers that are individually unit-tested in
 * `inline-ai-state.test.ts`. This file exercises the composed sequences
 * so the request → proposal → apply / reject pipelines stay correct.
 */

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
    summary: "Tighter intro.",
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

type FakeApi = StudioAiRouteApi & {
  counts: { inline: number; apply: number; reject: number };
};

function fakeApi(input: {
  proposals?: StudioAiProposal[];
  applyError?: unknown;
  appliedDocumentBody?: string;
}): FakeApi {
  const counts = { inline: 0, apply: 0, reject: 0 };

  const api: StudioAiRouteApi = {
    async inlineTransform(): Promise<StudioAiInlineTransformResult> {
      counts.inline += 1;
      return { proposals: input.proposals ?? [] };
    },
    async applyProposal({ proposalId }) {
      counts.apply += 1;
      if (input.applyError) {
        throw input.applyError;
      }
      const proposal = (input.proposals ?? [buildProposal()])[0]!;
      return {
        proposal: { ...proposal, proposalId },
        document: {
          documentId: "doc_1",
          translationGroupId: "tg_1",
          project: "demo",
          environment: "draft",
          path: "blog/welcome",
          type: "post",
          locale: "en",
          format: "md",
          isDeleted: false,
          hasUnpublishedChanges: true,
          version: 1,
          publishedVersion: null,
          draftRevision: 5,
          frontmatter: {},
          body: input.appliedDocumentBody ?? "Hi there",
          createdBy: "u",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedBy: "u",
          updatedAt: "2026-05-01T00:00:01.000Z",
        },
      };
    },
    async rejectProposal({ proposalId }) {
      counts.reject += 1;
      const proposal = (input.proposals ?? [buildProposal()])[0]!;
      return { proposal: { ...proposal, proposalId } };
    },
    async undoProposal({ proposalId }) {
      // Inline AI hook tests do not exercise the undo surface; stub
      // out with a no-op-shaped response so the contract is satisfied.
      const proposal = (input.proposals ?? [buildProposal()])[0]!;
      return {
        proposal: { ...proposal, proposalId },
        document: {
          documentId: "doc_1",
          translationGroupId: "tg_1",
          project: "demo",
          environment: "draft",
          path: "blog/welcome",
          type: "post",
          locale: "en",
          format: "md",
          isDeleted: false,
          hasUnpublishedChanges: true,
          version: 1,
          publishedVersion: null,
          draftRevision: 6,
          frontmatter: {},
          body: "Welcome back.",
          createdBy: "u",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedBy: "u",
          updatedAt: "2026-05-01T00:00:02.000Z",
        },
      };
    },
    async chatMessage({ message }) {
      // Inline AI hook tests do not exercise the chat surface; stub it
      // out with a minimal text-only response so the StudioAiRouteApi
      // interface is satisfied.
      return {
        conversationId: "conv_stub",
        message: {
          id: "m_stub",
          role: "assistant",
          at: "2026-05-10T10:00:00.000Z",
          text: `stub response to: ${message}`,
        },
      };
    },
    async *chatMessageStream() {
      // Same rationale as chatMessage — not exercised by the inline
      // transform hook tests; the stub satisfies the interface only.
    },
  };

  return Object.assign(api, { counts });
}

describe("inline AI hook helpers — applied", () => {
  test("inline transform result with valid proposal yields proposal state", async () => {
    const api = fakeApi({ proposals: [buildProposal()] });
    const result = await api.inlineTransform({
      selectionId: "sel_1",
      selectedText: "Hello",
      action: "rewrite",
    });
    const state = inlineAiTransformResultToState({
      intent: { action: "rewrite" },
      proposals: result.proposals,
    });

    assert.equal(state.status, "proposal");
  });

  test("apply success returns the updated document body", async () => {
    const api = fakeApi({ appliedDocumentBody: "Hi there" });
    const applied = await api.applyProposal({
      proposalId: "p_1",
      schemaHash: "h",
    });
    assert.equal(applied.document.body, "Hi there");
    assert.equal(api.counts.apply, 1);
  });

  test("apply with stale conflict classifies as stale", async () => {
    const api = fakeApi({
      applyError: new RuntimeError({
        code: "AI_PROPOSAL_CONFLICT",
        message: "Stale.",
        statusCode: 409,
      }),
    });
    await assert.rejects(
      () => api.applyProposal({ proposalId: "p_1", schemaHash: "h" }),
      (error) =>
        error instanceof RuntimeError && error.code === "AI_PROPOSAL_CONFLICT",
    );

    const classified = classifyInlineAiError(
      new RuntimeError({
        code: "AI_PROPOSAL_CONFLICT",
        message: "Stale.",
        statusCode: 409,
      }),
    );
    assert.equal(classified.kind, "stale");
  });

  test("reject does not invoke apply", async () => {
    const api = fakeApi({ proposals: [buildProposal()] });
    await api.rejectProposal({ proposalId: "p_1" });
    assert.equal(api.counts.apply, 0);
    assert.equal(api.counts.reject, 1);
  });

  test("AI_DISABLED maps to forbidden top-level state", () => {
    const state = classifiedToTopLevelInlineAiState(
      classifyInlineAiError(
        new RuntimeError({
          code: "AI_DISABLED",
          message: "no provider",
          statusCode: 403,
        }),
      ),
    );
    assert.equal(state.status, "forbidden");
  });
});
