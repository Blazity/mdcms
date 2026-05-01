import assert from "node:assert/strict";
import { test } from "bun:test";

import { RuntimeError } from "../runtime/error.js";
import {
  AI_PROPOSAL_KINDS,
  aiProposalOperationSchema,
  aiProposalSchema,
  aiProposalValidationSchema,
  assertAiProposal,
  isAiProposal,
  type AiProposal,
} from "./ai.js";

const baseProvider = {
  providerId: "echo",
  model: "echo-1",
  promptTemplateId: "copy_improvement",
};

const validProposal: AiProposal = {
  proposalId: "p_1",
  kind: "replace_selection",
  project: "demo",
  environment: "draft",
  documentId: "doc_1",
  baseDraftRevision: 4,
  type: "page",
  locale: "en",
  summary: "Tighten the intro",
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
  provider: baseProvider,
};

test("aiProposalSchema accepts a fully populated proposal", () => {
  const parsed = aiProposalSchema.safeParse(validProposal);
  assert.equal(parsed.success, true);
});

test("aiProposalSchema accepts an insert_block proposal without afterSelectionId", () => {
  const parsed = aiProposalSchema.safeParse({
    ...validProposal,
    kind: "insert_block",
    operations: [{ op: "insert_block", bodyMdx: "<Callout>Hi</Callout>" }],
  });
  assert.equal(parsed.success, true);
});

test("aiProposalSchema accepts a create_document proposal", () => {
  const parsed = aiProposalSchema.safeParse({
    ...validProposal,
    kind: "create_document",
    operations: [
      {
        op: "create_document",
        path: "blog/new-post.mdx",
        format: "mdx",
        frontmatter: { title: "New" },
        body: "# Hello",
      },
    ],
  });
  assert.equal(parsed.success, true);
});

test("aiProposalSchema rejects proposals with unknown kind", () => {
  const parsed = aiProposalSchema.safeParse({
    ...validProposal,
    kind: "rewrite_everything",
  });
  assert.equal(parsed.success, false);
});

test("aiProposalSchema rejects proposals with empty operations", () => {
  const parsed = aiProposalSchema.safeParse({
    ...validProposal,
    operations: [],
  });
  assert.equal(parsed.success, false);
});

test("aiProposalSchema rejects proposals with non-ISO expiresAt", () => {
  const parsed = aiProposalSchema.safeParse({
    ...validProposal,
    expiresAt: "yesterday",
  });
  assert.equal(parsed.success, false);
});

test("aiProposalSchema rejects proposals missing provider metadata", () => {
  const { provider: _provider, ...rest } = validProposal;
  const parsed = aiProposalSchema.safeParse(rest);
  assert.equal(parsed.success, false);
});

test("aiProposalSchema rejects unknown top-level keys", () => {
  const parsed = aiProposalSchema.safeParse({ ...validProposal, extra: true });
  assert.equal(parsed.success, false);
});

test("AI_PROPOSAL_KINDS exposes all four spec proposal kinds", () => {
  assert.deepEqual([...AI_PROPOSAL_KINDS].sort(), [
    "create_document",
    "insert_block",
    "replace_selection",
    "update_frontmatter",
  ]);
});

test("aiProposalOperationSchema accepts a replace_selection operation", () => {
  const parsed = aiProposalOperationSchema.safeParse({
    op: "replace_selection",
    selectionId: "sel_1",
    originalText: "",
    replacementText: "Hi",
  });
  assert.equal(parsed.success, true);
});

test("aiProposalOperationSchema rejects insert_block operations with empty body", () => {
  const parsed = aiProposalOperationSchema.safeParse({
    op: "insert_block",
    bodyMdx: "",
  });
  assert.equal(parsed.success, false);
});

test("aiProposalValidationSchema accepts a valid status", () => {
  assert.equal(
    aiProposalValidationSchema.safeParse({ status: "valid" }).success,
    true,
  );
});

test("aiProposalValidationSchema rejects invalid status with empty error list", () => {
  assert.equal(
    aiProposalValidationSchema.safeParse({ status: "invalid", errors: [] })
      .success,
    false,
  );
});

test("aiProposalValidationSchema accepts invalid status with error entries", () => {
  assert.equal(
    aiProposalValidationSchema.safeParse({
      status: "invalid",
      errors: [{ code: "X", message: "boom" }],
    }).success,
    true,
  );
});

test("assertAiProposal returns when value matches", () => {
  assertAiProposal(validProposal);
});

test("assertAiProposal throws AI_OUTPUT_INVALID for malformed value", () => {
  assert.throws(
    () =>
      assertAiProposal({
        ...validProposal,
        operations: [{ op: "replace_selection", selectionId: "" }],
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "AI_OUTPUT_INVALID" &&
      error.statusCode === 422,
  );
});

test("assertAiProposal carries issue path in details", () => {
  try {
    assertAiProposal({ ...validProposal, expiresAt: "soon" });
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(error instanceof RuntimeError);
    assert.equal((error as RuntimeError).code, "AI_OUTPUT_INVALID");
    assert.equal(typeof (error as RuntimeError).details?.path, "string");
  }
});

test("isAiProposal returns true for valid proposal", () => {
  assert.equal(isAiProposal(validProposal), true);
});

test("isAiProposal returns false for malformed proposal", () => {
  assert.equal(isAiProposal({}), false);
});
