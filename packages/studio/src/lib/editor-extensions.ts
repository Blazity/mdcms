import { Extension } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

import { MdxComponentExtension } from "./mdx-component-extension.js";

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

// Markdown cannot represent a paragraph that ends with a soft break. The
// CommonMark rule strips trailing whitespace at paragraph boundaries, so a
// trailing `<br>` serializes to `  \n\n\n…` and re-parses as a plain
// paragraph break — making the document look different on reload than it did
// while editing. Keep the in-editor state markdown-faithful by dropping any
// hardBreak that lands at the very end of a paragraph.
const MarkdownCompatibleNormalizer = Extension.create({
  name: "markdownCompatibleNormalizer",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("markdownCompatibleNormalizer"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          const edits: Array<{ from: number; to: number }> = [];
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") {
              return true;
            }

            // Walk trailing hardBreaks so "Shift+Enter" spam collapses fully.
            let trimStart = pos + node.nodeSize - 1;
            for (let i = node.childCount - 1; i >= 0; i -= 1) {
              const child = node.child(i);
              if (child.type.name !== "hardBreak") {
                break;
              }
              trimStart -= child.nodeSize;
            }

            const paraEnd = pos + node.nodeSize - 1;
            if (trimStart < paraEnd) {
              edits.push({ from: trimStart, to: paraEnd });
            }

            return false;
          });

          if (edits.length === 0) {
            return null;
          }

          const tr = newState.tr;
          // Apply from the end of the document so earlier positions stay valid.
          for (let i = edits.length - 1; i >= 0; i -= 1) {
            tr.delete(edits[i].from, edits[i].to);
          }

          return tr;
        },
      }),
    ];
  },
});

export function createEditorExtensions(options?: {
  mdxComponent?: Extensions[number];
}): Extensions {
  return [
    StarterKit,
    Underline,
    Highlight,
    BlurSelectionPreserver,
    MarkdownCompatibleNormalizer,
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
    options?.mdxComponent ?? MdxComponentExtension,
    Markdown,
  ];
}
