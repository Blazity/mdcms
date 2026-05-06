"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react-dom";
import { Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";

import { InlineAiPanel } from "./inline-ai-panel.js";
import type { StudioAiInlineAction } from "../../../ai-route-api.js";
import {
  useInlineAiTransform,
  type InlineAiAppliedSignal,
  type InlineAiTransformOptions,
} from "../../hooks/use-inline-ai-transform.js";
import { intentForInlineAction } from "./inline-ai-panel.js";
import type { StudioAiRouteApi } from "../../../ai-route-api.js";
import type {
  TipTapEditorAnchorRect,
  TipTapEditorHandle,
  TipTapEditorSelectionInfo,
} from "./tiptap-editor.js";
import { Button } from "../ui/button.js";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover.js";
import { cn } from "../../lib/utils.js";

export type InlineAiBubbleProps = {
  api: StudioAiRouteApi;
  options: InlineAiTransformOptions;
  selection: TipTapEditorSelectionInfo | null;
  /**
   * When false, the bubble is suppressed entirely (e.g. caller lacks
   * `ai:use`). The trigger and panel are both hidden.
   */
  enabled: boolean;
  /**
   * Imperative handle to the TipTap editor. Used to apply / revert the
   * inline preview that appears inside the editor when a proposal
   * arrives.
   */
  editorRef: React.RefObject<TipTapEditorHandle | null>;
  onApplied?: (signal: InlineAiAppliedSignal) => void;
  /**
   * Milliseconds the selection must stay stable before the trigger
   * appears. Avoids the bubble flashing while the user is still
   * dragging to extend a selection. Default 200ms; set to 0 to
   * disable (useful for tests).
   */
  appearDelayMs?: number;
};

type AnchorRect = TipTapEditorAnchorRect;

type PreviewState = {
  proposal: NonNullable<
    Extract<
      ReturnType<typeof useInlineAiTransform>["state"],
      { status: "proposal" }
    >
  >["proposal"];
  originalText: string;
  previewFrom: number;
  previewTo: number;
  anchorRect: AnchorRect;
};

function rectToBoundingClientRect(rect: AnchorRect): DOMRect {
  const { top, left, right, bottom, width, height } = rect;
  return {
    x: left,
    y: top,
    top,
    left,
    right,
    bottom,
    width,
    height,
    toJSON: () => rect,
  } as DOMRect;
}

/**
 * Floating "Edit with AI" affordance positioned at the selection's
 * anchor rect. Drives a three-stage UX:
 *
 * 1. **Trigger** — a small pill at the selection. Click to open the
 *    action picker.
 * 2. **Picker** — Radix popover with the action list + Generate
 *    button. Esc / click-outside dismisses to stage 1.
 * 3. **Preview** — when a proposal arrives, the picker closes and the
 *    proposed replacement is applied directly inline in the editor.
 *    A small Accept / Reject affordance hovers over the replaced
 *    range.
 *      * Accept → call the apply endpoint, then settle the editor
 *        from the server response.
 *      * Reject → revert the inline replacement, restore the
 *        original selection, and reopen the picker so the user can
 *        try a different action or detail.
 */
export function InlineAiBubble(props: InlineAiBubbleProps) {
  const {
    selection,
    enabled,
    appearDelayMs = 200,
    api,
    options,
    editorRef,
    onApplied,
  } = props;

  // Picker state (lifted out of InlineAiPanel so it survives a
  // close/reopen during the reject → reopen flow).
  const [activeAction, setActiveAction] =
    useState<StudioAiInlineAction>("rewrite");
  const [detail, setDetail] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  // Virtual anchor used by Radix to position the picker popover. The
  // pill itself sits above the selection (via floating-ui), but the
  // user wants the dropdown to always appear below the highlighted
  // text so it never covers it. The anchor is a zero-height line at
  // the bottom edge of the selection's rect; with `side="bottom"`
  // Radix opens the popover just below the selection.
  const popoverAnchorSelectionRef = useRef<TipTapEditorSelectionInfo | null>(
    null,
  );
  const popoverAnchorRef = useRef<{ getBoundingClientRect(): DOMRect }>({
    getBoundingClientRect: () => {
      const current = popoverAnchorSelectionRef.current;
      if (!current) {
        return new DOMRect();
      }
      const rect = current.anchorRect;
      return {
        x: rect.left,
        y: rect.bottom,
        top: rect.bottom,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: 0,
        toJSON: () => rect,
      } as DOMRect;
    },
  });

  // The "settled" selection drives the bubble's visible state. While
  // the user is actively extending a selection (drag, shift+arrow),
  // the upstream `selection` prop changes on every animation frame,
  // but `settledSelection` only catches up after `appearDelayMs` of
  // quiet — so the trigger doesn't flash and re-anchor mid-drag.
  const [settledSelection, setSettledSelection] =
    useState<TipTapEditorSelectionInfo | null>(null);
  const lastSelectionIdRef = useRef<string | null>(null);

  // Mirror the latest settled selection so the popover anchor's
  // virtualRef can read the current rect on demand without React
  // re-rendering the ref object.
  useEffect(() => {
    popoverAnchorSelectionRef.current = settledSelection;
  }, [settledSelection]);

  useEffect(() => {
    // Skip debounce while the editor is showing a preview — the
    // preview replaces selection text and the editor publishes a new
    // selection rooted at the replacement. We don't want to retract
    // the bubble during that internal state shuffle.
    if (preview) {
      return;
    }

    if (!selection) {
      setSettledSelection(null);
      return;
    }

    if (appearDelayMs <= 0) {
      setSettledSelection(selection);
      return;
    }

    const handle = setTimeout(() => {
      setSettledSelection(selection);
    }, appearDelayMs);

    return () => clearTimeout(handle);
  }, [selection, appearDelayMs, preview]);

  // Close the picker and clear preview state when the underlying
  // range changes mid-flow. Each fresh selection re-anchors and
  // resets the picker.
  useEffect(() => {
    if (preview) {
      return;
    }

    if (!settledSelection) {
      lastSelectionIdRef.current = null;
      setPickerOpen(false);
      return;
    }

    if (lastSelectionIdRef.current !== settledSelection.selectionId) {
      lastSelectionIdRef.current = settledSelection.selectionId;
      setPickerOpen(false);
    }
  }, [settledSelection, preview]);

  const transform = useInlineAiTransform({
    api,
    options,
    selection: settledSelection
      ? {
          id: settledSelection.selectionId,
          text: settledSelection.text,
        }
      : null,
    onApplied,
  });

  // When the hook produces a proposal, lift it out of the popover and
  // into the editor as an inline preview. The picker closes; the
  // bubble switches to the Accept / Reject stage.
  useEffect(() => {
    if (transform.state.status !== "proposal") {
      return;
    }
    if (preview) {
      return;
    }
    if (!editorRef.current || !settledSelection) {
      return;
    }

    const operation = transform.state.proposal.operations.find(
      (op) => op.op === "replace_selection",
    );
    if (!operation || operation.op !== "replace_selection") {
      return;
    }

    const result = editorRef.current.applyInlinePreview({
      from: settledSelection.from,
      to: settledSelection.to,
      replacementText: operation.replacementText,
      expectedText: settledSelection.text,
    });

    if (!result) {
      // Document mutated under us. Leave the popover open so the user
      // can read the error/proposal panel and retry.
      return;
    }

    setPreview({
      proposal: transform.state.proposal,
      originalText: settledSelection.text,
      previewFrom: result.previewFrom,
      previewTo: result.previewTo,
      anchorRect: result.anchorRect,
    });
    setPickerOpen(false);
  }, [transform.state, preview, editorRef, settledSelection]);

  // After accept (apply succeeds), drop the preview and let the
  // bubble fall back to its trigger pill at the new range.
  useEffect(() => {
    if (transform.state.status === "applied" && preview) {
      setPreview(null);
    }
  }, [transform.state, preview]);

  // Accept → call apply through the hook. The page-level `onApplied`
  // will refresh the editor body from the server response.
  const handleAccept = useCallback(() => {
    void transform.accept();
  }, [transform]);

  // Reject → revert the inline replacement, drop the proposal, and
  // reopen the picker with the original selection so the user can try
  // another action or detail.
  const handleReject = useCallback(() => {
    if (!preview) {
      return;
    }
    const editor = editorRef.current;
    if (editor) {
      editor.revertInlinePreview({
        previewFrom: preview.previewFrom,
        previewTo: preview.previewTo,
        originalText: preview.originalText,
      });
    }
    setPreview(null);
    void transform.reject();
    // Open the picker after the revert so the user can adjust their
    // request without losing context. The activeAction/detail state
    // we held above is preserved — they didn't type anything new.
    setPickerOpen(true);
  }, [preview, transform, editorRef]);

  const reference = useMemo(() => {
    const rect = preview
      ? preview.anchorRect
      : (settledSelection?.anchorRect ?? null);
    if (!rect) {
      return null;
    }
    return {
      getBoundingClientRect: () => rectToBoundingClientRect(rect),
    };
  }, [preview, settledSelection]);

  const { refs, floatingStyles } = useFloating({
    placement: "top-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      // 10px gap between the pill and the selection so it doesn't
      // crowd the highlighted range.
      offset(10),
      // Flip below the selection when there isn't enough headroom
      // (e.g., selection sits right under a heading), and pad the
      // viewport so the pill never hugs the screen edge.
      flip({ padding: 12 }),
      shift({ padding: 8 }),
    ],
  });

  useEffect(() => {
    refs.setReference(reference as never);
  }, [refs, reference]);

  const handleSubmit = useCallback(() => {
    void transform.request(intentForInlineAction(activeAction, detail.trim()));
  }, [transform, activeAction, detail]);

  if (!enabled) {
    return null;
  }

  // Stage 3: inline preview is showing — render Accept / Reject pill.
  if (preview) {
    const isApplying = transform.state.status === "applying";
    return (
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        data-mdcms-ai-bubble="preview"
        className="z-50"
      >
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow-lg">
          <Button
            type="button"
            size="sm"
            onClick={handleAccept}
            disabled={isApplying}
            data-testid="inline-ai-preview-accept"
            aria-label="Accept AI replacement"
            className="h-7 px-2.5"
          >
            {isApplying ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            {isApplying ? "Applying" : "Accept"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleReject}
            disabled={isApplying}
            data-testid="inline-ai-preview-reject"
            aria-label="Reject AI replacement and reopen picker"
            className="h-7 px-2.5"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleReject}
            disabled={isApplying}
            aria-label="Discard preview"
            className="h-7 px-2 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  // Stages 1 & 2: trigger pill + picker popover. The pill anchors to
  // the (debounced) original selection.
  if (!settledSelection) {
    return null;
  }

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      data-mdcms-ai-bubble="trigger"
      className="z-50"
    >
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        {/*
          Decouple the popover's anchor from the trigger pill: the
          pill sits above the selection (so it doesn't cover the
          selected text), but the picker dropdown is anchored to the
          bottom edge of the selection so it always opens below the
          highlight.
        */}
        <PopoverAnchor
          virtualRef={popoverAnchorRef as React.RefObject<HTMLElement>}
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="inline-ai-bubble-trigger"
            aria-label="Open AI edit menu"
            // Refined floating pill: glassy card surface + primary
            // tinted ring + soft glow. Reads as an AI affordance
            // without the visual weight of a primary action button.
            // Radix flips `data-state` to "open" while the popover is
            // mounted; keeping the pill in the DOM keeps it as the
            // floating-ui anchor while we hide it visually.
            className={cn(
              "group inline-flex h-8 items-center gap-1.5 rounded-full",
              "border border-primary/30 bg-card/90 px-3 text-xs font-medium text-foreground",
              "shadow-lg shadow-primary/10 backdrop-blur-sm",
              "transition-all duration-150",
              "hover:border-primary/60 hover:bg-card hover:shadow-primary/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "data-[state=open]:pointer-events-none data-[state=open]:opacity-0",
            )}
          >
            <Sparkles
              className="h-3.5 w-3.5 text-primary transition-transform duration-150 group-hover:scale-110"
              aria-hidden
            />
            Edit with AI
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={8}
          data-mdcms-ai-bubble="panel"
          className="w-[22rem] p-0"
        >
          <InlineAiPanel
            transform={transform}
            hasSelection={Boolean(settledSelection)}
            activeAction={activeAction}
            onActiveActionChange={setActiveAction}
            detail={detail}
            onDetailChange={setDetail}
            onSubmit={handleSubmit}
            onClose={() => setPickerOpen(false)}
            // The proposal preview lives in the editor now — hide the
            // in-popover proposal/applying/applied views so we don't
            // double up the UI.
            hideProposalResult
            className="border-0 shadow-none"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
