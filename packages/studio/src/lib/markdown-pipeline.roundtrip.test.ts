import assert from "node:assert/strict";
import { test } from "bun:test";

import type { Editor } from "@tiptap/core";
import { TextSelection, type EditorState } from "@tiptap/pm/state";

import { createDocumentEditor } from "./document-editor.js";
import {
  parseMarkdownToDocument,
  serializeDocumentToMarkdown,
} from "./markdown-pipeline.js";

// Headless TipTap editors omit ProseMirror plugins from the default
// `editor.state`. Reconfigure the state with the extension manager's plugins
// so `filterTransaction`/`appendTransaction` hooks run in tests.
function activeState(editor: Editor): EditorState {
  return editor.state.reconfigure({
    plugins: editor.extensionManager.plugins,
  });
}

function firstParagraphEnd(state: EditorState): number {
  let pos = -1;
  state.doc.descendants((node, nodePos) => {
    if (pos >= 0) return false;
    if (node.type.name === "paragraph") {
      pos = nodePos + node.nodeSize - 1;
      return false;
    }
    return true;
  });
  return pos;
}

function countTrailingHardBreaks(docJson: unknown): number {
  const json = docJson as {
    content?: Array<{
      type: string;
      content?: Array<{ type: string }>;
    }>;
  };
  let count = 0;
  for (const block of json.content ?? []) {
    if (block.type !== "paragraph") continue;
    const inline = block.content ?? [];
    for (let i = inline.length - 1; i >= 0; i -= 1) {
      if (inline[i].type === "hardBreak") {
        count += 1;
      } else {
        break;
      }
    }
  }
  return count;
}

test("the editor normalizes a trailing hardBreak out of the paragraph so the markdown round-trips cleanly", () => {
  const editor = createDocumentEditor({ content: "line 1\n\nline 2" });

  try {
    const state = activeState(editor);
    const paraEnd = firstParagraphEnd(state);
    const atEnd = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, paraEnd)),
    );

    // Dispatch the hardBreak insertion the same way Shift+Enter would.
    const insertion = atEnd.tr.replaceSelectionWith(
      state.schema.nodes.hardBreak.create(),
    );
    const { state: after } = atEnd.applyTransaction(insertion);

    assert.equal(
      countTrailingHardBreaks(after.doc.toJSON()),
      0,
      "the normalizer must trim the trailing hardBreak",
    );

    const markdown = serializeDocumentToMarkdown(after.doc.toJSON());
    const reparsed = parseMarkdownToDocument(markdown);
    const roundTrip = serializeDocumentToMarkdown(reparsed);
    assert.equal(roundTrip, markdown);
  } finally {
    editor.destroy();
  }
});

test("repeated trailing hardBreaks all get stripped (shift+enter spam)", () => {
  const editor = createDocumentEditor({ content: "line 1\n\nline 2" });

  try {
    let state = activeState(editor);
    const paraEnd = firstParagraphEnd(state);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, paraEnd)),
    );

    for (let i = 0; i < 3; i += 1) {
      const tr = state.tr.replaceSelectionWith(
        state.schema.nodes.hardBreak.create(),
      );
      const result = state.applyTransaction(tr);
      state = result.state;
    }

    assert.equal(countTrailingHardBreaks(state.doc.toJSON()), 0);
  } finally {
    editor.destroy();
  }
});

test("mid-paragraph hardBreak is preserved by round-trip", () => {
  const markdown = "line 1  \nline 2";
  const doc = parseMarkdownToDocument(markdown);
  const serialized = serializeDocumentToMarkdown(doc);
  const reparsed = parseMarkdownToDocument(serialized);

  const firstParagraph = (
    reparsed as {
      content: Array<{
        type: string;
        content?: Array<{ type: string }>;
      }>;
    }
  ).content[0];
  const hardBreaks = (firstParagraph.content ?? []).filter(
    (c) => c.type === "hardBreak",
  );
  assert.equal(hardBreaks.length, 1);
});
