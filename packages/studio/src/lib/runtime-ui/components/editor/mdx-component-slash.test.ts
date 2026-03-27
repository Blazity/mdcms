import assert from "node:assert/strict";
import { test } from "bun:test";

import type { StudioMountContext } from "@mdcms/shared";

import { extractMarkdownFromEditor } from "../../../markdown-pipeline.js";
import { createDocumentEditor } from "../../../document-editor.js";
import {
  getMdxComponentSlashTrigger,
  replaceSlashTriggerWithMdxComponent,
} from "./mdx-component-slash.js";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

const callout: MdxCatalogComponent = {
  name: "Callout",
  importPath: "@/components/mdx/Callout",
  extractedProps: {
    children: { type: "rich-text", required: false },
  },
};

function moveSelectionToEndOfText(
  editor: ReturnType<typeof createDocumentEditor>,
) {
  let textEnd = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "text") {
      textEnd = pos + node.text!.length;
    }

    return true;
  });

  editor.commands.setTextSelection(textEnd);
}

test("getMdxComponentSlashTrigger detects an active slash query at the cursor", () => {
  const editor = createDocumentEditor({
    content: "Try /Cal",
  });

  try {
    moveSelectionToEndOfText(editor);

    assert.deepEqual(getMdxComponentSlashTrigger(editor), {
      query: "Cal",
      from: 5,
      to: 9,
    });
  } finally {
    editor.destroy();
  }
});

test("getMdxComponentSlashTrigger ignores non-collapsed selections", () => {
  const editor = createDocumentEditor({
    content: "Try /Cal",
  });

  try {
    editor.commands.selectAll();
    assert.equal(getMdxComponentSlashTrigger(editor), null);
  } finally {
    editor.destroy();
  }
});

test("replaceSlashTriggerWithMdxComponent removes the slash token and inserts the selected component", () => {
  const editor = createDocumentEditor({
    content: "Try /Cal",
  });

  try {
    moveSelectionToEndOfText(editor);
    const trigger = getMdxComponentSlashTrigger(editor);

    assert.notEqual(trigger, null);
    assert.equal(
      replaceSlashTriggerWithMdxComponent(editor, trigger!, callout, {
        tone: "warning",
      }),
      true,
    );
    const markdown = extractMarkdownFromEditor(editor);

    assert.doesNotMatch(markdown, /Try \/Cal/);
    assert.match(markdown, /Try/);
    assert.match(markdown, /<Callout tone="warning">/);
    assert.match(markdown, /<\/Callout>/);
  } finally {
    editor.destroy();
  }
});
