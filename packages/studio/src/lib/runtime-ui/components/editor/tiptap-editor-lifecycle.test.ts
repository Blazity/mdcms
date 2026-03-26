import assert from "node:assert/strict";
import { test } from "node:test";

import { createTipTapEditorDependencies } from "./tiptap-editor.js";

test("createTipTapEditorDependencies keeps editor lifetime independent of onChange identity", () => {
  assert.deepEqual(
    createTipTapEditorDependencies("Start writing, or press / for commands..."),
    ["Start writing, or press / for commands..."],
  );
});
