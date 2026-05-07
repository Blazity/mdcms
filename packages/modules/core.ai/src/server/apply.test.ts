import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  RuntimeError,
  type AiProposal,
  type ContentDocumentResponse,
} from "@mdcms/shared";

import {
  applyAiProposal,
  type AiApplyContentStore,
  type AiApplyWritePayload,
} from "./apply.js";

function buildDocument(
  overrides: Partial<ContentDocumentResponse> = {},
): ContentDocumentResponse {
  return {
    documentId: "doc_1",
    translationGroupId: "tg_1",
    project: "demo",
    environment: "draft",
    path: "blog/welcome",
    type: "page",
    locale: "en",
    format: "md",
    isDeleted: false,
    hasUnpublishedChanges: true,
    version: 1,
    publishedVersion: null,
    draftRevision: 4,
    frontmatter: { title: "Welcome" },
    body: "Welcome to the site.",
    createdBy: "user_1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedBy: "user_1",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildProposal(overrides: Partial<AiProposal> = {}): AiProposal {
  return {
    proposalId: overrides.proposalId ?? "p_1",
    kind: overrides.kind ?? "replace_selection",
    project: overrides.project ?? "demo",
    environment: overrides.environment ?? "draft",
    documentId: overrides.documentId ?? "doc_1",
    baseDraftRevision: overrides.baseDraftRevision ?? 4,
    type: overrides.type ?? "page",
    locale: overrides.locale ?? "en",
    summary: overrides.summary ?? "Replace the greeting.",
    operations: overrides.operations ?? [
      {
        op: "replace_selection",
        selectionId: "sel_1",
        originalText: "Welcome to the site.",
        replacementText: "Hi there!",
      },
    ],
    validation: overrides.validation ?? { status: "valid" },
    expiresAt: overrides.expiresAt ?? "2026-05-01T00:05:00.000Z",
    provider: overrides.provider ?? {
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "copy_improvement.v1",
    },
  };
}

type StubStoreState = {
  document: ContentDocumentResponse;
  updateCalls: Array<{
    documentId: string;
    payload: AiApplyWritePayload;
    options: { expectedSchemaHash: string; expectedDraftRevision?: number };
  }>;
  createCalls: Array<{
    payload: AiApplyWritePayload;
    options: { expectedSchemaHash: string };
  }>;
};

function createStubStore(state: StubStoreState): AiApplyContentStore {
  return {
    async getById(_scope, documentId) {
      if (documentId !== state.document.documentId) {
        return undefined;
      }
      return state.document;
    },
    async update(_scope, documentId, payload, options) {
      state.updateCalls.push({ documentId, payload, options });
      return {
        ...state.document,
        body: payload.body ?? state.document.body,
        frontmatter: payload.frontmatter ?? state.document.frontmatter,
        draftRevision: state.document.draftRevision + 1,
      };
    },
    async create(_scope, payload, options) {
      state.createCalls.push({ payload, options });
      return {
        ...state.document,
        documentId: "doc_new",
        path: payload.path ?? state.document.path,
        body: payload.body ?? "",
        frontmatter: payload.frontmatter ?? {},
        draftRevision: 0,
        version: 0,
      };
    },
  };
}

describe("applyAiProposal", () => {
  test("replace_selection updates the body through the content store", async () => {
    const state: StubStoreState = {
      document: buildDocument(),
      updateCalls: [],
      createCalls: [],
    };
    const store = createStubStore(state);

    const result = await applyAiProposal({
      proposal: buildProposal(),
      expectedSchemaHash: "hash_1",
      actorId: "user_99",
      store,
    });

    assert.equal(state.updateCalls.length, 1);
    const call = state.updateCalls[0]!;
    assert.equal(call.documentId, "doc_1");
    assert.equal(call.payload.body, "Hi there!");
    assert.equal(call.payload.updatedBy, "user_99");
    assert.equal(call.options.expectedDraftRevision, 4);
    assert.equal(call.options.expectedSchemaHash, "hash_1");
    assert.equal(result.body, "Hi there!");
  });

  test("conflict when original selection text is missing in body", async () => {
    const state: StubStoreState = {
      document: buildDocument({ body: "Different body content." }),
      updateCalls: [],
      createCalls: [],
    };
    const store = createStubStore(state);

    await assert.rejects(
      () =>
        applyAiProposal({
          proposal: buildProposal(),
          expectedSchemaHash: "hash_1",
          actorId: "user_99",
          store,
        }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "AI_PROPOSAL_CONFLICT" &&
        error.statusCode === 409,
    );
    assert.equal(state.updateCalls.length, 0);
  });

  test("base draft revision mismatch is reported as conflict", async () => {
    const state: StubStoreState = {
      document: buildDocument({ draftRevision: 6 }),
      updateCalls: [],
      createCalls: [],
    };
    const store = createStubStore(state);

    await assert.rejects(
      () =>
        applyAiProposal({
          proposal: buildProposal({ baseDraftRevision: 4 }),
          expectedSchemaHash: "hash_1",
          actorId: "user_99",
          store,
        }),
      (error) =>
        error instanceof RuntimeError && error.code === "AI_PROPOSAL_CONFLICT",
    );
    assert.equal(state.updateCalls.length, 0);
  });

  test("update_frontmatter merges patch", async () => {
    const state: StubStoreState = {
      document: buildDocument({
        frontmatter: { title: "Welcome", description: "Old" },
      }),
      updateCalls: [],
      createCalls: [],
    };
    const store = createStubStore(state);

    await applyAiProposal({
      proposal: buildProposal({
        kind: "update_frontmatter",
        operations: [
          {
            op: "update_frontmatter",
            patch: { description: "New description" },
          },
        ],
      }),
      expectedSchemaHash: "hash_1",
      actorId: "user_42",
      store,
    });

    const call = state.updateCalls[0]!;
    assert.deepEqual(call.payload.frontmatter, {
      title: "Welcome",
      description: "New description",
    });
  });

  test("create_document calls store.create instead of update", async () => {
    const state: StubStoreState = {
      document: buildDocument(),
      updateCalls: [],
      createCalls: [],
    };
    const store = createStubStore(state);

    await applyAiProposal({
      proposal: buildProposal({
        proposalId: "p_2",
        kind: "create_document",
        documentId: undefined,
        baseDraftRevision: undefined,
        operations: [
          {
            op: "create_document",
            path: "blog/new-post",
            format: "mdx",
            frontmatter: { title: "New" },
            body: "Body of the new post.",
          },
        ],
      }),
      expectedSchemaHash: "hash_2",
      actorId: "user_42",
      store,
    });

    assert.equal(state.updateCalls.length, 0);
    assert.equal(state.createCalls.length, 1);
    const call = state.createCalls[0]!;
    assert.equal(call.payload.path, "blog/new-post");
    assert.equal(call.payload.body, "Body of the new post.");
    assert.deepEqual(call.payload.frontmatter, { title: "New" });
    assert.equal(call.options.expectedSchemaHash, "hash_2");
  });
});
