import assert from "node:assert/strict";
import { test } from "bun:test";

import type { StudioMountContext } from "@mdcms/shared";

import { extractMarkdownFromEditor } from "../../../markdown-pipeline.js";
import { createDocumentEditor } from "../../../document-editor.js";
import {
  getMdxComponentSlashTrigger,
  getSlashPickerLayout,
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

test("getSlashPickerLayout clamps horizontal overflow and flips above the trigger when needed", () => {
  const layout = getSlashPickerLayout({
    anchor: {
      top: 320,
      left: 320,
      cursorTop: 300,
      cursorBottom: 320,
    },
    pickerSize: {
      width: 240,
      height: 180,
    },
    viewportSize: {
      width: 360,
      height: 420,
    },
  });

  assert.deepEqual(layout, {
    top: 112,
    left: 108,
    maxHeight: 280,
  });
});

test("getSlashPickerLayout keeps the picker below the trigger and caps height when neither side fits fully", () => {
  const layout = getSlashPickerLayout({
    anchor: {
      top: 80,
      left: 40,
      cursorTop: 60,
      cursorBottom: 80,
    },
    pickerSize: {
      width: 220,
      height: 200,
    },
    viewportSize: {
      width: 360,
      height: 260,
    },
  });

  assert.deepEqual(layout, {
    top: 88,
    left: 40,
    maxHeight: 160,
  });
});
