"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { autoUpdate, shift, useFloating } from "@floating-ui/react-dom";
import { Sparkles } from "lucide-react";

import { InlineAiPanel, type InlineAiPanelProps } from "./inline-ai-panel.js";
import type { TipTapEditorSelectionInfo } from "./tiptap-editor.js";
import { Button } from "../ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";

export type InlineAiBubbleProps = Omit<InlineAiPanelProps, "selection"> & {
  selection: TipTapEditorSelectionInfo | null;
  /**
   * When false, the bubble is suppressed entirely (e.g. caller lacks
   * `ai:use`). The trigger and panel are both hidden.
   */
  enabled: boolean;
  /**
   * Milliseconds the selection must stay stable before the trigger
   * appears. Avoids the bubble flashing while the user is still
   * dragging to extend a selection. Default 200ms; set to 0 to
   * disable (useful for tests).
   */
  appearDelayMs?: number;
};

type AnchorRect = TipTapEditorSelectionInfo["anchorRect"];

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
 * Floating "Ask AI" affordance positioned at the selection's anchor
 * rect. The trigger button is anchored to the selection via
 * floating-ui (the selection is a virtual element with no DOM node),
 * and the popover itself is rendered by Radix's Popover primitive so
 * we get Esc/click-outside/focus-trap/ARIA wiring for free.
 *
 * Mounting/unmounting is driven by the (debounced) selection: when
 * the user clears the selection the trigger collapses; when the
 * selection moves to a new range we close any open popover so the
 * next click re-anchors to the fresh range.
 */
export function InlineAiBubble(props: InlineAiBubbleProps) {
  const { selection, enabled, appearDelayMs = 200, ...panelProps } = props;
  const [open, setOpen] = useState(false);
  // The "settled" selection drives the bubble's visible state. While
  // the user is actively extending a selection (drag, shift+arrow),
  // the upstream `selection` prop changes on every animation frame,
  // but `settledSelection` only catches up after `appearDelayMs` of
  // quiet — so the trigger doesn't flash and re-anchor mid-drag.
  const [settledSelection, setSettledSelection] =
    useState<TipTapEditorSelectionInfo | null>(null);
  const lastSelectionIdRef = useRef<string | null>(null);

  useEffect(() => {
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
  }, [selection, appearDelayMs]);

  const panelSelection = settledSelection
    ? { id: settledSelection.selectionId, text: settledSelection.text }
    : null;

  // Close the popover when the underlying range changes so the next
  // open re-anchors to the fresh selection. The Popover state machine
  // handles Esc/click-outside on its own.
  useEffect(() => {
    if (!settledSelection) {
      lastSelectionIdRef.current = null;
      setOpen(false);
      return;
    }

    if (lastSelectionIdRef.current !== settledSelection.selectionId) {
      lastSelectionIdRef.current = settledSelection.selectionId;
      setOpen(false);
    }
  }, [settledSelection]);

  const reference = useMemo(() => {
    if (!settledSelection) {
      return null;
    }
    const rect = settledSelection.anchorRect;
    return {
      getBoundingClientRect: () => rectToBoundingClientRect(rect),
    };
  }, [settledSelection]);

  const { refs, floatingStyles } = useFloating({
    placement: "top-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(reference as never);
  }, [refs, reference]);

  if (!enabled || !settledSelection) {
    return null;
  }

  return (
    <div ref={refs.setFloating} style={floatingStyles} className="z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            data-testid="inline-ai-bubble-trigger"
            aria-label="Open AI transform menu"
            className="shadow-md"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden /> Ask AI
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={6}
          collisionPadding={8}
          data-mdcms-ai-bubble="panel"
          className="w-[22rem] p-0"
          // The panel renders its own border/background; cancel the
          // default popover-content padding/sizing so the panel fills.
        >
          <InlineAiPanel
            {...panelProps}
            selection={panelSelection}
            onClose={() => setOpen(false)}
            className="border-0 shadow-none"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
