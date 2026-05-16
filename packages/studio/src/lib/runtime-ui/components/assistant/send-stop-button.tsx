"use client";

import { Send } from "lucide-react";

import { cn } from "../../lib/utils.js";

export type SendStopButtonProps = {
  /** True while a chat turn is in flight. Toggles to the Stop face. */
  pending: boolean;
  /** True when the composer has at least one non-whitespace character. */
  hasDraft: boolean;
  onSend: () => void;
  onStop: () => void;
};

/**
 * Composer affordance that cross-fades between Send and Stop. The shell
 * (size, padding, radius) stays identical across states — only the
 * background tone and the inner glyph swap. Send is the primary blue
 * action; Stop is a dark surface so the user reads "now I'm interrupting"
 * rather than "now I'm sending." The Stop face accepts ⎋ via the
 * composer-level key handler.
 */
export function SendStopButton({
  pending,
  hasDraft,
  onSend,
  onStop,
}: SendStopButtonProps) {
  const disabled = !pending && !hasDraft;
  return (
    <button
      type="button"
      onClick={pending ? onStop : hasDraft ? onSend : undefined}
      disabled={disabled}
      aria-label={pending ? "Stop generating" : "Send"}
      title={pending ? "Stop generating (Esc)" : "Send (⌘↵)"}
      className={cn(
        "relative inline-flex min-w-20 items-center justify-center gap-1.5 rounded px-3 py-1 font-mono text-[11px] font-semibold transition-colors",
        pending
          ? "bg-foreground text-background hover:bg-foreground/90"
          : hasDraft
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "cursor-not-allowed bg-muted text-foreground-muted",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 transition-opacity duration-150",
          pending ? "pointer-events-none absolute opacity-0" : "opacity-100",
        )}
      >
        <Send className="size-3" aria-hidden /> Send
        <span className="font-mono text-[9px] opacity-70">⌘↵</span>
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 transition-opacity duration-150",
          pending ? "opacity-100" : "pointer-events-none absolute opacity-0",
        )}
      >
        <span
          aria-hidden
          className="inline-block size-2 rounded-[1px] bg-background"
        />
        Stop
      </span>
    </button>
  );
}
