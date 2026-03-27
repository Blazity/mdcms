import assert from "node:assert/strict";
import { test } from "bun:test";

import { createDocumentEditor } from "./document-editor.js";
import { extractMarkdownFromEditor } from "./markdown-pipeline.js";
import { createMdxComponentInsertContent } from "./runtime-ui/components/editor/mdx-component-catalog.js";

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

test("createDocumentEditor serializes inserted void MDX components as self-closing tags", () => {
  const changes: string[] = [];
  const editor = createDocumentEditor({
    content: "Placeholder",
    onChange(markdown) {
      changes.push(markdown);
    },
  });

  try {
    editor.commands.selectAll();
    assert.equal(
      editor.commands.insertContent({
        type: "mdxComponent",
        attrs: {
          componentName: "HeroBanner",
          props: { title: "Launch" },
          isVoid: true,
        },
      }),
      true,
    );

    assert.match(changes.at(-1) ?? "", /<HeroBanner title="Launch" \/>/);
  } finally {
    editor.destroy();
  }
});

test("createDocumentEditor serializes inserted wrapper MDX components with opening and closing tags", () => {
  const changes: string[] = [];
  const editor = createDocumentEditor({
    content: "Placeholder",
    onChange(markdown) {
      changes.push(markdown);
    },
  });

  try {
    editor.commands.selectAll();
    assert.equal(
      editor.commands.insertContent(
        createMdxComponentInsertContent(
          {
            name: "Callout",
            importPath: "@/components/mdx/Callout",
            extractedProps: {
              children: { type: "rich-text", required: false },
            },
          },
          { type: "warning" },
        ),
      ),
      true,
    );

    assert.match(changes.at(-1) ?? "", /<Callout type="warning">/);
    assert.match(changes.at(-1) ?? "", /<\/Callout>/);
    assert.doesNotMatch(changes.at(-1) ?? "", /&nbsp;/);
  } finally {
    editor.destroy();
  }
});

test("createDocumentEditor rejects void MDX components that somehow retain child content", () => {
  const editor = createDocumentEditor({
    content: "Placeholder",
  });

  try {
    editor.commands.selectAll();
    assert.equal(
      editor.commands.insertContent({
        type: "mdxComponent",
        attrs: {
          componentName: "HeroBanner",
          props: { title: "Launch" },
          isVoid: true,
        },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Body" }] },
        ],
      }),
      true,
    );

    assert.throws(() => extractMarkdownFromEditor(editor), /cannot serialize/);
  } finally {
    editor.destroy();
  }
});
