"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { StudioMountContext } from "@mdcms/shared";
import {
  EditorContent,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
  useEditor,
} from "@tiptap/react";

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
import { createMdxComponentInsertContent } from "./mdx-component-catalog.js";
import { MdxComponentPicker } from "./mdx-component-picker.js";
import { type MdxPropsPanelSelection } from "./mdx-props-panel.js";
import {
  createPublishedMdxComponentSelectionSnapshot,
  hasPublishedMdxComponentSelectionChanged,
  type PublishedMdxComponentSelectionSnapshot,
} from "./mdx-component-panel-selection.js";
import {
  getSelectedMdxComponent,
  selectAdjacentMdxComponent,
  updateSelectedMdxComponentProps,
} from "./mdx-component-selection.js";
import {
  getMdxComponentSlashTrigger,
  replaceSlashTriggerWithMdxComponent,
  type MdxComponentSlashTrigger,
} from "./mdx-component-slash.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Separator } from "../ui/separator.js";
import { cn } from "../../lib/utils.js";

interface TipTapEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  context?: StudioMountContext;
  readOnly?: boolean;
  forbidden?: boolean;
  onActiveMdxComponentChange?: (
    selection: MdxPropsPanelSelection | null,
  ) => void;
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

type TipTapEditorInstance = NonNullable<ReturnType<typeof useEditor>>;

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

export function createTipTapEditorDependencies(input: {
  placeholder: string;
  hostBridge: StudioMountContext["hostBridge"] | undefined;
  readOnly: boolean;
  forbidden: boolean;
}) {
  // The editor must survive parent rerenders so nested MDX child editing stays
  // in one TipTap document/autosave session. Callback identity is intentionally
  // excluded from the recreation key, but node views must still refresh when
  // the host bridge or editor access mode changes.
  return [input.placeholder, input.hostBridge, input.readOnly, input.forbidden];
}

export function TipTapEditor({
  content = defaultContent,
  onChange,
  placeholder = "Start writing, or press / for commands...",
  context,
  readOnly = false,
  forbidden = false,
  onActiveMdxComponentChange,
}: TipTapEditorProps) {
  const toolbar = createEditorToolbarLayout();
  const catalogComponents = context?.mdx?.catalog.components ?? [];
  const isEditorReadOnly = readOnly || forbidden;
  const [pickerSource, setPickerSource] = useState<"toolbar" | "slash" | null>(
    null,
  );
  const [slashTrigger, setSlashTrigger] =
    useState<MdxComponentSlashTrigger | null>(null);
  const lastPublishedSelectionRef =
    useRef<PublishedMdxComponentSelectionSnapshot | null>(null);
  const lastEmittedMarkdownRef = useRef<string | null>(null);
  const isExternalSyncRef = useRef(false);
  const handleEditorUpdate = useEffectEvent(
    (nextEditor: TipTapEditorInstance) => {
      if (isExternalSyncRef.current) {
        return;
      }

      const nextMarkdown = extractMarkdownFromEditor(nextEditor);

      if (nextMarkdown === lastEmittedMarkdownRef.current) {
        return;
      }

      lastEmittedMarkdownRef.current = nextMarkdown;
      onChange?.(nextMarkdown);
    },
  );
  const syncSlashTrigger = useEffectEvent(
    (nextEditor: TipTapEditorInstance) => {
      const nextTrigger = getMdxComponentSlashTrigger(nextEditor);

      setSlashTrigger(nextTrigger);
      setPickerSource((currentSource) => {
        if (currentSource === "toolbar") {
          return currentSource;
        }

        if (nextTrigger) {
          return "slash";
        }

        return currentSource === "slash" ? null : currentSource;
      });
    },
  );
  const publishSelectedMdxComponent = useEffectEvent(
    (nextEditor: TipTapEditorInstance) => {
      if (!onActiveMdxComponentChange) {
        lastPublishedSelectionRef.current = null;
        return;
      }

      const selected = getSelectedMdxComponent(nextEditor, catalogComponents);

      if (!selected) {
        if (lastPublishedSelectionRef.current === null) {
          return;
        }

        lastPublishedSelectionRef.current = null;
        onActiveMdxComponentChange(null);
        return;
      }

      const nextSnapshot = createPublishedMdxComponentSelectionSnapshot({
        selected,
        readOnly,
        forbidden,
      });

      if (
        !hasPublishedMdxComponentSelectionChanged(
          lastPublishedSelectionRef.current,
          nextSnapshot,
        )
      ) {
        return;
      }

      lastPublishedSelectionRef.current = nextSnapshot;

      onActiveMdxComponentChange({
        ...selected,
        readOnly,
        forbidden,
        onPropsChange: (patch) => {
          if (
            updateSelectedMdxComponentProps(
              nextEditor,
              catalogComponents,
              patch,
              {
                readOnly,
                forbidden,
              },
            )
          ) {
            publishSelectedMdxComponent(nextEditor);
            handleEditorUpdate(nextEditor);
          }
        },
      });
    },
  );
  const editor = useEditor(
    {
      content,
      contentType: "markdown",
      editable: !isEditorReadOnly,
      immediatelyRender: false,
      extensions: createEditorExtensions({
        mdxComponent: MdxComponentExtension.extend({
          addNodeView() {
            const NodeView = (props: ReactNodeViewProps) => (
              <MdxComponentNodeView
                {...props}
                context={context}
                readOnly={readOnly}
                forbidden={forbidden}
              />
            );

            return ReactNodeViewRenderer(NodeView);
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
        handleEditorUpdate(editor);
        publishSelectedMdxComponent(editor);
        syncSlashTrigger(editor);
      },
      onSelectionUpdate({ editor }) {
        publishSelectedMdxComponent(editor);
        syncSlashTrigger(editor);
      },
    },
    createTipTapEditorDependencies({
      placeholder,
      hostBridge: context?.hostBridge,
      readOnly,
      forbidden,
    }),
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    // Seed the ref with TipTap's normalized output so the first focus/click
    // does not produce a spurious onChange from parse normalization.
    if (lastEmittedMarkdownRef.current === null) {
      lastEmittedMarkdownRef.current = extractMarkdownFromEditor(editor);
    }

    const currentMarkdown = extractMarkdownFromEditor(editor);

    if (currentMarkdown === content) {
      lastEmittedMarkdownRef.current = currentMarkdown;
      return;
    }

    isExternalSyncRef.current = true;
    editor.commands.setContent(content, {
      contentType: "markdown",
    });
    lastEmittedMarkdownRef.current = extractMarkdownFromEditor(editor);
    isExternalSyncRef.current = false;
  }, [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!isEditorReadOnly);
    publishSelectedMdxComponent(editor);
    syncSlashTrigger(editor);
  }, [catalogComponents, editor, forbidden, isEditorReadOnly, readOnly]);

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
      case "insertComponent":
        setPickerSource((currentSource) =>
          currentSource === "toolbar" ? null : "toolbar",
        );
        return;
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

  const insertSelectedComponent = (
    component: (typeof catalogComponents)[number],
  ) => {
    if (!editor) {
      return;
    }

    const didInsert =
      pickerSource === "slash" && slashTrigger
        ? replaceSlashTriggerWithMdxComponent(editor, slashTrigger, component)
        : editor.commands.insertContent(
            createMdxComponentInsertContent(component),
          );

    if (!didInsert) {
      return;
    }

    if (!getSelectedMdxComponent(editor, catalogComponents)) {
      selectAdjacentMdxComponent(editor);
    }

    setSlashTrigger(null);
    setPickerSource(null);
    publishSelectedMdxComponent(editor);
    handleEditorUpdate(editor);
    syncSlashTrigger(editor);
  };

  const isPickerOpen =
    pickerSource === "toolbar" ||
    (pickerSource === "slash" && slashTrigger !== null);

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
                    if (item.availability === "enabled" && !isEditorReadOnly) {
                      triggerToolbarItem(item.id);
                    }
                  }}
                >
                  <ToolbarButton
                    disabled={
                      item.availability !== "enabled" || isEditorReadOnly
                    }
                    label={
                      item.availability === "visual-only"
                        ? `${item.label} (planned)`
                        : isEditorReadOnly
                          ? `${item.label} (unavailable in read-only mode)`
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
                disabled={item.availability !== "enabled" || isEditorReadOnly}
                onClick={() => {
                  if (item.availability === "enabled" && !isEditorReadOnly) {
                    triggerToolbarItem(item.id);
                  }
                }}
                title={
                  item.availability !== "enabled"
                    ? `${item.label} (planned)`
                    : isEditorReadOnly
                      ? `${item.label} (unavailable in read-only mode)`
                      : item.label
                }
                className="border-accent text-accent hover:bg-accent-subtle hover:text-accent"
              >
                {renderToolbarItem(item.id)}
              </Button>
            ))}
          </div>
        ) : null}

        {isPickerOpen ? (
          <div
            data-mdcms-mdx-picker-source={pickerSource ?? "toolbar"}
            className="border-t border-border px-3 py-3"
          >
            {pickerSource === "slash" && slashTrigger ? (
              <p className="mb-2 text-xs text-foreground-muted">
                Slash filter: /{slashTrigger.query}
              </p>
            ) : null}
            <MdxComponentPicker
              components={catalogComponents}
              query={
                pickerSource === "slash" ? (slashTrigger?.query ?? "") : ""
              }
              forbidden={isEditorReadOnly}
              onSelect={insertSelectedComponent}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-[480px] bg-transparent">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
