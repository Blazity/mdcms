import assert from "node:assert/strict";
import { test } from "node:test";

import { getReviewScenario } from "./scenarios";

test("review scenarios expose deterministic capability sets", () => {
  const owner = getReviewScenario("owner");
  const editor = getReviewScenario("editor");

  assert.equal(owner.capabilities.settings.manage, true);
  assert.equal(editor.capabilities.settings.manage, false);
  assert.equal(editor.document.documentId.length > 0, true);
});

test("review owner scenario exposes staging-only editor fields in the schema fixture", () => {
  const owner = getReviewScenario("owner");
  const postSchema = owner.schema.entries.find(
    (entry) => entry.type === "post",
  );

  assert.ok(postSchema, "expected post schema entry");
  assert.deepEqual(Object.keys(postSchema.resolvedSchema.fields).sort(), [
    "featured",
    "slug",
    "title",
  ]);
});

test("review scenarios keep Callout markdown aligned with the prepared MDX prop contract", () => {
  const owner = getReviewScenario("owner");

  assert.match(owner.document.body, /<Callout tone="info">/);
  assert.doesNotMatch(owner.document.body, /<Callout type="info">/);
  assert.match(owner.versions[1]!.body, /<Callout tone="info">/);
  assert.doesNotMatch(owner.versions[1]!.body, /<Callout type="info">/);
});
