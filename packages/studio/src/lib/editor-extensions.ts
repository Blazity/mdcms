import Highlight from "@tiptap/extension-highlight";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import type { Extensions } from "@tiptap/core";

import { MdxComponentExtension } from "./mdx-component-extension.js";

export function createEditorExtensions(options?: {
  mdxComponent?: Extensions[number];
}): Extensions {
  return [
    StarterKit,
    Underline,
    Highlight,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    options?.mdxComponent ?? MdxComponentExtension,
    Markdown,
  ];
}
