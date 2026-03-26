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
