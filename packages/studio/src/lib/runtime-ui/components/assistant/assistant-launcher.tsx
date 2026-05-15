"use client";

import { cn } from "../../lib/utils.js";
import { useAssistant, useAssistantMounted } from "./assistant-context.js";
import { SparkleMark } from "./sparkle-mark.js";

/**
 * Topbar "Ask AI" trigger. Toggles the rail open / closed and reflects
 * its current state visually so the user always knows whether the rail
 * is mounted on the right.
 */
export function AssistantLauncher({ className }: { className?: string }) {
  const mounted = useAssistantMounted();
  const assistant = useAssistant();
  if (!mounted) return null;
  const isOpen = assistant.isOpen;
  const onClick = () => {
    if (isOpen) {
      assistant.close();
    } else {
      assistant.openRail();
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isOpen}
      aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 font-mono text-[12px] font-semibold transition-colors",
        isOpen
          ? "border-vibrant-green/40 bg-vibrant-green/10 text-vibrant-green"
          : "border-border text-foreground hover:bg-muted",
        className,
      )}
    >
      <SparkleMark size={12} className="text-vibrant-green" />
      <span>Assistant</span>
      <span className="rounded-sm bg-muted px-1 py-px font-mono text-[10px] font-medium text-foreground-muted">
        ⌘ K
      </span>
    </button>
  );
}
