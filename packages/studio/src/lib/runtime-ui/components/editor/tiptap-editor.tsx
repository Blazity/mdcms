// @ts-nocheck
"use client";

import { useEffect, type ReactNode } from "react";

import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";

import {
  Bold,
  Code,
  FileCode,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListTodo,
  ListOrdered,
  Minus,
  Puzzle,
  Quote,
  Redo,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { createEditorExtensions } from "../../../editor-extensions.js";
import { extractMarkdownFromEditor } from "../../../markdown-pipeline.js";
import { MdxComponentExtension } from "../../../mdx-component-extension.js";
import { createEditorToolbarLayout } from "./editor-toolbar.js";
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
  children: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
};

function ToolbarButton({
  children,
  label,
  active = false,
  disabled = false,
  className,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "h-8 px-2.5",
        active && "bg-accent-subtle text-accent",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function TipTapEditor({
  content = defaultContent,
  onChange,
  placeholder = "Start writing, or press / for commands...",
}: TipTapEditorProps) {
  const toolbar = createEditorToolbarLayout();
  const editor = useEditor(
    {
      content,
      contentType: "markdown",
      immediatelyRender: false,
      extensions: createEditorExtensions({
        mdxComponent: MdxComponentExtension.extend({
          addNodeView() {
            return ReactNodeViewRenderer(MdxComponentNodeView);
          },
        }),
      }),
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

  const iconClassName = "h-4 w-4";

  const renderToolbarItem = (itemId: string) => {
    switch (itemId) {
      case "undo":
        return <Undo className={iconClassName} />;
      case "redo":
        return <Redo className={iconClassName} />;
      case "bold":
        return <Bold className={iconClassName} />;
      case "italic":
        return <Italic className={iconClassName} />;
      case "underline":
        return <UnderlineIcon className={iconClassName} />;
      case "strike":
        return <Strikethrough className={iconClassName} />;
      case "code":
        return <Code className={iconClassName} />;
      case "highlight":
        return <Highlighter className={iconClassName} />;
      case "heading1":
        return <span className="text-sm font-semibold">H1</span>;
      case "heading2":
        return <span className="text-sm font-semibold">H2</span>;
      case "bulletList":
        return <List className={iconClassName} />;
      case "orderedList":
        return <ListOrdered className={iconClassName} />;
      case "taskList":
        return <ListTodo className={iconClassName} />;
      case "blockquote":
        return <Quote className={iconClassName} />;
      case "codeBlock":
        return <FileCode className={iconClassName} />;
      case "horizontalRule":
        return <Minus className={iconClassName} />;
      case "image":
        return <ImageIcon className={iconClassName} />;
      case "link":
        return <LinkIcon className={iconClassName} />;
      case "table":
        return <Table2 className={iconClassName} />;
      case "insertComponent":
        return (
          <>
            <Puzzle className={iconClassName} />
            <span>Insert Component</span>
          </>
        );
      default:
        return null;
    }
  };

  const triggerToolbarItem = (itemId: string) => {
    switch (itemId) {
      case "undo":
        return run(() => editor?.chain().focus().undo().run() ?? false);
      case "redo":
        return run(() => editor?.chain().focus().redo().run() ?? false);
      case "bold":
        return run(() => editor?.chain().focus().toggleBold().run() ?? false);
      case "italic":
        return run(() => editor?.chain().focus().toggleItalic().run() ?? false);
      case "underline":
        return;
      case "strike":
        return run(() => editor?.chain().focus().toggleStrike().run() ?? false);
      case "code":
        return run(() => editor?.chain().focus().toggleCode().run() ?? false);
      case "highlight":
        return;
      case "heading1":
        return run(
          () =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run() ?? false,
        );
      case "heading2":
        return run(
          () =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run() ?? false,
        );
      case "bulletList":
        return run(
          () => editor?.chain().focus().toggleBulletList().run() ?? false,
        );
      case "orderedList":
        return run(
          () => editor?.chain().focus().toggleOrderedList().run() ?? false,
        );
      case "taskList":
        return run(
          () => editor?.chain().focus().toggleTaskList().run() ?? false,
        );
      case "blockquote":
        return run(
          () => editor?.chain().focus().toggleBlockquote().run() ?? false,
        );
      case "codeBlock":
        return run(
          () => editor?.chain().focus().toggleCodeBlock().run() ?? false,
        );
      case "horizontalRule":
        return run(
          () => editor?.chain().focus().setHorizontalRule().run() ?? false,
        );
      default:
        return;
    }
  };

  const isToolbarItemActive = (itemId: string) => {
    switch (itemId) {
      case "bold":
        return isActive("bold");
      case "italic":
        return isActive("italic");
      case "strike":
        return isActive("strike");
      case "code":
        return isActive("code");
      case "heading1":
        return isActive("heading", { level: 1 });
      case "heading2":
        return isActive("heading", { level: 2 });
      case "bulletList":
        return isActive("bulletList");
      case "orderedList":
        return isActive("orderedList");
      case "taskList":
        return isActive("taskList");
      case "blockquote":
        return isActive("blockquote");
      case "codeBlock":
        return isActive("codeBlock");
      default:
        return false;
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="border-b border-border bg-background-subtle">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
          {toolbar.primaryGroups.map((group, groupIndex) => (
            <div key={group.id} className="flex items-center gap-1.5">
              {groupIndex > 0 ? (
                <Separator orientation="vertical" className="mr-1 h-6" />
              ) : null}
              {group.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.availability === "enabled") {
                      triggerToolbarItem(item.id);
                    }
                  }}
                >
                  <ToolbarButton
                    label={
                      item.availability === "visual-only"
                        ? `${item.label} (planned)`
                        : item.label
                    }
                    active={isToolbarItemActive(item.id)}
                    className={cn(
                      item.id === "heading1" || item.id === "heading2"
                        ? "min-w-10 px-3"
                        : "w-8 px-0",
                      item.availability === "visual-only" &&
                        "text-foreground-muted",
                    )}
                  >
                    {renderToolbarItem(item.id)}
                  </ToolbarButton>
                </div>
              ))}
            </div>
          ))}

          <div className="ml-auto">
            <Badge variant="outline" className="bg-background">
              TipTap
            </Badge>
          </div>
        </div>

        {toolbar.secondaryItems.length > 0 ? (
          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            {toolbar.secondaryItems.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="outline"
                size="sm"
                aria-disabled="true"
                title={`${item.label} (planned for CMS-74)`}
                className="border-accent text-accent hover:bg-accent-subtle hover:text-accent"
              >
                {renderToolbarItem(item.id)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-[480px] bg-transparent">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
