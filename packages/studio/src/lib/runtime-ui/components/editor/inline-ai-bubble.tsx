"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
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
  const { selection, enabled, ...panelProps } = props;
  const [open, setOpen] = useState(false);
  const lastSelectionIdRef = useRef<string | null>(null);
  const panelSelection = selection
    ? { id: selection.selectionId, text: selection.text }
    : null;

  // When the selection changes to a new range, drop any open panel so
  // the bubble re-anchors to the fresh range. When the selection
  // disappears entirely, close the panel; the panel state machine
  // ignores requests without a selection anyway.
  useEffect(() => {
    if (!selection) {
      lastSelectionIdRef.current = null;
      setOpen(false);
      return;
    }

    if (lastSelectionIdRef.current !== selection.selectionId) {
      lastSelectionIdRef.current = selection.selectionId;
      setOpen(false);
    }
  }, [selection]);

  const reference = useMemo(() => {
    if (!selection) {
      return null;
    }
    return createVirtualReference(selection.anchorRect);
  }, [selection]);

  const { refs, floatingStyles } = useFloating({
    placement: "top-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(reference as never);
  }, [refs, reference]);

  if (!enabled || !selection) {
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
          className={cn("z-50 w-80")}
        >
          <InlineAiPanel
            {...panelProps}
            selection={panelSelection}
            className="shadow-xl"
          />
        </div>
      )}
    </>
  );
}
