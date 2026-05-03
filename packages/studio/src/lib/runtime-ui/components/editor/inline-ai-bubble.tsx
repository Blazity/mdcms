"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
import { Sparkles } from "lucide-react";

import { InlineAiPanel, type InlineAiPanelProps } from "./inline-ai-panel.js";
import type { TipTapEditorSelectionInfo } from "./tiptap-editor.js";
import { Button } from "../ui/button.js";
import { cn } from "../../lib/utils.js";

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

function createVirtualReference(rect: AnchorRect) {
  return {
    getBoundingClientRect(): DOMRect {
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
    },
  };
}

/**
 * Floating "Ask AI" affordance positioned at the selection's anchor
 * rect. The trigger button shows next to the selection; clicking it
 * opens the InlineAiPanel as a popover anchored to the same selection.
 *
 * Mounting/unmounting is driven by the selection: when the user
 * clears the selection (or moves the caret without selecting), the
 * trigger collapses. The panel itself stays open if the user has an
 * in-flight or completed proposal — closing it requires Reject /
 * Dismiss / explicit close.
 */
export function InlineAiBubble(props: InlineAiBubbleProps) {
  const { selection, enabled, appearDelayMs = 200, ...panelProps } = props;
  const [open, setOpen] = useState(false);
  // The "settled" selection drives the bubble's visible state. While the
  // user is actively extending a selection (drag, shift+arrow), the
  // upstream `selection` prop changes on every animation frame, but
  // `settledSelection` only catches up after `appearDelayMs` of quiet —
  // so the trigger doesn't flash and re-anchor mid-drag.
  const [settledSelection, setSettledSelection] =
    useState<TipTapEditorSelectionInfo | null>(null);
  const lastSelectionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selection) {
      // Clear immediately — no point delaying the disappearance.
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

  // When the settled selection changes to a new range, drop any open
  // panel so the bubble re-anchors to the fresh range. When the
  // selection disappears entirely, close the panel; the panel state
  // machine ignores requests without a selection anyway.
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
    return createVirtualReference(settledSelection.anchorRect);
  }, [settledSelection]);

  const { refs, floatingStyles } = useFloating({
    placement: "top-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          // Cap the popover so it always fits in the viewport — the
          // panel's inner action list scrolls when content overflows.
          elements.floating.style.maxHeight = `${Math.max(availableHeight, 240)}px`;
        },
      }),
    ],
  });

  useEffect(() => {
    refs.setReference(reference as never);
  }, [refs, reference]);

  if (!enabled || !settledSelection) {
    return null;
  }

  return (
    <>
      {!open ? (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          data-mdcms-ai-bubble="trigger"
          className="z-50"
        >
          <Button
            type="button"
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="inline-ai-bubble-trigger"
            className="shadow-md"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden /> Ask AI
          </Button>
        </div>
      ) : (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          data-mdcms-ai-bubble="panel"
          className={cn("z-50 w-[22rem]")}
        >
          <InlineAiPanel
            {...panelProps}
            selection={panelSelection}
            onClose={() => setOpen(false)}
            className="shadow-xl"
          />
        </div>
      )}
    </>
  );
}
