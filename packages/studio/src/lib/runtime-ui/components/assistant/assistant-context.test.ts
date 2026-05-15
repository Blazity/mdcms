import assert from "node:assert/strict";
import { test } from "bun:test";

import { relTime, studioProposalFromWire } from "./assistant-context.js";
import { buildAssistantMockStore } from "./assistant-mock-data.js";
import type { StudioAiProposal } from "../../../ai-route-api.js";

test("relTime formats relative timestamps against an explicit now", () => {
  const now = "2026-05-07T10:00:00Z";
  assert.equal(relTime("2026-05-07T09:59:30Z", now), "just now");
  assert.equal(relTime("2026-05-07T09:55:00Z", now), "5m");
  assert.equal(relTime("2026-05-07T07:00:00Z", now), "3h");
  assert.equal(relTime("2026-05-04T10:00:00Z", now), "3d");
});

test("buildAssistantMockStore returns a deterministic seeded store", () => {
  const a = buildAssistantMockStore();
  const b = buildAssistantMockStore();

  assert.equal(a.threads.length, b.threads.length);
  assert.equal(a.activeThreadId, b.activeThreadId);
  assert.deepEqual(
    a.threads.map((t) => t.id),
    b.threads.map((t) => t.id),
  );

  // Mutating one returned store must not affect the other — proves the
  // factory hands out fresh instances rather than a shared singleton.
  delete a.proposals["p-edit-lede"];
  assert.ok(b.proposals["p-edit-lede"]);
});

test("mock store contains every proposal kind referenced by SPEC-014", () => {
  const store = buildAssistantMockStore();
  const kinds = new Set(Object.values(store.proposals).map((p) => p.kind));
  assert.ok(kinds.has("replace_selection"));
  assert.ok(kinds.has("insert_block"));
  assert.ok(kinds.has("create_document"));
  assert.ok(kinds.has("delete_document"));
  assert.ok(kinds.has("update_frontmatter"));
});

// ─────────────────────────────────────────────────────────────────────
// studioProposalFromWire — adapter from wire-level AiProposal to the
// local AssistantProposal discriminated union consumed by the UI.
// ─────────────────────────────────────────────────────────────────────

function buildWireProposal(
  overrides: Partial<StudioAiProposal> = {},
): StudioAiProposal {
  return {
    proposalId: overrides.proposalId ?? "wire_1",
    kind: overrides.kind ?? "replace_selection",
    project: overrides.project ?? "demo",
    environment: overrides.environment ?? "staging",
    documentId: overrides.documentId ?? "doc_1",
    baseDraftRevision: overrides.baseDraftRevision ?? 4,
    type: overrides.type ?? "post",
    locale: overrides.locale ?? "en",
    summary: overrides.summary ?? "Wire summary",
    operations: overrides.operations ?? [
      {
        op: "replace_selection",
        selectionId: "sel_1",
        originalText: "before",
        replacementText: "after",
      },
    ],
    validation: overrides.validation ?? { status: "valid" },
    expiresAt: overrides.expiresAt ?? "2026-05-07T10:05:00.000Z",
    provider: overrides.provider ?? {
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "current_document_edit.v1",
    },
  };
}

test("studioProposalFromWire maps a replace_selection wire proposal", () => {
  const wire = buildWireProposal();
  const studio = studioProposalFromWire(wire);
  assert.ok(studio);
  assert.equal(studio.kind, "replace_selection");
  if (studio.kind === "replace_selection") {
    assert.equal(studio.op.op, "replace_selection");
    assert.equal(studio.op.originalText, "before");
    assert.equal(studio.op.replacementText, "after");
    assert.equal(studio.locale, "en");
    assert.equal(studio.baseDraftRevision, 4);
  }
});

test("studioProposalFromWire maps an insert_block wire proposal", () => {
  const wire = buildWireProposal({
    kind: "insert_block",
    operations: [
      {
        op: "insert_block",
        bodyMdx: "<Callout>Hi</Callout>",
      },
    ],
  });
  const studio = studioProposalFromWire(wire);
  assert.ok(studio);
  assert.equal(studio.kind, "insert_block");
  if (studio.kind === "insert_block") {
    assert.equal(studio.op.bodyMdx, "<Callout>Hi</Callout>");
  }
});

test("studioProposalFromWire maps an update_frontmatter wire proposal", () => {
  const wire = buildWireProposal({
    kind: "update_frontmatter",
    operations: [
      {
        op: "update_frontmatter",
        patch: { description: "new" },
      },
    ],
  });
  const studio = studioProposalFromWire(wire);
  assert.ok(studio);
  assert.equal(studio.kind, "update_frontmatter");
  if (studio.kind === "update_frontmatter") {
    assert.deepEqual(studio.op.patch, { description: "new" });
  }
});

test("studioProposalFromWire maps a create_document wire proposal", () => {
  const wire = buildWireProposal({
    kind: "create_document",
    documentId: undefined,
    baseDraftRevision: undefined,
    operations: [
      {
        op: "create_document",
        path: "blog/new",
        format: "mdx",
        frontmatter: { title: "Hi" },
        body: "Line 1\nLine 2",
      },
    ],
  });
  const studio = studioProposalFromWire(wire);
  assert.ok(studio);
  assert.equal(studio.kind, "create_document");
  if (studio.kind === "create_document") {
    assert.equal(studio.op.path, "blog/new");
    assert.equal(studio.op.format, "mdx");
    assert.equal(studio.op.bodyLines, 2);
  }
});

test("studioProposalFromWire maps a delete_document wire proposal", () => {
  const wire = buildWireProposal({
    kind: "delete_document",
    operations: [
      {
        op: "delete_document",
        path: "blog/stale",
        reason: "obsolete",
      },
    ],
  });
  const studio = studioProposalFromWire(wire);
  assert.ok(studio);
  assert.equal(studio.kind, "delete_document");
  if (studio.kind === "delete_document") {
    assert.equal(studio.op.path, "blog/stale");
    assert.equal(studio.op.reason, "obsolete");
  }
});

test("studioProposalFromWire returns undefined when kind/op mismatch", () => {
  const wire = buildWireProposal({
    kind: "replace_selection",
    operations: [
      {
        op: "create_document",
        path: "x.md",
        format: "md",
        frontmatter: {},
        body: "",
      },
    ],
  });
  const studio = studioProposalFromWire(wire);
  assert.equal(studio, undefined);
});
