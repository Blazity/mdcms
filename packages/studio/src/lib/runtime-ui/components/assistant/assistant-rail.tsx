"use client";

import { cn } from "../../lib/utils.js";
import { useAssistant } from "./assistant-context.js";
import { AssistantPanel } from "./assistant-panel.js";

/**
 * Persistent right-side rail. Two visible modes:
 *   - rail        →  fixed 420px wide column anchored to the right edge.
 *   - fullscreen  →  spans the full main area (sidebar stays visible),
 *                    hides the editor behind it.
 *
 * The rail is mounted at the layout level so its visibility persists
 * across page navigation, keeping conversation state attached to the
 * assistant context rather than to the route.
 */
export function AssistantRail({
  sidebarCollapsed,
}: {
  /** Width of the studio sidebar in px. The rail uses it to position the fullscreen overlay. */
  sidebarCollapsed: boolean;
}) {
  const assistant = useAssistant();
  if (!assistant.isOpen) return null;

  const sidebarOffset = sidebarCollapsed ? 64 : 240;

  if (assistant.isFullscreen) {
    return (
      <aside
        aria-label="AI assistant — fullscreen"
        className="fixed inset-y-0 right-0 z-40 border-l border-divider/40 bg-card shadow-[0_24px_60px_-16px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_60px_-16px_rgba(0,0,0,0.6)]"
        style={{ left: sidebarOffset }}
      >
        <AssistantPanel hideClose={false} variant="fullscreen" />
      </aside>
    );
  }

  return (
    <aside
      aria-label="AI assistant"
      className="fixed inset-y-0 right-0 z-40 w-[420px] border-l border-divider/40 bg-card shadow-[-12px_0_40px_-20px_rgba(0,0,0,0.18)]"
    >
      <AssistantPanel hideClose={false} hideThreadList variant="rail" />
    </aside>
  );
}

/**
 * Spacer that reserves the right margin on `<main>` while the rail is
 * docked, so the editor doesn't slide under it. The fullscreen mode
 * doesn't need a spacer because the rail sits on top of the editor.
 */
export function useAssistantMainPadding(): string {
  const assistant = useAssistant();
  return cn(
    "transition-[padding] duration-200",
    assistant.isOpen && !assistant.isFullscreen ? "pr-[420px]" : "pr-0",
  );
}
