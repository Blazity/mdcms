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
  test("builds a replace_selection proposal", () => {
    counter = 0;
    const [proposal, ...rest] = buildProposalsFromOutput(
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

  test("builds a create_document proposal", () => {
    counter = 0;
    const [proposal] = buildProposalsFromOutput(
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

  test("splits mixed operation kinds into one proposal each", () => {
    counter = 0;
    const proposals = buildProposalsFromOutput(
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

  test("throws AI_OUTPUT_INVALID for empty operations", () => {
    assert.throws(
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

  test("anchors override the model's selectionId on replace_selection ops", () => {
    counter = 0;
    const [proposal] = buildProposalsFromOutput(
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

  test("anchors leave non-replace_selection ops untouched", () => {
    counter = 0;
    const [proposal] = buildProposalsFromOutput(
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

  test("validator hook replaces validation status", () => {
    counter = 0;
    const [proposal] = buildProposalsFromOutput(
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
        validator: (candidate) => {
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

  test("validator hook can return valid for trusted operations", () => {
    counter = 0;
    let calls = 0;
    const [proposal] = buildProposalsFromOutput(
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
        validator: () => {
          calls += 1;
          return { status: "valid" };
        },
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(proposal.validation, { status: "valid" });
  });
});
