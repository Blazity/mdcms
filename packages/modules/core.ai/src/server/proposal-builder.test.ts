import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import {
  buildProposalsFromOutput,
  type AiProposalEnvelope,
} from "./proposal-builder.js";

const envelope: AiProposalEnvelope = {
  project: "demo",
  environment: "draft",
  type: "page",
  locale: "en",
  documentId: "doc_1",
  baseDraftRevision: 4,
};

const baseClock = () => new Date("2026-05-01T00:00:00.000Z");

let counter = 0;
const idFactory = () => {
  counter += 1;
  return `prop_${counter}`;
};

const deps = { clock: baseClock, idFactory, ttlMs: 5 * 60 * 1000 };

describe("buildProposalsFromOutput", () => {
  test("builds a replace_selection proposal", async () => {
    counter = 0;
    const [proposal, ...rest] = await buildProposalsFromOutput(
      {
        taskKind: "copy_improvement",
        promptTemplateId: "copy_improvement.v1",
        providerId: "echo",
        model: "echo-1",
        envelope,
        output: {
          summary: "Tightened intro",
          operations: [
            {
              op: "replace_selection",
              selectionId: "sel_1",
              originalText: "old",
              replacementText: "new",
            },
          ],
        },
      },
      deps,
    );

    assert.equal(rest.length, 0);
    assert.equal(proposal.kind, "replace_selection");
    assert.equal(proposal.proposalId, "prop_1");
    assert.equal(proposal.expiresAt, "2026-05-01T00:05:00.000Z");
    assert.equal(proposal.documentId, "doc_1");
    assert.equal(proposal.baseDraftRevision, 4);
    assert.equal(proposal.provider.providerId, "echo");
    assert.equal(proposal.provider.model, "echo-1");
    assert.equal(proposal.provider.promptTemplateId, "copy_improvement.v1");
    assert.deepEqual(proposal.validation, { status: "valid" });
  });

  test("builds a create_document proposal", async () => {
    counter = 0;
    const [proposal] = await buildProposalsFromOutput(
      {
        taskKind: "new_document_draft",
        promptTemplateId: "new_document_draft.v1",
        providerId: "echo",
        model: "echo-1",
        envelope: { ...envelope, documentId: undefined },
        output: {
          summary: "New welcome post",
          operations: [
            {
              op: "create_document",
              path: "blog/welcome.mdx",
              format: "mdx",
              frontmatter: { title: "Welcome" },
              body: "# Hi",
            },
          ],
        },
      },
      deps,
    );

    assert.equal(proposal.kind, "create_document");
    assert.equal(proposal.documentId, undefined);
  });

  test("splits mixed operation kinds into one proposal each", async () => {
    counter = 0;
    const proposals = await buildProposalsFromOutput(
      {
        taskKind: "current_document_edit",
        promptTemplateId: "current_document_edit.v1",
        providerId: "echo",
        model: "echo-1",
        envelope,
        output: {
          summary: "Body and frontmatter changes",
          operations: [
            {
              op: "replace_selection",
              selectionId: "sel_1",
              originalText: "old",
              replacementText: "new",
            },
            {
              op: "update_frontmatter",
              patch: { description: "updated" },
            },
          ],
        },
      },
      deps,
    );

    assert.equal(proposals.length, 2);
    assert.equal(proposals[0]?.kind, "replace_selection");
    assert.equal(proposals[1]?.kind, "update_frontmatter");
    assert.notEqual(proposals[0]?.proposalId, proposals[1]?.proposalId);
  });

  test("throws AI_OUTPUT_INVALID for empty operations", async () => {
    await assert.rejects(
      () =>
        buildProposalsFromOutput(
          {
            taskKind: "copy_improvement",
            promptTemplateId: "copy_improvement.v1",
            providerId: "echo",
            model: "echo-1",
            envelope,
            output: { summary: "x", operations: [] },
          },
          deps,
        ),
      (error) =>
        error instanceof RuntimeError && error.code === "AI_OUTPUT_INVALID",
    );
  });

  test("anchors override the model's selectionId on replace_selection ops", async () => {
    counter = 0;
    const [proposal] = await buildProposalsFromOutput(
      {
        taskKind: "copy_improvement",
        promptTemplateId: "copy_improvement.v1",
        providerId: "echo",
        model: "echo-1",
        envelope,
        output: {
          summary: "Tightened intro",
          operations: [
            {
              op: "replace_selection",
              selectionId: "sel_invented_by_model",
              originalText: "old",
              replacementText: "new",
            },
          ],
        },
        anchors: { selectionId: "sel_trusted" },
      },
      deps,
    );

    assert.equal(
      (proposal.operations[0] as { selectionId: string }).selectionId,
      "sel_trusted",
    );
  });

  test("create_document proposals drop source-document anchors from envelope", async () => {
    counter = 0;
    const [proposal] = await buildProposalsFromOutput(
      {
        taskKind: "new_document_draft",
        promptTemplateId: "new_document_draft.v1",
        providerId: "echo",
        model: "echo-1",
        // envelope still carries source document refs
        envelope: {
          ...envelope,
          documentId: "doc_source",
          baseDraftRevision: 4,
        },
        output: {
          summary: "New post",
          operations: [
            {
              op: "create_document",
              path: "blog/new.mdx",
              format: "mdx",
              frontmatter: {},
              body: "# x",
            },
          ],
        },
      },
      deps,
    );

    assert.equal(proposal.kind, "create_document");
    assert.equal(proposal.documentId, undefined);
    assert.equal(proposal.baseDraftRevision, undefined);
  });

  test("mixed-kind output keeps source anchors only on the non-create_document proposal", async () => {
    counter = 0;
    const proposals = await buildProposalsFromOutput(
      {
        taskKind: "current_document_edit",
        promptTemplateId: "current_document_edit.v1",
        providerId: "echo",
        model: "echo-1",
        envelope: {
          ...envelope,
          documentId: "doc_source",
          baseDraftRevision: 7,
        },
        output: {
          summary: "Mixed",
          operations: [
            {
              op: "replace_selection",
              selectionId: "sel_1",
              originalText: "a",
              replacementText: "b",
            },
            {
              op: "create_document",
              path: "blog/new.mdx",
              format: "mdx",
              frontmatter: {},
              body: "# x",
            },
          ],
        },
      },
      deps,
    );

    const replaceProposal = proposals.find(
      (p) => p.kind === "replace_selection",
    );
    const createProposal = proposals.find((p) => p.kind === "create_document");

    assert.equal(replaceProposal?.documentId, "doc_source");
    assert.equal(replaceProposal?.baseDraftRevision, 7);
    assert.equal(createProposal?.documentId, undefined);
    assert.equal(createProposal?.baseDraftRevision, undefined);
  });

  test("anchors leave non-replace_selection ops untouched", async () => {
    counter = 0;
    const [proposal] = await buildProposalsFromOutput(
      {
        taskKind: "new_document_draft",
        promptTemplateId: "new_document_draft.v1",
        providerId: "echo",
        model: "echo-1",
        envelope: { ...envelope, documentId: undefined },
        output: {
          summary: "draft",
          operations: [
            {
              op: "create_document",
              path: "blog/post.mdx",
              format: "mdx",
              frontmatter: {},
              body: "# x",
            },
          ],
        },
        anchors: { selectionId: "ignored" },
      },
      deps,
    );

    assert.equal(proposal.kind, "create_document");
  });

  test("validator hook replaces validation status", async () => {
    counter = 0;
    const [proposal] = await buildProposalsFromOutput(
      {
        taskKind: "mdx_component_insertion",
        promptTemplateId: "mdx_component_insertion.v1",
        providerId: "echo",
        model: "echo-1",
        envelope,
        output: {
          summary: "Add callout",
          operations: [
            {
              op: "insert_block",
              bodyMdx: "<UnknownComponent>hi</UnknownComponent>",
            },
          ],
        },
      },
      {
        ...deps,
        validator: async (candidate) => {
          assert.equal(candidate.kind, "insert_block");
          return {
            status: "invalid",
            errors: [
              {
                code: "MDX_COMPONENT_UNKNOWN",
                message: "UnknownComponent is not registered.",
              },
            ],
          };
        },
      },
    );

    assert.equal(proposal.validation.status, "invalid");
    if (proposal.validation.status === "invalid") {
      assert.equal(
        proposal.validation.errors[0]?.code,
        "MDX_COMPONENT_UNKNOWN",
      );
    }
  });

  test("validator hook can return valid for trusted operations", async () => {
    counter = 0;
    let calls = 0;
    const [proposal] = await buildProposalsFromOutput(
      {
        taskKind: "copy_improvement",
        promptTemplateId: "copy_improvement.v1",
        providerId: "echo",
        model: "echo-1",
        envelope,
        output: {
          summary: "ok",
          operations: [
            {
              op: "replace_selection",
              selectionId: "sel_1",
              originalText: "a",
              replacementText: "b",
            },
          ],
        },
      },
      {
        ...deps,
        validator: async () => {
          calls += 1;
          return { status: "valid" };
        },
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(proposal.validation, { status: "valid" });
  });
});
