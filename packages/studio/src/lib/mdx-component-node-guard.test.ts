import assert from "node:assert/strict";
import { test } from "bun:test";

import type { Editor } from "@tiptap/core";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";

import { createDocumentEditor } from "./document-editor.js";
import { serializeDocumentToMarkdown } from "./markdown-pipeline.js";

// Headless TipTap editors omit ProseMirror plugins from the default `editor.state`
// until a view is mounted, but the extension manager still knows which plugins to
// install. Reconfiguring the state with those plugins lets us exercise
// `filterTransaction`/`handleTextInput` hooks without a DOM.
function createActiveState(editor: Editor): EditorState {
  return editor.state.reconfigure({
    plugins: editor.extensionManager.plugins,
  });
}

function findMdxComponentPos(state: EditorState): number {
  let pos = -1;
  state.doc.descendants((node, nodePos) => {
    if (node.type.name === "mdxComponent") {
      pos = nodePos;
      return false;
    }
    return true;
  });
  return pos;
}

function selectMdxComponent(state: EditorState): EditorState {
  const pos = findMdxComponentPos(state);
  assert.equal(pos >= 0, true);
  return state.apply(
    state.tr.setSelection(NodeSelection.create(state.doc, pos)),
  );
}

test("text input that would replace a node-selected void MDX component is blocked", () => {
  const editor = createDocumentEditor({ content: '<Chart title="A" />' });

  try {
    const selected = selectMdxComponent(createActiveState(editor));
    const { from, to } = selected.selection;

    const { state: after } = selected.applyTransaction(
      selected.tr.insertText("x", from, to),
    );

    assert.match(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart title="A" \/>/,
    );
  } finally {
    editor.destroy();
  }
});

test("text input that would replace a node-selected wrapper MDX component is blocked and nested content survives", () => {
  const editor = createDocumentEditor({
    content: ['<Callout type="warning">', "Body", "</Callout>"].join("\n"),
  });

  try {
    const selected = selectMdxComponent(createActiveState(editor));
    const { from, to } = selected.selection;

    const { state: after } = selected.applyTransaction(
      selected.tr.insertText("x", from, to),
    );

    const markdown = serializeDocumentToMarkdown(after.doc.toJSON());
    assert.match(markdown, /<Callout type="warning">/);
    assert.match(markdown, /Body/);
    assert.match(markdown, /<\/Callout>/);
  } finally {
    editor.destroy();
  }
});

test("deleting a node-selected MDX component via an empty-slice replace is still allowed", () => {
  const editor = createDocumentEditor({ content: '<Chart title="A" />' });

  try {
    const selected = selectMdxComponent(createActiveState(editor));
    const { from, to } = selected.selection;

    // Backspace/Delete on a NodeSelection produces a ReplaceStep with an empty
    // slice. The guard must not block legitimate deletion of the node.
    const { state: after } = selected.applyTransaction(
      selected.tr.deleteRange(from, to),
    );

    assert.doesNotMatch(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart/,
    );
  } finally {
    editor.destroy();
  }
});

test("updating props on a node-selected MDX component via setNodeMarkup is still allowed", () => {
  const editor = createDocumentEditor({ content: '<Chart title="A" />' });

  try {
    const selected = selectMdxComponent(createActiveState(editor));
    const pos = findMdxComponentPos(selected);

    // setNodeMarkup uses an AttrStep, not a ReplaceStep, so the guard should
    // let it through.
    const { state: after } = selected.applyTransaction(
      selected.tr.setNodeMarkup(pos, undefined, {
        componentName: "Chart",
        props: { title: "B" },
        isVoid: true,
      }),
    );

    assert.match(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart title="B" \/>/,
    );
  } finally {
    editor.destroy();
  }
});
