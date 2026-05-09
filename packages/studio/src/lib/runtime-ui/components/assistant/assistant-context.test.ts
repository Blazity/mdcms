import assert from "node:assert/strict";
import { test } from "bun:test";

import { relTime } from "./assistant-context.js";
import { buildAssistantMockStore } from "./assistant-mock-data.js";

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
