import assert from "node:assert/strict";
import { test } from "bun:test";

import { createStudioLowlight } from "./editor-extensions.js";

test("createStudioLowlight disables auto-detection on untagged fences", () => {
  const lowlight = createStudioLowlight();
  const tree = lowlight.highlightAuto("const value = 42;\nconst greet = 'hi';");

  assert.equal(tree.type, "root");
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0]?.type, "text");
  assert.equal(
    (tree.children[0] as { value?: string }).value,
    "const value = 42;\nconst greet = 'hi';",
  );
});

test("createStudioLowlight still highlights when a known language is requested", () => {
  const lowlight = createStudioLowlight();
  const tree = lowlight.highlight("typescript", "const x = 1;");

  assert.equal(tree.type, "root");
  assert.ok(tree.children.length > 0);
  const hasKeywordSpan = JSON.stringify(tree.children).includes("hljs-keyword");
  assert.ok(
    hasKeywordSpan,
    "expected at least one hljs-* token span when a language is set",
  );
});
