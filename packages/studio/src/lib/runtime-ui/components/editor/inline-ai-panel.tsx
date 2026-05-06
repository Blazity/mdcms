"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Eraser,
  Expand,
  Languages,
  Loader2,
  PenLine,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

import {
  type StudioAiInlineAction,
  type StudioAiProposal,
} from "../../../ai-route-api.js";
import {
  useInlineAiTransform,
  type InlineAiSelection,
  type InlineAiState,
  type InlineAiTransformIntent,
  type InlineAiTransformOptions,
} from "../../hooks/use-inline-ai-transform.js";
import type { StudioAiRouteApi } from "../../../ai-route-api.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { cn } from "../../lib/utils.js";

type InlineAiActionMeta = {
  id: StudioAiInlineAction;
  label: string;
  description: string;
  icon: typeof Sparkles;
  requiresInput: boolean;
};

const INLINE_AI_ACTIONS: ReadonlyArray<InlineAiActionMeta> = [
  {
    id: "rewrite",
    label: "Rewrite",
    description: "Preserve meaning, change phrasing",
    icon: PenLine,
    requiresInput: false,
  },
  {
    id: "shorten",
    label: "Shorten",
    description: "Trim to a tighter version",
    icon: Scissors,
    requiresInput: false,
  },
  {
    id: "expand",
    label: "Expand",
    description: "Add supporting detail",
    icon: Expand,
    requiresInput: false,
  },
  {
    id: "change_tone",
    label: "Change tone",
    description: "Rewrite in a requested tone",
    icon: Languages,
    requiresInput: true,
  },
  {
    id: "fix_grammar",
    label: "Fix grammar",
    description: "Correct grammar and spelling",
    icon: Eraser,
    requiresInput: false,
  },
  {
    id: "improve_clarity",
    label: "Improve clarity",
    description: "Clarify and tighten phrasing",
    icon: SlidersHorizontal,
    requiresInput: false,
  },
];

export type InlineAiPanelProps = {
  api: StudioAiRouteApi;
  options: InlineAiTransformOptions;
  selection: InlineAiSelection | null;
  onApplied?: (input: {
    proposal: StudioAiProposal;
    bodyAfter: string;
  }) => void;
  onClose?: () => void;
  className?: string;
};

function intentForAction(
  action: StudioAiInlineAction,
  detail: string,
): InlineAiTransformIntent {
  if (action === "change_tone") {
    return { action, tone: detail };
  }

  return { action };
}

function describeSingleOperation(
  operation: StudioAiProposal["operations"][number],
): string {
  if (operation.op === "replace_selection") {
    return operation.replacementText;
  }

  if (operation.op === "insert_block") {
    return operation.bodyMdx;
  }

  if (operation.op === "update_frontmatter") {
    return JSON.stringify(operation.patch, null, 2);
  }

  if (operation.op === "create_document") {
    return `Path: ${operation.path}\n\n${operation.body}`;
  }

  return "";
}

function describeOperation(proposal: StudioAiProposal): string {
  if (proposal.operations.length === 0) {
    return proposal.summary;
  }

  return proposal.operations
    .map((operation) => describeSingleOperation(operation))
    .filter((text) => text.length > 0)
    .join("\n\n---\n\n");
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
 * Pure render of the proposal-result region (proposal preview,
 * applying spinner, validation errors, stale / forbidden / error
 * messages, etc.). Exported so tests can verify the per-state markup
 * without driving the full `InlineAiPanel` state machine.
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
        Generating a proposal…
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <StateMessage tone="info">
        AI did not return a usable proposal. Try a different instruction.
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
        <ResultActions
          onPrimary={onRetry}
          primaryLabel="Try again"
          primaryIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          onSecondary={onReject}
          secondaryLabel="Dismiss"
        />
      </div>
    );
  }

  if (state.status === "proposal") {
    return (
      <div className="space-y-2">
        <header className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Proposed replacement
          </p>
          <p className="text-xs font-medium leading-snug">
            {state.proposal.summary}
          </p>
        </header>
        <pre
          data-testid="inline-ai-proposed-text"
          className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 font-sans text-xs leading-relaxed"
        >
          {describeOperation(state.proposal)}
        </pre>
        <ResultActions
          onPrimary={onAccept}
          primaryLabel="Accept"
          primaryIcon={<Check className="h-3.5 w-3.5" aria-hidden />}
          onSecondary={onReject}
          secondaryLabel="Reject"
          secondaryIcon={<X className="h-3.5 w-3.5" aria-hidden />}
          tertiaryLabel="Try again"
          onTertiary={onRetry}
          tertiaryIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
        />
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
        Applying proposal…
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
        <ResultActions
          onPrimary={onRetry}
          primaryLabel="Try again"
          primaryIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          onSecondary={onReject}
          secondaryLabel="Dismiss"
        />
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
        <ResultActions
          onPrimary={onRetry}
          primaryLabel="Try again"
          primaryIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          onSecondary={onReject}
          secondaryLabel="Dismiss"
        />
      </div>
    );
  }

  return null;
}

function ResultActions(props: {
  onPrimary: () => void;
  primaryLabel: string;
  primaryIcon?: ReactNode;
  onSecondary?: () => void;
  secondaryLabel?: string;
  secondaryIcon?: ReactNode;
  onTertiary?: () => void;
  tertiaryLabel?: string;
  tertiaryIcon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" onClick={props.onPrimary} className="h-7 px-2.5">
        {props.primaryIcon ? (
          <span className="mr-1 inline-flex">{props.primaryIcon}</span>
        ) : null}
        {props.primaryLabel}
      </Button>
      {props.onSecondary && props.secondaryLabel ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={props.onSecondary}
          className="h-7 px-2.5"
        >
          {props.secondaryIcon ? (
            <span className="mr-1 inline-flex">{props.secondaryIcon}</span>
          ) : null}
          {props.secondaryLabel}
        </Button>
      ) : null}
      {props.onTertiary && props.tertiaryLabel ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onTertiary}
          className="h-7 px-2.5 text-muted-foreground"
        >
          {props.tertiaryIcon ? (
            <span className="mr-1 inline-flex">{props.tertiaryIcon}</span>
          ) : null}
          {props.tertiaryLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ActionRow(props: {
  meta: InlineAiActionMeta;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = props.meta.icon;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={props.active}
      onClick={props.onSelect}
      data-testid={`inline-ai-action-${props.meta.id}`}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        props.active
          ? "bg-primary/10 text-foreground"
          : "text-foreground hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors",
          props.active && "border-primary/40 bg-primary/15 text-primary",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium leading-tight">
          {props.meta.label}
        </span>
        <span className="truncate text-[11px] leading-tight text-muted-foreground">
          {props.meta.description}
        </span>
      </span>
      {props.meta.requiresInput ? (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export function InlineAiPanel(props: InlineAiPanelProps) {
  const { api, options, selection, onApplied, onClose, className } = props;

  const [activeAction, setActiveAction] =
    useState<StudioAiInlineAction>("rewrite");
  const [detail, setDetail] = useState<string>("");

  const transform = useInlineAiTransform({
    api,
    options,
    selection,
    onApplied: onApplied
      ? ({ proposal, document }) => {
          onApplied({ proposal, bodyAfter: document.body });
        }
      : undefined,
  });

  const activeMeta = useMemo(
    () => INLINE_AI_ACTIONS.find((entry) => entry.id === activeAction)!,
    [activeAction],
  );

  // Every inline action operates on a selection (per SPEC-014); the
  // panel never appears without one in the floating bubble flow, but
  // we guard here too in case the panel is mounted standalone.
  const hasSelection = Boolean(selection);
  const requestDisabled =
    transform.state.status === "loading" ||
    transform.state.status === "applying" ||
    !hasSelection ||
    (activeMeta.requiresInput && detail.trim().length === 0);

  const lastIntent: InlineAiTransformIntent =
    "intent" in transform.state && transform.state.intent
      ? (transform.state as { intent: InlineAiTransformIntent }).intent
      : intentForAction(activeAction, detail.trim());

  const detailPlaceholder = "e.g. friendly, formal, concise";

  const isWorking =
    transform.state.status === "loading" ||
    transform.state.status === "applying";

  return (
    <section
      aria-label="AI inline transform"
      className={cn(
        "flex h-full max-h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-md",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          AI transform
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI panel"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            data-testid="inline-ai-close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </header>

      <div
        role="menu"
        aria-label="AI actions"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5"
      >
        {INLINE_AI_ACTIONS.map((entry) => (
          <ActionRow
            key={entry.id}
            meta={entry}
            active={entry.id === activeAction}
            onSelect={() => {
              setActiveAction(entry.id);
              setDetail("");
            }}
          />
        ))}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-muted/20 px-3 py-2">
        {!hasSelection ? (
          <StateMessage tone="info">
            Select editor text first, then pick an action.
          </StateMessage>
        ) : null}

        {activeMeta.requiresInput ? (
          <Input
            aria-label={`${activeMeta.label} detail`}
            placeholder={detailPlaceholder}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            className="h-8 text-xs"
          />
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-muted-foreground">
            {activeMeta.description}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={requestDisabled}
            onClick={() =>
              transform.request(intentForAction(activeAction, detail.trim()))
            }
            data-testid="inline-ai-request"
            className="h-8 shrink-0 px-3"
          >
            {isWorking ? (
              <>
                <Loader2
                  className="mr-1 h-3.5 w-3.5 animate-spin"
                  aria-hidden
                />
                Generating
              </>
            ) : (
              <>
                <Wand2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                Generate
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </>
            )}
          </Button>
        </div>

        <InlineAiResultBody
          state={transform.state}
          onAccept={transform.accept}
          onReject={transform.reject}
          onRetry={() => transform.request(lastIntent)}
        />
      </div>
    </section>
  );
}
