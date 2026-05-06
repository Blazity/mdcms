"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { StudioMountContext } from "@mdcms/shared";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";

import {
  Bold,
  ChevronsDownUp,
  ChevronsUpDown,
  Code,
  CornerDownLeft,
  ExternalLink,
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
  Trash2,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { createEditorExtensions } from "../../../editor-extensions.js";
import { extractMarkdownFromEditor } from "../../../markdown-pipeline.js";
import { MdxComponentExtension } from "../../../mdx-component-extension.js";
import { CodeBlockWithNodeView } from "./code-block-node-view.js";
import {
  MdxComponentCollapseProvider,
  useMdxComponentCollapseController,
} from "./mdx-component-collapse.js";
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
  createSlashPickerVirtualReference,
  getMdxComponentSlashTrigger,
  getSlashTriggerCoords,
  replaceSlashTriggerWithMdxComponent,
  type MdxComponentSlashTrigger,
  type SlashTriggerCoords,
} from "./mdx-component-slash.js";
import { Button } from "../ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";
import { Separator } from "../ui/separator.js";
import { cn } from "../../lib/utils.js";

export interface TipTapEditorHandle {
  setContent: (markdown: string) => void;
  /**
   * Replace a text range with the given replacement text and return
   * the resulting range + anchor rect. Used by the inline AI flow to
   * stage a proposal preview directly in the editor before the user
   * accepts or rejects it.
   *
   * Returns `null` if the editor is unmounted, the range is invalid,
   * or the document text at `[from, to)` no longer matches
   * `expectedText` (set when the caller wants to abort if the user
   * has typed in the meantime).
   */
  applyInlinePreview: (input: {
    from: number;
    to: number;
    replacementText: string;
    expectedText?: string;
  }) => {
    previewFrom: number;
    previewTo: number;
    anchorRect: TipTapEditorAnchorRect;
    /**
     * Restores the original document slice (including block-level
     * structure such as bullet lists or headings) at the previewed
     * range. The slice was captured before the preview was applied,
     * so reverting recovers formatting — not just the plain text.
     * Returns `null` if the editor is unmounted.
     */
    revert: () => { anchorRect: TipTapEditorAnchorRect } | null;
  } | null;
}

export type TipTapEditorAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type TipTapEditorSelectionInfo = {
  /** Stable id derived from the current selection range. */
  selectionId: string;
  /** Plain text inside the selection. */
  text: string;
  /** ProseMirror document positions for the selection range. */
  from: number;
  to: number;
  /**
   * Viewport-relative rect for the selection's start/end coordinates.
   * Consumers can pass this to floating-ui (or use it directly) to
   * anchor a popover near the selection. `top` and `bottom` come from
   * `view.coordsAtPos(from)` and `view.coordsAtPos(to)` so multi-line
   * selections produce a rect that covers both ends.
   */
  anchorRect: TipTapEditorAnchorRect;
};

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
  /**
   * Notifies callers when the user's plain-text selection changes.
   * Fires with `null` when the selection is empty or collapsed.
   * Used by the inline AI affordance to drive selection-anchored
   * transforms.
   */
  onSelectionTextChange?: (selection: TipTapEditorSelectionInfo | null) => void;
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

const ZERO_ANCHOR_RECT: TipTapEditorAnchorRect = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
};

function rectForRange(
  editor: TipTapEditorInstance,
  from: number,
  to: number,
): TipTapEditorAnchorRect {
  try {
    const fromCoords = editor.view.coordsAtPos(from);
    const toCoords = editor.view.coordsAtPos(to);
    const top = Math.min(fromCoords.top, toCoords.top);
    const bottom = Math.max(fromCoords.bottom, toCoords.bottom);
    const left = Math.min(fromCoords.left, toCoords.left);
    const right = Math.max(fromCoords.right, toCoords.right);
    return {
      top,
      left,
      right,
      bottom,
      width: Math.max(right - left, 0),
      height: Math.max(bottom - top, 0),
    };
  } catch {
    return ZERO_ANCHOR_RECT;
  }
}

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
      onSelectionTextChange,
    },
    ref,
  ) {
    const toolbar = createEditorToolbarLayout();
    const catalogComponents = context?.mdx?.catalog.components ?? [];
    const isEditorReadOnly = readOnly || forbidden;
    const collapseController = useMdxComponentCollapseController();
    const [pickerSource, setPickerSource] = useState<
      "toolbar" | "slash" | null
    >(null);
    const [slashTrigger, setSlashTrigger] =
      useState<MdxComponentSlashTrigger | null>(null);
    const [slashPickerCoords, setSlashPickerCoords] =
      useState<SlashTriggerCoords | null>(null);
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
    const [linkInputValue, setLinkInputValue] = useState("");
    // While the user drags an MDX component handle, the browser's default
    // pointer behavior would let the cursor paint a text selection over
    // sibling block content as it sweeps across the editor. Track the drag
    // explicitly so we can pin `user-select: none` on the editor and run an
    // auto-scroll loop while the canvas pane is the scrollable ancestor.
    const [isMdxDragging, setIsMdxDragging] = useState(false);
    const editorWrapperRef = useRef<HTMLDivElement | null>(null);
    const pickerSourceRef = useRef(pickerSource);
    pickerSourceRef.current = pickerSource;
    const slashPickerOpen =
      pickerSource === "slash" &&
      slashTrigger !== null &&
      slashPickerCoords !== null;
    const {
      refs: floatingRefs,
      floatingStyles,
      update: updateFloating,
    } = useFloating({
      open: slashPickerOpen,
      placement: "bottom-start",
      strategy: "fixed",
      whileElementsMounted: autoUpdate,
      middleware: [
        offset(8),
        flip({
          padding: 12,
          boundary:
            editorWrapperRef.current?.closest(
              '[data-mdcms-editor-pane="canvas"]',
            ) ?? undefined,
        }),
        shift({
          padding: 12,
          boundary:
            editorWrapperRef.current?.closest(
              '[data-mdcms-editor-pane="canvas"]',
            ) ?? undefined,
        }),
        size({
          padding: 12,
          boundary:
            editorWrapperRef.current?.closest(
              '[data-mdcms-editor-pane="canvas"]',
            ) ?? undefined,
          apply({ availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              maxHeight: `${Math.max(availableHeight, 0)}px`,
            });
          },
        }),
      ],
    });
    const lastPublishedSelectionRef =
      useRef<PublishedMdxComponentSelectionSnapshot | null>(null);
    const lastEmittedMarkdownRef = useRef<string | null>(null);
    // Serializing the whole doc to markdown on every keystroke was heavy
    // enough to make the caret visibly lag during fast typing. Keep an
    // immediate emitter for single-shot user actions (prop edits, component
    // inserts) and a scheduled variant for the high-frequency `onUpdate`
    // path that only serializes after typing pauses.
    const markdownEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const emitMarkdownNow = useEffectEvent(
      (nextEditor: TipTapEditorInstance) => {
        if (markdownEmitTimerRef.current !== null) {
          clearTimeout(markdownEmitTimerRef.current);
          markdownEmitTimerRef.current = null;
        }

        const nextMarkdown = extractMarkdownFromEditor(nextEditor);

        if (nextMarkdown === lastEmittedMarkdownRef.current) {
          return;
        }

        lastEmittedMarkdownRef.current = nextMarkdown;
        onChange?.(nextMarkdown);
      },
    );
    const handleEditorUpdate = emitMarkdownNow;
    const scheduleMarkdownEmission = useEffectEvent(
      (nextEditor: TipTapEditorInstance) => {
        if (markdownEmitTimerRef.current !== null) {
          clearTimeout(markdownEmitTimerRef.current);
        }

        markdownEmitTimerRef.current = setTimeout(() => {
          markdownEmitTimerRef.current = null;
          emitMarkdownNow(nextEditor);
        }, 150);
      },
    );
    useEffect(
      () => () => {
        if (markdownEmitTimerRef.current !== null) {
          clearTimeout(markdownEmitTimerRef.current);
          markdownEmitTimerRef.current = null;
        }
      },
      [],
    );

    // The props-panel publisher is allowed to lag the caret by a frame —
    // it only drives a side-panel update, never the editor's own DOM —
    // so defer it off the keystroke's critical path.
    const auxSelectionFrameRef = useRef<number | null>(null);
    const lastPublishedTextSelectionRef = useRef<string | null>(null);
    const publishTextSelection = useEffectEvent(
      (nextEditor: TipTapEditorInstance) => {
        if (!onSelectionTextChange) {
          return;
        }

        const { from, to, empty } = nextEditor.state.selection;

        if (empty || from === to) {
          if (lastPublishedTextSelectionRef.current !== null) {
            lastPublishedTextSelectionRef.current = null;
            onSelectionTextChange(null);
          }
          return;
        }

        const text = nextEditor.state.doc.textBetween(from, to, "\n", "\n");

        if (text.trim().length === 0) {
          if (lastPublishedTextSelectionRef.current !== null) {
            lastPublishedTextSelectionRef.current = null;
            onSelectionTextChange(null);
          }
          return;
        }

        // ProseMirror's coordsAtPos throws if positions slip during a
        // transaction; rectForRange catches that and returns a zero
        // rect, and the consumer repositions on the next tick.
        const anchorRect = rectForRange(nextEditor, from, to);

        // The selection id is derived from the range bounds + text so a
        // moved-but-identical selection still re-uses the same id and
        // the AI proposal stays anchored across `Try again` calls.
        const selectionId = `sel:${from}-${to}`;
        const fingerprint = `${selectionId}::${text}::${anchorRect.top}::${anchorRect.left}::${anchorRect.bottom}::${anchorRect.right}`;

        if (lastPublishedTextSelectionRef.current === fingerprint) {
          return;
        }

        lastPublishedTextSelectionRef.current = fingerprint;
        onSelectionTextChange({ selectionId, text, from, to, anchorRect });
      },
    );
    const scheduleAuxSelectionUpdate = useEffectEvent(
      (nextEditor: TipTapEditorInstance) => {
        if (auxSelectionFrameRef.current !== null) {
          cancelAnimationFrame(auxSelectionFrameRef.current);
        }
        auxSelectionFrameRef.current = requestAnimationFrame(() => {
          auxSelectionFrameRef.current = null;
          publishSelectedMdxComponent(nextEditor);
          publishTextSelection(nextEditor);
        });
      },
    );
    useEffect(
      () => () => {
        if (auxSelectionFrameRef.current !== null) {
          cancelAnimationFrame(auxSelectionFrameRef.current);
          auxSelectionFrameRef.current = null;
        }
      },
      [],
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
        // Leaving `shouldRerenderOnTransaction` at its default (`false`) is
        // essential: every keystroke dispatches a ProseMirror transaction, and
        // re-rendering the whole React tree on each one caused the caret to
        // lag behind during fast typing (especially Shift+Enter spam). The
        // toolbar stays reactive via `useEditorState` below, which subscribes
        // only to the handful of mark/node-active flags it actually reads.
        extensions: createEditorExtensions({
          codeBlock: CodeBlockWithNodeView,
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
            // Padding lives on `.ProseMirror` itself rather than the outer
            // wrapper so the entire visible editor surface — including the
            // gutter above the first block and below the last — emits
            // dragover events that prosemirror-dropcursor binds to. Without
            // this, the cursor near the document edges falls in wrapper
            // dead space and the drop indicator (and the drop itself)
            // silently no-ops, so users dragging an MDX block to the very
            // top of the document saw nothing happen.
            class:
              "prose max-w-none prose-p:leading-relaxed focus:outline-none px-8 py-8 min-h-[480px]",
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
          // Typing/deleting always moves the caret, so `onSelectionUpdate`
          // already fires for the same transaction. Running the aux updates
          // here too just doubles the per-keystroke sync work. Markdown
          // emission is the only thing unique to content changes.
          scheduleMarkdownEmission(editor);
        },
        onSelectionUpdate({ editor }) {
          syncSlashTrigger(editor);
          scheduleAuxSelectionUpdate(editor);
        },
        onBlur({ editor }) {
          // Blur is typically the user switching away to save or navigate —
          // flush any pending debounced markdown emission now so the host app
          // sees the latest content immediately.
          emitMarkdownNow(editor);
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

          // Any pending debounced emission from prior typing would fire with
          // stale content relative to the doc we're about to load — drop it.
          if (markdownEmitTimerRef.current !== null) {
            clearTimeout(markdownEmitTimerRef.current);
            markdownEmitTimerRef.current = null;
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
        applyInlinePreview(input) {
          if (!editor || editor.isDestroyed) {
            return null;
          }

          const docSize = editor.state.doc.content.size;

          if (input.from < 0 || input.to > docSize || input.from >= input.to) {
            return null;
          }

          // Bail when the user has typed in the previewed range since
          // the AI request started. The caller can fall back to
          // showing the proposal in the popover instead.
          if (typeof input.expectedText === "string") {
            const live = editor.state.doc.textBetween(
              input.from,
              input.to,
              "\n",
              "\n",
            );
            if (live !== input.expectedText) {
              return null;
            }
          }

          // Capture the original ProseMirror slice (with block-level
          // structure intact: bullet items, headings, paragraphs)
          // BEFORE we mutate the document. On reject we replace the
          // previewed range with this slice so formatting comes back,
          // not just the plain text.
          const originalSlice = editor.state.doc.slice(
            input.from,
            input.to,
            true,
          );

          const previewFrom = input.from;
          const previewTo = input.from + input.replacementText.length;

          editor
            .chain()
            .focus()
            .insertContentAt(
              { from: input.from, to: input.to },
              input.replacementText,
            )
            .setTextSelection({ from: previewFrom, to: previewTo })
            .run();

          const revert = () => {
            if (!editor || editor.isDestroyed) {
              return null;
            }
            const liveDocSize = editor.state.doc.content.size;
            if (previewFrom < 0 || previewTo > liveDocSize) {
              return null;
            }
            const tr = editor.state.tr.replace(
              previewFrom,
              previewTo,
              originalSlice,
            );
            // The slice may carry open node boundaries (e.g. when the
            // selection started mid-list-item), so the resulting
            // document size depends on what the slice contributes.
            // Compute the restored end from the resulting mapping.
            const restoredTo = tr.mapping.map(previewTo);
            editor.view.dispatch(tr);
            editor
              .chain()
              .focus()
              .setTextSelection({ from: previewFrom, to: restoredTo })
              .run();
            return {
              anchorRect: rectForRange(editor, previewFrom, restoredTo),
            };
          };

          return {
            previewFrom,
            previewTo,
            anchorRect: rectForRange(editor, previewFrom, previewTo),
            revert,
          };
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

    // Drag lifecycle for MDX component handles. Listening at the wrapper
    // catches dragstart only when it originates from a `[data-drag-handle]`
    // inside an MDX node view (Tiptap routes pointer-down on the handle into
    // a ProseMirror node drag). dragend / drop are listened on the document
    // because the events fire wherever the pointer lands, which can be
    // outside the editor wrapper for cancelled drags.
    useEffect(() => {
      const wrapper = editorWrapperRef.current;
      if (!wrapper) {
        return;
      }

      const onDragStart = (event: DragEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest("[data-drag-handle]")) {
          return;
        }
        setIsMdxDragging(true);
      };

      const stopDragging = () => setIsMdxDragging(false);

      wrapper.addEventListener("dragstart", onDragStart);
      document.addEventListener("dragend", stopDragging);
      document.addEventListener("drop", stopDragging);

      return () => {
        wrapper.removeEventListener("dragstart", onDragStart);
        document.removeEventListener("dragend", stopDragging);
        document.removeEventListener("drop", stopDragging);
      };
    }, []);

    // Auto-scroll the canvas pane while a drag is in flight so the user can
    // reorder past the visible viewport. The scroll target is the nearest
    // `[data-mdcms-editor-pane="canvas"]` ancestor; if there is none (e.g.
    // tests, embedded preview) the effect no-ops. dragover fires
    // continuously while the pointer moves, so we record the latest Y and
    // let a rAF loop convert proximity-to-edge into scroll velocity.
    useEffect(() => {
      if (!isMdxDragging) {
        return;
      }

      const wrapper = editorWrapperRef.current;
      if (!wrapper) {
        return;
      }

      const scrollContainer = wrapper.closest(
        '[data-mdcms-editor-pane="canvas"]',
      ) as HTMLElement | null;

      if (!scrollContainer) {
        return;
      }

      const SCROLL_ZONE_PX = 72;
      const MAX_SCROLL_PER_FRAME = 18;
      let pointerY: number | null = null;
      let rafId: number | null = null;

      const onDragOver = (event: DragEvent) => {
        pointerY = event.clientY;
      };

      const tick = () => {
        if (pointerY !== null) {
          const rect = scrollContainer.getBoundingClientRect();
          const distanceFromTop = pointerY - rect.top;
          const distanceFromBottom = rect.bottom - pointerY;

          if (distanceFromTop >= 0 && distanceFromTop < SCROLL_ZONE_PX) {
            const speed =
              MAX_SCROLL_PER_FRAME * (1 - distanceFromTop / SCROLL_ZONE_PX);
            scrollContainer.scrollTop -= speed;
          } else if (
            distanceFromBottom >= 0 &&
            distanceFromBottom < SCROLL_ZONE_PX
          ) {
            const speed =
              MAX_SCROLL_PER_FRAME * (1 - distanceFromBottom / SCROLL_ZONE_PX);
            scrollContainer.scrollTop += speed;
          }
        }
        rafId = requestAnimationFrame(tick);
      };

      document.addEventListener("dragover", onDragOver);
      rafId = requestAnimationFrame(tick);

      return () => {
        document.removeEventListener("dragover", onDragOver);
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }, [isMdxDragging]);

    useEffect(() => {
      if (!slashPickerOpen || !slashPickerCoords || !editor || !slashTrigger) {
        floatingRefs.setReference(null);
        return;
      }

      const editorWrapper = editorWrapperRef.current;

      if (!editorWrapper) {
        floatingRefs.setReference(null);
        return;
      }

      const contextElement = editorWrapper;

      floatingRefs.setReference(
        createSlashPickerVirtualReference({
          getAnchor: () =>
            resolveSlashPickerCoordsForEditor({
              editor,
              trigger: slashTrigger,
              container: editorWrapper,
            }) ?? slashPickerCoords,
          contextElement,
        }) as never,
      );
      updateFloating();
    }, [
      editor,
      floatingRefs,
      slashPickerCoords,
      slashPickerOpen,
      slashTrigger,
      updateFloating,
    ]);

    const toolbarActive = useEditorState({
      editor,
      selector: ({ editor: ed }) => {
        if (!ed) {
          return {
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            code: false,
            highlight: false,
            heading1: false,
            heading2: false,
            bulletList: false,
            orderedList: false,
            taskList: false,
            blockquote: false,
            codeBlock: false,
            link: false,
          };
        }
        return {
          bold: ed.isActive("bold"),
          italic: ed.isActive("italic"),
          underline: ed.isActive("underline"),
          strike: ed.isActive("strike"),
          code: ed.isActive("code"),
          highlight: ed.isActive("highlight"),
          heading1: ed.isActive("heading", { level: 1 }),
          heading2: ed.isActive("heading", { level: 2 }),
          bulletList: ed.isActive("bulletList"),
          orderedList: ed.isActive("orderedList"),
          taskList: ed.isActive("taskList"),
          blockquote: ed.isActive("blockquote"),
          codeBlock: ed.isActive("codeBlock"),
          link: ed.isActive("link"),
        };
      },
    });

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
        case "link": {
          if (!editor) return;
          const existingHref = editor.getAttributes("link").href as
            | string
            | undefined;
          setLinkInputValue(existingHref ?? "");
          setLinkPopoverOpen(true);
          return;
        }
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
      if (!toolbarActive) return false;
      switch (itemId) {
        case "bold":
          return toolbarActive.bold;
        case "italic":
          return toolbarActive.italic;
        case "underline":
          return toolbarActive.underline;
        case "strike":
          return toolbarActive.strike;
        case "code":
          return toolbarActive.code;
        case "highlight":
          return toolbarActive.highlight;
        case "heading1":
          return toolbarActive.heading1;
        case "heading2":
          return toolbarActive.heading2;
        case "bulletList":
          return toolbarActive.bulletList;
        case "orderedList":
          return toolbarActive.orderedList;
        case "taskList":
          return toolbarActive.taskList;
        case "blockquote":
          return toolbarActive.blockquote;
        case "codeBlock":
          return toolbarActive.codeBlock;
        case "link":
          return toolbarActive.link;
        default:
          return false;
      }
    };

    const submitLink = () => {
      if (!editor) return;
      const url = linkInputValue.trim();
      if (url) {
        editor.chain().focus().setLink({ href: url }).run();
      }
      setLinkPopoverOpen(false);
      setLinkInputValue("");
    };

    const removeLink = () => {
      if (!editor) return;
      editor.chain().focus().unsetLink().run();
      setLinkPopoverOpen(false);
      setLinkInputValue("");
    };

    const openLink = () => {
      const url = linkInputValue.trim();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
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

    const slashPicker = slashPickerOpen ? (
      <div
        ref={floatingRefs.setFloating}
        data-mdcms-mdx-picker-source="slash"
        style={{
          ...floatingStyles,
          width: "min(28rem, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 24px)",
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
      <div
        ref={editorWrapperRef}
        // While a drag is in flight, pin selection off across the editor and
        // its descendants so the pointer doesn't paint a text selection over
        // sibling block content as it sweeps over them. `pointer-events`
        // stays on so dragover continues to fire and auto-scroll works.
        className={cn(
          "relative",
          isMdxDragging && "select-none [&_*]:select-none",
        )}
      >
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
          <div className="border-b border-border bg-background-subtle">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5">
              {toolbar.primaryGroups.map((group, groupIndex) => (
                <div key={group.id} className="flex items-center gap-1.5">
                  {groupIndex > 0 ? (
                    <Separator orientation="vertical" className="mr-1 h-6" />
                  ) : null}
                  {group.items.map((item) => {
                    const toolbarButton = (
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
                    );

                    if (item.id === "link") {
                      return (
                        <Popover
                          key={item.id}
                          open={linkPopoverOpen}
                          onOpenChange={(open) => {
                            setLinkPopoverOpen(open);
                            if (!open) setLinkInputValue("");
                          }}
                        >
                          <PopoverTrigger
                            asChild
                            onClick={(e) => {
                              if (
                                item.availability === "enabled" &&
                                !isEditorReadOnly
                              ) {
                                e.preventDefault();
                                triggerToolbarItem(item.id);
                              }
                            }}
                          >
                            <div>{toolbarButton}</div>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-1.5"
                            side="bottom"
                            align="start"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                          >
                            <div className="flex items-center gap-1">
                              <input
                                type="url"
                                value={linkInputValue}
                                onChange={(e) =>
                                  setLinkInputValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    submitLink();
                                  }
                                  if (e.key === "Escape") {
                                    setLinkPopoverOpen(false);
                                    setLinkInputValue("");
                                  }
                                }}
                                placeholder="Paste a link..."
                                className="h-7 w-48 rounded border-none bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                              />
                              <Separator
                                orientation="vertical"
                                className="mx-0.5 h-5"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Apply link"
                                onClick={submitLink}
                              >
                                <CornerDownLeft className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Open link in new tab"
                                disabled={!linkInputValue.trim()}
                                onClick={openLink}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Remove link"
                                onClick={removeLink}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    }

                    return (
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
                        {toolbarButton}
                      </div>
                    );
                  })}
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-mdcms-mdx-collapse-all={
                    collapseController.snapshot.globalState ?? "expanded"
                  }
                  onClick={() => collapseController.toggleGlobalCollapse()}
                  title={
                    collapseController.snapshot.globalState === "collapsed"
                      ? "Expand all components"
                      : "Collapse all components"
                  }
                  aria-label={
                    collapseController.snapshot.globalState === "collapsed"
                      ? "Expand all components"
                      : "Collapse all components"
                  }
                  className="ml-auto text-foreground-muted hover:text-foreground"
                >
                  {collapseController.snapshot.globalState === "collapsed" ? (
                    <>
                      <ChevronsUpDown className="h-4 w-4" />
                      <span>Expand all</span>
                    </>
                  ) : (
                    <>
                      <ChevronsDownUp className="h-4 w-4" />
                      <span>Collapse all</span>
                    </>
                  )}
                </Button>
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

          <div className="bg-transparent">
            <MdxComponentCollapseProvider
              snapshot={collapseController.snapshot}
            >
              <EditorContent editor={editor} />
            </MdxComponentCollapseProvider>
          </div>
        </div>

        {slashPicker && typeof document !== "undefined"
          ? createPortal(slashPicker, document.body)
          : null}
      </div>
    );
  },
);
