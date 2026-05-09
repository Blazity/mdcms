import assert from "node:assert/strict";
import { test } from "bun:test";

import { relTime } from "./assistant-context.js";
import { buildAssistantMockStore } from "./assistant-mock-data.js";
import { respondToUserMessage } from "./assistant-stub-orchestrator.js";
import type { AssistantMessage, AssistantThread } from "./assistant-types.js";

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
  assert.ok(kinds.has("batch"));
});

function makeUserMessage(text: string, id = "m-test"): AssistantMessage {
  return {
    id,
    role: "user",
    at: "2026-05-09T10:00:00Z",
    text,
  };
}

function makeThread(): AssistantThread {
  const store = buildAssistantMockStore();
  return store.threads[0]!;
}

test("stub orchestrator routes 'delete' prompts to a delete_document proposal", () => {
  const result = respondToUserMessage({
    thread: makeThread(),
    userMessage: makeUserMessage("Please delete the legacy 2024 status post"),
  });

  assert.equal(result.newProposals.length, 1);
  assert.equal(result.newProposals[0]!.kind, "delete_document");
  assert.equal(result.assistantMessage.role, "assistant");
  assert.deepEqual(result.assistantMessage.proposals, [
    result.newProposals[0]!.proposalId,
  ]);
});

test("stub orchestrator routes 'create' prompts to a create_document proposal", () => {
  const result = respondToUserMessage({
    thread: makeThread(),
    userMessage: makeUserMessage(
      "Create a new draft summarizing yesterday's launch",
    ),
  });
  assert.equal(result.newProposals[0]!.kind, "create_document");
});

test("stub orchestrator routes 'batch' prompts to a batch proposal", () => {
  const result = respondToUserMessage({
    thread: makeThread(),
    userMessage: makeUserMessage(
      "Apply this rewrite as a batch across all pl drafts",
    ),
  });
  assert.equal(result.newProposals[0]!.kind, "batch");
});

test("stub orchestrator falls back to replace_selection for generic prompts", () => {
  const result = respondToUserMessage({
    thread: makeThread(),
    userMessage: makeUserMessage("Tighten the lede"),
  });
  assert.equal(result.newProposals[0]!.kind, "replace_selection");
});

test("stub orchestrator returns an explanatory turn for empty prompts", () => {
  const result = respondToUserMessage({
    thread: makeThread(),
    userMessage: makeUserMessage("   "),
  });
  assert.equal(result.newProposals.length, 0);
  assert.match(result.assistantMessage.text ?? "", /didn't catch/);
});
