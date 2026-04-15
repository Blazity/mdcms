"use client";

import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
  getSlashPickerLayout,
  getSlashTriggerCoords,
  replaceSlashTriggerWithMdxComponent,
  type MdxComponentSlashTrigger,
  type SlashPickerLayout,
  type SlashTriggerCoords,
} from "./mdx-component-slash.js";
import { Button } from "../ui/button.js";
import { Separator } from "../ui/separator.js";
import { cn } from "../../lib/utils.js";

export interface TipTapEditorHandle {
  setContent: (markdown: string) => void;
}

interface TipTapEditorProps {
  initialContent?: string;
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

<Callout tone="warning">
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
        active && "bg-accent-subtle text-primary",
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

export function resolveSlashPickerCoordsForEditor(input: {
  editor: {
    view: Parameters<typeof getSlashTriggerCoords>[0];
  };
  trigger: MdxComponentSlashTrigger;
  container: Parameters<typeof getSlashTriggerCoords>[2];
}): SlashTriggerCoords | null {
  try {
    return getSlashTriggerCoords(
      input.editor.view,
      input.trigger,
      input.container,
    );
  } catch {
    return null;
  }
}

export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(
  function TipTapEditor(
    {
      initialContent = defaultContent,
      onChange,
      placeholder = "Start writing, or press / for commands...",
      context,
      readOnly = false,
      forbidden = false,
      onActiveMdxComponentChange,
    },
    ref,
  ) {
    const toolbar = createEditorToolbarLayout();
    const catalogComponents = context?.mdx?.catalog.components ?? [];
    const isEditorReadOnly = readOnly || forbidden;
    const [pickerSource, setPickerSource] = useState<
      "toolbar" | "slash" | null
    >(null);
    const [slashTrigger, setSlashTrigger] =
      useState<MdxComponentSlashTrigger | null>(null);
    const [slashPickerCoords, setSlashPickerCoords] =
      useState<SlashTriggerCoords | null>(null);
    const [slashPickerLayout, setSlashPickerLayout] =
      useState<SlashPickerLayout | null>(null);
    const editorWrapperRef = useRef<HTMLDivElement | null>(null);
    const slashPickerRef = useRef<HTMLDivElement | null>(null);
    const pickerSourceRef = useRef(pickerSource);
    pickerSourceRef.current = pickerSource;
    const lastPublishedSelectionRef =
      useRef<PublishedMdxComponentSelectionSnapshot | null>(null);
    const lastEmittedMarkdownRef = useRef<string | null>(null);
    const handleEditorUpdate = useEffectEvent(
      (nextEditor: TipTapEditorInstance) => {
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

        if (nextTrigger && editorWrapperRef.current) {
          setSlashPickerCoords(
            resolveSlashPickerCoordsForEditor({
              editor: nextEditor,
              trigger: nextTrigger,
              container: editorWrapperRef.current,
            }),
          );
        } else {
          setSlashPickerCoords(null);
          setSlashPickerLayout(null);
        }
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
        content: initialContent,
        contentType: "markdown",
        editable: !isEditorReadOnly,
        immediatelyRender: false,
        shouldRerenderOnTransaction: true,
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
          handleKeyDown: (_view, event) => {
            if (event.key === "Escape" && pickerSourceRef.current === "slash") {
              setPickerSource(null);
              setSlashTrigger(null);
              setSlashPickerCoords(null);
              return true;
            }
            return false;
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

    // Seed the emitted markdown ref once the editor initializes so the
    // first focus/click does not produce a spurious onChange.
    useEffect(() => {
      if (!editor) {
        return;
      }

      if (lastEmittedMarkdownRef.current === null) {
        lastEmittedMarkdownRef.current = extractMarkdownFromEditor(editor);
      }
    }, [editor]);

    // Imperative content setter — callers use ref.current.setContent()
    // instead of changing a content prop. This avoids the flushSync
    // lifecycle conflict entirely because setContent runs from event
    // handlers, not from effects.
    useImperativeHandle(
      ref,
      () => ({
        setContent(markdown: string) {
          if (!editor || editor.isDestroyed) {
            return;
          }

          const currentMarkdown = extractMarkdownFromEditor(editor);

          if (currentMarkdown === markdown) {
            lastEmittedMarkdownRef.current = currentMarkdown;
            return;
          }

          // Suppress onUpdate so programmatic syncs (version preview,
          // back-to-draft, post-save rehydration) don't trigger onChange
          // and accidentally mark the draft as unsaved / arm autosave.
          editor.commands.setContent(markdown, {
            contentType: "markdown",
            emitUpdate: false,
          });
          lastEmittedMarkdownRef.current = extractMarkdownFromEditor(editor);

          // Refresh derived UI state that onUpdate would normally handle,
          // since we suppressed the update event above.
          publishSelectedMdxComponent(editor);
          syncSlashTrigger(editor);
        },
      }),
      [editor],
    );

    useEffect(() => {
      if (!editor) {
        return;
      }

      editor.setEditable(!isEditorReadOnly);
      publishSelectedMdxComponent(editor);
      syncSlashTrigger(editor);
    }, [catalogComponents, editor, forbidden, isEditorReadOnly, readOnly]);

    useEffect(() => {
      if (pickerSource !== "slash" || !editor) {
        return;
      }

      const syncPosition = () => {
        syncSlashTrigger(editor);
      };

      window.addEventListener("resize", syncPosition);
      document.addEventListener("scroll", syncPosition, true);

      return () => {
        window.removeEventListener("resize", syncPosition);
        document.removeEventListener("scroll", syncPosition, true);
      };
    }, [editor, pickerSource, syncSlashTrigger]);

    useLayoutEffect(() => {
      if (
        pickerSource !== "slash" ||
        !slashTrigger ||
        !slashPickerCoords ||
        !editorWrapperRef.current ||
        !slashPickerRef.current
      ) {
        setSlashPickerLayout(null);
        return;
      }

      const pickerRect = slashPickerRef.current.getBoundingClientRect();

      setSlashPickerLayout(
        getSlashPickerLayout({
          anchor: slashPickerCoords,
          pickerSize: {
            width: pickerRect.width,
            height: pickerRect.height,
          },
          viewportSize: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        }),
      );
    }, [pickerSource, slashPickerCoords, slashTrigger]);

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
          return run(
            () => editor?.chain().focus().toggleItalic().run() ?? false,
          );
        case "underline":
          return run(
            () => editor?.chain().focus().toggleUnderline().run() ?? false,
          );
        case "strike":
          return run(
            () => editor?.chain().focus().toggleStrike().run() ?? false,
          );
        case "code":
          return run(() => editor?.chain().focus().toggleCode().run() ?? false);
        case "highlight":
          return run(
            () => editor?.chain().focus().toggleHighlight().run() ?? false,
          );
        case "heading1":
          return run(
            () =>
              editor?.chain().focus().toggleHeading({ level: 1 }).run() ??
              false,
          );
        case "heading2":
          return run(
            () =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run() ??
              false,
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
        case "underline":
          return isActive("underline");
        case "strike":
          return isActive("strike");
        case "code":
          return isActive("code");
        case "highlight":
          return isActive("highlight");
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
      setSlashPickerCoords(null);
      setPickerSource(null);
      publishSelectedMdxComponent(editor);
      handleEditorUpdate(editor);
      syncSlashTrigger(editor);
    };

    const slashPicker =
      pickerSource === "slash" && slashTrigger && slashPickerCoords ? (
        <div
          ref={slashPickerRef}
          data-mdcms-mdx-picker-source="slash"
          style={{
            position: "fixed",
            top: (slashPickerLayout ?? slashPickerCoords).top,
            left: (slashPickerLayout ?? slashPickerCoords).left,
            width: "min(28rem, calc(100vw - 24px))",
            maxHeight:
              slashPickerLayout !== null
                ? `${slashPickerLayout.maxHeight}px`
                : "calc(100vh - 24px)",
          }}
          className="z-50 overflow-y-auto"
        >
          <MdxComponentPicker
            components={catalogComponents}
            query={slashTrigger.query}
            forbidden={isEditorReadOnly}
            onSelect={insertSelectedComponent}
          />
        </div>
      ) : null;

    return (
      <div ref={editorWrapperRef} className="relative">
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
                        if (
                          item.availability === "enabled" &&
                          !isEditorReadOnly
                        ) {
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
            </div>

            {toolbar.secondaryItems.length > 0 ? (
              <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                {toolbar.secondaryItems.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      item.availability !== "enabled" || isEditorReadOnly
                    }
                    onClick={() => {
                      if (
                        item.availability === "enabled" &&
                        !isEditorReadOnly
                      ) {
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
                    className="border-primary text-primary hover:bg-accent-subtle hover:text-primary"
                  >
                    {renderToolbarItem(item.id)}
                  </Button>
                ))}
              </div>
            ) : null}

            {pickerSource === "toolbar" ? (
              <div
                data-mdcms-mdx-picker-source="toolbar"
                className="border-t border-border px-3 py-3"
              >
                <MdxComponentPicker
                  components={catalogComponents}
                  query=""
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

        {slashPicker && typeof document !== "undefined"
          ? createPortal(slashPicker, document.body)
          : null}
      </div>
    );
  },
);
