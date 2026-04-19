import { Extension } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

import { MdxComponentExtension } from "./mdx-component-extension.js";

// Returns a lowlight instance seeded with the common language set and with
// `highlightAuto` replaced by a plain-text no-op. CodeBlockLowlight falls
// back to `highlightAuto` whenever a block has no language attribute; the
// default guesses at a grammar and renders tokens inside what the user
// thinks is a plain-text block. Overriding it keeps "Plain text" honest
// and matches the spec's "no auto-detection" decision.
export function createStudioLowlight() {
  const instance = createLowlight(common);

  (instance as { highlightAuto: (value: string) => unknown }).highlightAuto = (
    value: string,
  ) => ({
    type: "root",
    data: { language: undefined },
    children: [{ type: "text", value }],
  });

  return instance;
}

// Module-scope lowlight instance — language grammars are registered exactly
// once for the lifetime of the process rather than per editor mount.
const lowlightInstance = createStudioLowlight();

const BlurSelectionPreserver = Extension.create({
  name: "blurSelectionPreserver",

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey("blurSelectionPreserver");
    let focused = true;

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations(state) {
            if (focused) return DecorationSet.empty;
            const { from, to } = state.selection;
            if (from === to) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.inline(from, to, {
                class: "ProseMirror-blur-selection",
              }),
            ]);
          },
        },
        view(editorView) {
          const onFocus = () => {
            focused = true;
            editorView.dispatch(editorView.state.tr);
          };
          const onBlur = () => {
            focused = false;
            editorView.dispatch(editorView.state.tr);
          };
          editorView.dom.addEventListener("focus", onFocus);
          editorView.dom.addEventListener("blur", onBlur);
          return {
            destroy() {
              editorView.dom.removeEventListener("focus", onFocus);
              editorView.dom.removeEventListener("blur", onBlur);
            },
          };
        },
      }),
    ];
  },
});

const HeadlessCodeBlock = CodeBlockLowlight.configure({
  lowlight: lowlightInstance,
  defaultLanguage: null,
});

// `createEditorExtensions` is safe to import from headless contexts (the
// markdown pipeline, the CLI, document-editor.ts). The UI layer passes its
// own React-wrapped `codeBlock` override so `@tiptap/react` only loads when
// an editor is actually mounting in a browser.
export function createEditorExtensions(options?: {
  mdxComponent?: Extensions[number];
  codeBlock?: Extensions[number];
}): Extensions {
  return [
    StarterKit.configure({ codeBlock: false }),
    Underline,
    Highlight,
    BlurSelectionPreserver,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: "noopener noreferrer nofollow",
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    options?.codeBlock ?? HeadlessCodeBlock,
    options?.mdxComponent ?? MdxComponentExtension,
    Markdown,
  ];
}
