import assert from "node:assert/strict";
import { test } from "bun:test";

import { createTipTapEditorDependencies } from "./tiptap-editor.js";

test("createTipTapEditorDependencies keeps editor lifetime independent of onChange identity", () => {
  const hostBridge = {
    version: "1" as const,
    resolveComponent: () => null,
    renderMdxPreview: () => () => {},
  };

  assert.deepEqual(
    createTipTapEditorDependencies({
      placeholder: "Start writing, or press / for commands...",
      hostBridge,
      readOnly: false,
      forbidden: false,
    }),
    ["Start writing, or press / for commands...", hostBridge, false, false],
  );
});
