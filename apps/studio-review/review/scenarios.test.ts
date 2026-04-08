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
