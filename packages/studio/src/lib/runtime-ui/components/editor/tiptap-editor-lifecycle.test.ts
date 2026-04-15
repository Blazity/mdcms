import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  createTipTapEditorDependencies,
  resolveSlashPickerCoordsForEditor,
} from "./tiptap-editor.js";

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

test("resolveSlashPickerCoordsForEditor returns null while the editor view is remounting", () => {
  const trigger = {
    query: "PricingTable",
    from: 12,
    to: 25,
  };
  const container = {
    getBoundingClientRect: () => ({
      top: 32,
      left: 24,
    }),
  };

  assert.equal(
    resolveSlashPickerCoordsForEditor({
      editor: {
        get view() {
          throw new Error(
            "[tiptap error]: The editor view is not available. Cannot access view['coordsAtPos']. The editor may not be mounted yet.",
          );
        },
      } as never,
      trigger,
      container,
    }),
    null,
  );
});
