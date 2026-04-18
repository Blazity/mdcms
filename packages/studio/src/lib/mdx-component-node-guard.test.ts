import assert from "node:assert/strict";
import { test } from "bun:test";

import type { Editor } from "@tiptap/core";
import {
  NodeSelection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";

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

test("typing over a Cmd+A-style text selection that spans an MDX component is blocked", () => {
  const editor = createDocumentEditor({
    content: [
      "Before paragraph",
      "",
      '<Chart title="A" />',
      "",
      "After paragraph",
    ].join("\n"),
  });

  try {
    const state = createActiveState(editor);
    const spanning = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, 0, state.doc.content.size),
      ),
    );

    // Cmd+A then typing a character dispatches a ReplaceStep that covers the
    // entire document, including the Chart node.
    const { state: after } = spanning.applyTransaction(
      spanning.tr.insertText("WIPED", 0, spanning.doc.content.size),
    );

    assert.match(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart title="A" \/>/,
    );
  } finally {
    editor.destroy();
  }
});

test("programmatic setContent is trusted and can replace a doc that contained an MDX component", () => {
  const editor = createDocumentEditor({
    content: '<Chart title="A" />',
  });

  try {
    // `setContent` marks its transaction with `preventUpdate`, which the
    // guard treats as a trust signal so document switching / version
    // restoration still works even when the previous doc had MDX blocks.
    const succeeded = editor.commands.setContent(
      "Just a plain paragraph.\n\nAnd another one.",
      { contentType: "markdown" },
    );

    assert.equal(succeeded, true);
    assert.doesNotMatch(
      serializeDocumentToMarkdown(editor.getJSON()),
      /<Chart/,
    );
    assert.match(
      serializeDocumentToMarkdown(editor.getJSON()),
      /Just a plain paragraph/,
    );
  } finally {
    editor.destroy();
  }
});

test("Cmd+A followed by Delete clears the document even when an MDX component is present", () => {
  const editor = createDocumentEditor({
    content: [
      "First paragraph",
      "",
      '<Chart title="A" />',
      "",
      "Last paragraph",
    ].join("\n"),
  });

  try {
    const state = createActiveState(editor);
    const spanning = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, 0, state.doc.content.size),
      ),
    );

    const { state: after } = spanning.applyTransaction(
      spanning.tr.deleteSelection(),
    );

    // The Chart must be gone, and the document left with a single empty
    // paragraph — exactly what every rich-text editor does for "clear all".
    assert.doesNotMatch(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart/,
    );
    assert.equal(after.doc.textContent, "");
  } finally {
    editor.destroy();
  }
});

test("a transaction that inserts content inside a void MDX component is rejected", () => {
  const editor = createDocumentEditor({
    content: '<Chart title="A" />',
  });

  try {
    const state = createActiveState(editor);
    const chartPos = findMdxComponentPos(state);
    // Position immediately inside the void chart's (hidden) content hole.
    const insertionPoint = chartPos + 1;

    const { state: after } = state.applyTransaction(
      state.tr.insertText("ds", insertionPoint, insertionPoint),
    );

    // The void chart node must still be void (no children in its content).
    after.doc.descendants((node) => {
      if (node.type.name === "mdxComponent" && node.attrs.isVoid === true) {
        assert.equal(node.content.size, 0);
        return false;
      }
      return true;
    });
    // Sanity check: the Chart didn't disappear either.
    assert.match(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart title="A" \/>/,
    );
  } finally {
    editor.destroy();
  }
});

test("pasting non-MDX content over a text selection that spans an MDX component is blocked", () => {
  const editor = createDocumentEditor({
    content: [
      "Before paragraph",
      "",
      '<Chart title="A" />',
      "",
      "After paragraph",
    ].join("\n"),
  });

  try {
    const state = createActiveState(editor);
    const spanning = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, 0, state.doc.content.size),
      ),
    );

    const { state: after } = spanning.applyTransaction(
      spanning.tr.replaceWith(
        0,
        spanning.doc.content.size,
        spanning.schema.text("PASTED"),
      ),
    );

    assert.match(
      serializeDocumentToMarkdown(after.doc.toJSON()),
      /<Chart title="A" \/>/,
    );
  } finally {
    editor.destroy();
  }
});
