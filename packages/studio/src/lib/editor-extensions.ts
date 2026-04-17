import { Extension } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import HardBreak from "@tiptap/extension-hard-break";
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

// The stock `setHardBreak` routes through `editor.commands.insertContent`,
// which in turn calls `createNodeFromContent` twice (once as a dry-run for
// error emission, once for real) and runs fragment/node validation on every
// Shift+Enter. On paragraphs with a trailing placeholder the double-parse
// was enough to make Shift+Enter feel laggy compared to regular Enter
// (which PM's native `splitBlock` handles with a single ReplaceStep). Swap
// in a direct-insertion version that builds the tr by hand.
const FastHardBreak = HardBreak.extend({
  addCommands() {
    return {
      setHardBreak:
        () =>
        ({ state, dispatch, editor, commands }) => {
          if (commands.exitCode()) {
            return true;
          }

          const { selection } = state;
          if (selection.$from.parent.type.spec.isolating) {
            return false;
          }

          if (!dispatch) {
            return true;
          }

          const nodeType = state.schema.nodes[this.name];
          if (!nodeType) {
            return false;
          }

          const tr = state.tr
            .replaceSelectionWith(nodeType.create(), false)
            .scrollIntoView();

          if (this.options.keepMarks) {
            const marks =
              state.storedMarks ||
              (selection.$to.parentOffset > 0 ? selection.$from.marks() : null);
            if (marks) {
              const splittableMarks = editor.extensionManager.splittableMarks;
              tr.ensureMarks(
                marks.filter((mark) =>
                  splittableMarks.includes(mark.type.name),
                ),
              );
            }
          }

          dispatch(tr);
          return true;
        },
    };
  },
});

export function createEditorExtensions(options?: {
  mdxComponent?: Extensions[number];
}): Extensions {
  return [
    StarterKit.configure({
      // StarterKit ships its own HardBreak; we replace it below with a
      // fast-path implementation to keep Shift+Enter snappy.
      hardBreak: false,
    }),
    FastHardBreak,
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
    options?.mdxComponent ?? MdxComponentExtension,
    Markdown,
  ];
}
