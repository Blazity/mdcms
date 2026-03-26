// @ts-nocheck
"use client";

import { useEffect, type ReactNode } from "react";

import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { MdxComponentExtension } from "../../../mdx-component-extension.js";
import { extractMarkdownFromEditor } from "../../../markdown-pipeline.js";
import { MdxComponentNodeView } from "./mdx-component-node-view.js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { cn } from "../../lib/utils";

interface TipTapEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
}

const defaultContent = `
# Hello World

This is a sample markdown document created in MDCMS Studio.

<Callout type="warning">
This is **important** nested markdown content inside an MDX wrapper component.

- First point
- Second point
</Callout>

## Getting Started

Continue writing your content here...
`;

type ToolbarButtonProps = {
  icon: ReactNode;
  label: string;
  active?: boolean;
};

function ToolbarButton({ icon, label, active = false }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={`${label} (mock)`}
      className={cn("h-8 w-8 p-0", active && "bg-accent-subtle text-accent")}
    >
      {icon}
    </Button>
  );
}

export function TipTapEditor({
  content = defaultContent,
  onChange,
  placeholder = "Start writing, or press / for commands...",
}: TipTapEditorProps) {
  const editor = useEditor(
    {
      content,
      contentType: "markdown",
      immediatelyRender: false,
      extensions: [
        StarterKit,
        MdxComponentExtension.extend({
          addNodeView() {
            return ReactNodeViewRenderer(MdxComponentNodeView);
          },
        }),
        Markdown,
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none min-h-[480px] px-4 py-4 focus:outline-none",
          "data-placeholder": placeholder,
        },
      },
      onUpdate({ editor }) {
        onChange?.(extractMarkdownFromEditor(editor));
      },
    },
    [onChange, placeholder],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentMarkdown = extractMarkdownFromEditor(editor);

    if (currentMarkdown === content) {
      return;
    }

    editor.commands.setContent(content, {
      contentType: "markdown",
    });
  }, [content, editor]);

  const isActive = (name: string, attributes?: Record<string, unknown>) =>
    editor?.isActive(name, attributes) ?? false;

  const run = (command: () => boolean) => {
    command();
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-background-subtle p-1">
        <div
          onClick={() =>
            run(() => editor?.chain().focus().undo().run() ?? false)
          }
        >
          <ToolbarButton icon={<Undo className="h-4 w-4" />} label="Undo" />
        </div>
        <div
          onClick={() =>
            run(() => editor?.chain().focus().redo().run() ?? false)
          }
        >
          <ToolbarButton icon={<Redo className="h-4 w-4" />} label="Redo" />
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleBold().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<Bold className="h-4 w-4" />}
            label="Bold"
            active={isActive("bold")}
          />
        </div>
        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleItalic().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<Italic className="h-4 w-4" />}
            label="Italic"
            active={isActive("italic")}
          />
        </div>
        <ToolbarButton
          icon={<UnderlineIcon className="h-4 w-4" />}
          label="Underline"
        />
        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleStrike().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<Strikethrough className="h-4 w-4" />}
            label="Strikethrough"
            active={isActive("strike")}
          />
        </div>
        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleCode().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<Code className="h-4 w-4" />}
            label="Inline code"
            active={isActive("code")}
          />
        </div>
        <ToolbarButton
          icon={<Highlighter className="h-4 w-4" />}
          label="Highlight"
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <div
          onClick={() =>
            run(
              () =>
                editor?.chain().focus().toggleHeading({ level: 1 }).run() ??
                false,
            )
          }
        >
          <ToolbarButton
            icon={<Heading1 className="h-4 w-4" />}
            label="Heading 1"
            active={isActive("heading", { level: 1 })}
          />
        </div>
        <div
          onClick={() =>
            run(
              () =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run() ??
                false,
            )
          }
        >
          <ToolbarButton
            icon={<Heading2 className="h-4 w-4" />}
            label="Heading 2"
            active={isActive("heading", { level: 2 })}
          />
        </div>
        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleBulletList().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<List className="h-4 w-4" />}
            label="Bulleted list"
            active={isActive("bulletList")}
          />
        </div>
        <div
          onClick={() =>
            run(
              () => editor?.chain().focus().toggleOrderedList().run() ?? false,
            )
          }
        >
          <ToolbarButton
            icon={<ListOrdered className="h-4 w-4" />}
            label="Numbered list"
            active={isActive("orderedList")}
          />
        </div>
        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleBlockquote().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<Quote className="h-4 w-4" />}
            label="Quote"
            active={isActive("blockquote")}
          />
        </div>
        <div
          onClick={() =>
            run(() => editor?.chain().focus().toggleCodeBlock().run() ?? false)
          }
        >
          <ToolbarButton
            icon={<FileCode className="h-4 w-4" />}
            label="Code block"
            active={isActive("codeBlock")}
          />
        </div>
        <ToolbarButton
          icon={<ImageIcon className="h-4 w-4" />}
          label="Insert image"
        />
        <ToolbarButton
          icon={<LinkIcon className="h-4 w-4" />}
          label="Insert link"
        />

        <div className="ml-auto">
          <Badge variant="outline" className="bg-background">
            TipTap
          </Badge>
        </div>
      </div>

      <div className="border-b border-border bg-background px-4 py-2 text-xs text-foreground-muted">
        Real TipTap markdown editing is active. Wrapper MDX components expose a
        nested rich-text region inside the document flow.
      </div>

      <div className="min-h-[480px] bg-transparent">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
