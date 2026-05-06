"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  AlertCircle,
  ChevronRight,
  Eraser,
  Expand,
  Loader2,
  PenLine,
  RefreshCw,
  Scissors,
  Search,
  Smile,
  Sparkles,
  X,
} from "lucide-react";

import { type StudioAiInlineAction } from "../../../ai-route-api.js";
import {
  type InlineAiState,
  type InlineAiTransformIntent,
  type UseInlineAiTransformResult,
} from "../../hooks/use-inline-ai-transform.js";
import { Button } from "../ui/button.js";
import { cn } from "../../lib/utils.js";

type InlineAiActionMeta = {
  id: StudioAiInlineAction;
  label: string;
  icon: typeof Sparkles;
  flyout: boolean;
};

const INLINE_AI_ACTIONS: ReadonlyArray<InlineAiActionMeta> = [
  { id: "rewrite", label: "Rewrite", icon: PenLine, flyout: false },
  { id: "shorten", label: "Shorten", icon: Scissors, flyout: false },
  { id: "expand", label: "Expand", icon: Expand, flyout: false },
  { id: "change_tone", label: "Change tone", icon: Smile, flyout: true },
  { id: "fix_grammar", label: "Fix grammar", icon: Eraser, flyout: false },
  {
    id: "improve_clarity",
    label: "Improve clarity",
    icon: Search,
    flyout: false,
  },
];

type TonePreset = {
  id: string;
  label: string;
  detail: string;
};

const TONE_PRESETS: ReadonlyArray<TonePreset> = [
  { id: "formal", label: "More formal", detail: "more formal" },
  { id: "casual", label: "More casual", detail: "more casual" },
  {
    id: "matter_of_fact",
    label: "Matter-of-fact",
    detail: "matter-of-fact, no flourish",
  },
  { id: "confident", label: "Confident", detail: "confident, no hedging" },
  { id: "friendly", label: "Friendly", detail: "friendly, warm" },
  { id: "technical", label: "Technical", detail: "technical, precise" },
];

export type InlineAiPanelProps = {
  /**
   * Transform state machine. Lifted out of the panel so the bubble
   * can react to proposal/applied transitions and drive the inline
   * editor preview from outside.
   */
  transform: UseInlineAiTransformResult;
  hasSelection: boolean;
  /**
   * Fired when the user picks an action (or a tone, for change_tone).
   * The panel itself does not call `transform.request` — the bubble
   * owns that so it can also drive editor-side preview state.
   */
  onSubmit: (intent: InlineAiTransformIntent) => void;
  onClose?: () => void;
  /**
   * Suppress the in-popover proposal preview when an external surface
   * (e.g. the editor's inline preview) is already rendering it.
   */
  hideProposalResult?: boolean;
  className?: string;
};

export function intentForInlineAction(
  action: StudioAiInlineAction,
  detail: string,
): InlineAiTransformIntent {
  if (action === "change_tone") {
    return { action, tone: detail };
  }

  return { action };
}

function StateMessage(props: {
  tone: "info" | "warn" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        props.tone === "info" &&
          "border-border bg-muted/40 text-muted-foreground",
        props.tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        props.tone === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="leading-snug">{props.children}</span>
    </div>
  );
}

export type InlineAiResultBodyProps = {
  state: InlineAiState;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
};

/**
 * Pure render of the proposal-result region. Exported so tests can
 * verify per-state markup without driving the panel state machine.
 *
 * In the new design (Option A) the picker fires actions on click and
 * relinquishes control to the editor's inline preview. The panel only
 * reaches this body for the loading/error/stale/forbidden/empty/
 * validation states, plus proposal/applying/applied when the bubble
 * does not mask them.
 */
export function InlineAiResultBody(props: InlineAiResultBodyProps) {
  const { state, onAccept, onReject, onRetry } = props;

  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Generating…
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <StateMessage tone="info">
        AI did not return a usable proposal. Try a different action.
      </StateMessage>
    );
  }

  if (state.status === "validation_invalid") {
    const errorList =
      state.proposal.validation.status === "invalid"
        ? state.proposal.validation.errors
        : [];
    return (
      <div className="space-y-2">
        <StateMessage tone="warn">
          The proposal failed validation and cannot be applied.
        </StateMessage>
        {errorList.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {errorList.map((entry, index) => (
              <li key={index}>
                <span className="font-medium">{entry.code}</span> —{" "}
                {entry.message}
              </li>
            ))}
          </ul>
        ) : null}
        <DismissRetry onRetry={onRetry} onDismiss={onReject} />
      </div>
    );
  }

  if (state.status === "applying") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Applying…
      </div>
    );
  }

  if (state.status === "applied") {
    return (
      <StateMessage tone="info">
        Proposal applied. Editor draft updated.
      </StateMessage>
    );
  }

  if (state.status === "stale") {
    return (
      <div className="space-y-2">
        <StateMessage tone="warn">{state.message}</StateMessage>
        <DismissRetry onRetry={onRetry} onDismiss={onReject} />
      </div>
    );
  }

  if (state.status === "forbidden") {
    return (
      <StateMessage tone="error">
        AI is unavailable: {state.message}
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2">
        <StateMessage tone="error">
          <span>
            <span className="font-medium">{state.code}</span> — {state.message}
          </span>
        </StateMessage>
        <DismissRetry onRetry={onRetry} onDismiss={onReject} />
      </div>
    );
  }

  // proposal — fallback display when the bubble is not masking. In
  // the new design the editor inline preview replaces this; this is
  // only rendered if a caller forgets to set hideProposalResult.
  if (state.status === "proposal") {
    return (
      <div className="space-y-2">
        <StateMessage tone="info">
          Proposal ready — awaiting Accept / Reject.
        </StateMessage>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={onAccept} className="h-7 px-2.5">
            Accept
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onReject}
            className="h-7 px-2.5"
          >
            Reject
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

function DismissRetry(props: { onRetry: () => void; onDismiss: () => void }) {
  return (
    <div className="flex gap-1.5">
      <Button size="sm" onClick={props.onRetry} className="h-7 px-2.5">
        <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
        Try again
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={props.onDismiss}
        className="h-7 px-2.5 text-muted-foreground"
      >
        Dismiss
      </Button>
    </div>
  );
}

function ToneFlyout(props: { onPick: (preset: TonePreset) => void }) {
  return (
    <div
      role="menu"
      aria-label="Target tone"
      data-testid="inline-ai-tone-flyout"
      className={cn(
        "absolute left-[calc(100%+6px)] top-[-6px] z-[65] w-[200px]",
        "rounded-lg border border-border bg-popover p-1.5 shadow-lg",
        "animate-in fade-in-0 zoom-in-95",
      )}
    >
      <div className="px-2 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        Pick a tone
      </div>
      {TONE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="menuitem"
          onClick={() => props.onPick(preset)}
          data-testid={`inline-ai-tone-${preset.id}`}
          className={cn(
            "block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium",
            "text-foreground transition-colors hover:bg-accent",
            "focus-visible:outline-none focus-visible:bg-accent",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function ActionRow(props: {
  meta: InlineAiActionMeta;
  expanded: boolean;
  disabled: boolean;
  onFire: () => void;
  onHoverEnter: () => void;
  children?: ReactNode;
}) {
  const { meta, expanded, disabled, onFire, onHoverEnter, children } = props;
  const Icon = meta.icon;

  return (
    <div className="relative" onMouseEnter={onHoverEnter}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup={meta.flyout ? "menu" : undefined}
        aria-expanded={meta.flyout ? expanded : undefined}
        disabled={disabled}
        onClick={() => {
          if (!meta.flyout) {
            onFire();
          }
        }}
        onFocus={onHoverEnter}
        data-testid={`inline-ai-action-${meta.id}`}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2",
          "text-left text-[13px] font-medium text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:bg-accent",
          "disabled:cursor-not-allowed disabled:opacity-60",
          expanded ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <span
          className={cn(
            "inline-flex shrink-0 transition-colors",
            expanded
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="flex-1 truncate">{meta.label}</span>
        {meta.flyout ? (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "translate-x-0.5 text-primary",
            )}
            aria-hidden
          />
        ) : null}
      </button>
      {children}
    </div>
  );
}

export function InlineAiPanel(props: InlineAiPanelProps) {
  const {
    transform,
    hasSelection,
    onSubmit,
    onClose,
    hideProposalResult,
    className,
  } = props;

  const [toneOpen, setToneOpen] = useState(false);
  const isWorking =
    transform.state.status === "loading" ||
    transform.state.status === "applying";

  // Mask proposal/applying/applied (and the inline preview owns it),
  // and idle (no message). Loading / error / empty / stale / forbidden
  // / validation_invalid replace the action list with a status row.
  const maskedState: InlineAiState =
    hideProposalResult &&
    (transform.state.status === "proposal" ||
      transform.state.status === "applying" ||
      transform.state.status === "applied")
      ? ({ status: "idle" } as InlineAiState)
      : transform.state;

  const showStatus =
    maskedState.status !== "idle" && maskedState.status !== "applied";

  // Last fired intent — used by retry to re-fire the same action.
  const lastIntentRef = useRef<InlineAiTransformIntent | null>(null);

  // When transform settles back to idle (e.g. after reject + reopen),
  // collapse the tone flyout so the picker reopens cleanly.
  useEffect(() => {
    if (transform.state.status === "idle") {
      setToneOpen(false);
    }
  }, [transform.state.status]);

  const fire = (intent: InlineAiTransformIntent) => {
    lastIntentRef.current = intent;
    onSubmit(intent);
  };

  const retry = () => {
    if (lastIntentRef.current) {
      onSubmit(lastIntentRef.current);
    }
  };

  return (
    <section
      aria-label="AI inline transform"
      className={cn(
        "flex w-full flex-col overflow-visible rounded-lg border border-border bg-popover text-popover-foreground shadow-md",
        className,
      )}
      // Close the tone flyout when the cursor leaves the picker
      // entirely, so it doesn't linger after the user moves away.
      onMouseLeave={() => setToneOpen(false)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
          AI · edit selection
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI panel"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:bg-accent"
            data-testid="inline-ai-close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </header>

      {!hasSelection ? (
        <div className="px-3 py-3">
          <StateMessage tone="info">
            Select editor text first, then pick an action.
          </StateMessage>
        </div>
      ) : showStatus ? (
        <div className="px-3 py-3">
          <InlineAiResultBody
            state={maskedState}
            onAccept={transform.accept}
            onReject={() => {
              void transform.reject();
            }}
            onRetry={retry}
          />
        </div>
      ) : (
        <div
          role="menu"
          aria-label="AI actions"
          className="flex flex-col gap-0.5 p-1.5"
        >
          {INLINE_AI_ACTIONS.map((meta) => (
            <ActionRow
              key={meta.id}
              meta={meta}
              expanded={meta.flyout && toneOpen}
              disabled={isWorking}
              onHoverEnter={() => setToneOpen(meta.flyout)}
              onFire={() => fire(intentForInlineAction(meta.id, ""))}
            >
              {meta.flyout && toneOpen ? (
                <ToneFlyout
                  onPick={(preset) => {
                    setToneOpen(false);
                    fire(intentForInlineAction("change_tone", preset.detail));
                  }}
                />
              ) : null}
            </ActionRow>
          ))}
        </div>
      )}
    </section>
  );
}
