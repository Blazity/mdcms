import assert from "node:assert/strict";
import { test } from "node:test";

import { createDocumentEditor } from "./document-editor.js";

test("createDocumentEditor loads markdown into a real TipTap document", () => {
  const editor = createDocumentEditor({
    content: "# Launch Notes",
  });

  try {
    assert.deepEqual(editor.getJSON().content?.[0], {
      type: "heading",
      attrs: {
        level: 1,
      },
      content: [{ type: "text", text: "Launch Notes" }],
    });
  } finally {
    editor.destroy();
  }
});

test("createDocumentEditor serializes wrapper MDX edits through onChange", () => {
  const changes: string[] = [];
  const editor = createDocumentEditor({
    content: ['<Callout type="warning">', "Body", "</Callout>"].join("\n"),
    onChange(markdown) {
      changes.push(markdown);
    },
  });

  try {
    editor.commands.setContent(
      ['<Callout type="warning">', "Updated **body**", "</Callout>"].join("\n"),
      { contentType: "markdown" },
    );

    assert.match(changes.at(-1) ?? "", /<Callout type="warning">/);
    assert.match(changes.at(-1) ?? "", /\*\*body\*\*/);
    assert.match(changes.at(-1) ?? "", /<\/Callout>/);
  } finally {
    editor.destroy();
  }
});

test("createDocumentEditor supports task list commands and serializes checklist markdown", () => {
  const changes: string[] = [];
  const editor = createDocumentEditor({
    content: "Todo item",
    onChange(markdown) {
      changes.push(markdown);
    },
  });

  try {
    editor.commands.selectAll();

    assert.equal(editor.commands.toggleTaskList(), true);
    assert.match(changes.at(-1) ?? "", /- \[ \] Todo item/);
  } finally {
    editor.destroy();
  }
});

test("createDocumentEditor supports horizontal rule commands", () => {
  const changes: string[] = [];
  const editor = createDocumentEditor({
    content: "Paragraph",
    onChange(markdown) {
      changes.push(markdown);
    },
  });

  try {
    assert.equal(editor.commands.setHorizontalRule(), true);
    assert.match(changes.at(-1) ?? "", /---/);
  } finally {
    editor.destroy();
  }
});
