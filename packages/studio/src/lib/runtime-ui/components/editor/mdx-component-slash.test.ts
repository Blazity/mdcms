import assert from "node:assert/strict";
import { test } from "bun:test";

import type { StudioMountContext } from "@mdcms/shared";

import { extractMarkdownFromEditor } from "../../../markdown-pipeline.js";
import { createDocumentEditor } from "../../../document-editor.js";
import {
  createSlashPickerVirtualReference,
  getMdxComponentSlashTrigger,
  getSlashTriggerCoords,
  replaceSlashTriggerWithMdxComponent,
} from "./mdx-component-slash.js";
import type { MdxComponentSlashTrigger } from "./mdx-component-slash.js";

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

test("getSlashTriggerCoords returns viewport-relative coordinates", () => {
  const trigger: MdxComponentSlashTrigger = { query: "Cal", from: 5, to: 9 };
  const coords = getSlashTriggerCoords(
    {
      coordsAtPos: (_pos: number) => ({ top: 200, left: 100, bottom: 220 }),
    },
    trigger,
    { getBoundingClientRect: () => ({ top: 50, left: 30 }) },
  );

  assert.deepEqual(coords, {
    top: 220,
    left: 100,
    cursorTop: 200,
    cursorBottom: 220,
  });
});

test("createSlashPickerVirtualReference exposes a caret rect and keeps the context element", () => {
  const contextElement = {} as Element;
  const reference = createSlashPickerVirtualReference({
    anchor: {
      top: 220,
      left: 100,
      cursorTop: 200,
      cursorBottom: 220,
    },
    contextElement,
  });
  const rect = reference.getBoundingClientRect();

  assert.equal(reference.contextElement, contextElement);
  assert.deepEqual(rect, {
    x: 100,
    y: 200,
    top: 200,
    right: 100,
    bottom: 220,
    left: 100,
    width: 0,
    height: 20,
    toJSON: rect.toJSON,
  });
});
