"use client";

import { useMemo, useState } from "react";

import {
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
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

const INLINE_AI_ACTIONS: ReadonlyArray<{
  id: StudioAiInlineAction;
  label: string;
  description: string;
  requiresInput: boolean;
}> = [
  {
    id: "rewrite",
    label: "Rewrite",
    description: "Rewrite while preserving meaning",
    requiresInput: false,
  },
  {
    id: "shorten",
    label: "Shorten",
    description: "Trim to a tighter version",
    requiresInput: false,
  },
  {
    id: "expand",
    label: "Expand",
    description: "Add supporting detail",
    requiresInput: false,
  },
  {
    id: "change_tone",
    label: "Change tone",
    description: "Rewrite in the requested tone",
    requiresInput: true,
  },
  {
    id: "fix_grammar",
    label: "Fix grammar",
    description: "Correct grammar and spelling",
    requiresInput: false,
  },
  {
    id: "improve_clarity",
    label: "Improve clarity",
    description: "Clarify and tighten phrasing",
    requiresInput: false,
  },
  {
    id: "improve_seo",
    label: "Improve SEO",
    description: "Suggest SEO frontmatter updates",
    requiresInput: true,
  },
  {
    id: "insert_mdx_component",
    label: "Insert MDX component",
    description: "Insert a registered MDX block",
    requiresInput: true,
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
  className?: string;
  /** Optional override used by tests to seed the hook state. */
  initialIntent?: InlineAiTransformIntent;
};

function intentForAction(
  action: StudioAiInlineAction,
  detail: string,
): InlineAiTransformIntent {
  if (action === "change_tone") {
    return { action, tone: detail };
  }

  if (action === "improve_seo") {
    return { action, keyword: detail };
  }

  if (action === "insert_mdx_component") {
    return { action, componentIntent: detail };
  }

  return { action };
}

function describeOperation(proposal: StudioAiProposal): string {
  const [first] = proposal.operations;

  if (!first) {
    return "AI proposal had no operations.";
  }

  if (first.op === "replace_selection") {
    return first.replacementText;
  }

  if (first.op === "insert_block") {
    return first.bodyMdx;
  }

  if (first.op === "update_frontmatter") {
    return JSON.stringify(first.patch, null, 2);
  }

  if (first.op === "create_document") {
    return `Path: ${first.path}\n\n${first.body}`;
  }

  return proposal.summary;
}

function StateMessage(props: {
  tone: "info" | "warn" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        props.tone === "info" &&
          "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
        props.tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        props.tone === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="leading-snug">{props.children}</span>
    </div>
  );
}

function StateBody(props: {
  state: InlineAiState;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const { state, onAccept, onReject, onRetry } = props;

  if (state.status === "idle") {
    return (
      <p className="text-sm text-muted-foreground">
        Pick an action to ask AI for a draft proposal.
      </p>
    );
  }

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {errorList.map((entry, index) => (
            <li key={index}>
              <strong>{entry.code}</strong> — {entry.message}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onReject}>
            Dismiss
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "proposal") {
    return (
      <div className="space-y-3">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Proposed replacement
          </p>
          <p className="text-sm font-medium">{state.proposal.summary}</p>
        </header>
        <pre
          data-testid="inline-ai-proposed-text"
          className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm"
        >
          {describeOperation(state.proposal)}
        </pre>
        <div className="flex gap-2">
          <Button size="sm" onClick={onAccept}>
            <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Accept
          </Button>
          <Button size="sm" variant="secondary" onClick={onReject}>
            <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "applying") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Applying proposal…
      </div>
    );
  }

  if (state.status === "applied") {
    return (
      <StateMessage tone="info">
        Proposal applied. Editor draft has been updated.
      </StateMessage>
    );
  }

  if (state.status === "stale") {
    return (
      <div className="space-y-2">
        <StateMessage tone="warn">{state.message}</StateMessage>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onReject}>
            Dismiss
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Try again
          </Button>
        </div>
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
            <strong>{state.code}</strong> — {state.message}
          </span>
        </StateMessage>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onReject}>
            Dismiss
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Try again
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

export function InlineAiPanel(props: InlineAiPanelProps) {
  const { api, options, selection, onApplied, className } = props;

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

  const isSelectionRequired =
    activeAction !== "improve_seo" && activeAction !== "insert_mdx_component";
  const hasSelection = Boolean(selection);
  const requestDisabled =
    transform.state.status === "loading" ||
    transform.state.status === "applying" ||
    (isSelectionRequired && !hasSelection) ||
    (activeMeta.requiresInput && detail.trim().length === 0);

  const lastIntent: InlineAiTransformIntent =
    "intent" in transform.state && transform.state.intent
      ? (transform.state as { intent: InlineAiTransformIntent }).intent
      : intentForAction(activeAction, detail.trim());

  return (
    <section
      aria-label="AI inline transform"
      className={cn(
        "flex flex-col gap-3 rounded-md border bg-card p-3 text-card-foreground",
        className,
      )}
    >
      <header className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        AI transform
      </header>

      <div className="grid grid-cols-2 gap-2">
        {INLINE_AI_ACTIONS.map((entry) => (
          <Button
            key={entry.id}
            size="sm"
            variant={entry.id === activeAction ? "default" : "ghost"}
            type="button"
            onClick={() => {
              setActiveAction(entry.id);
              setDetail("");
            }}
            data-testid={`inline-ai-action-${entry.id}`}
          >
            <span className="text-left">
              <span className="block text-xs font-semibold">{entry.label}</span>
              <span className="block text-[10px] text-muted-foreground">
                {entry.description}
              </span>
            </span>
          </Button>
        ))}
      </div>

      {activeMeta.requiresInput ? (
        <Input
          aria-label={`${activeMeta.label} detail`}
          placeholder={
            activeAction === "change_tone"
              ? "e.g. friendly, formal, concise"
              : activeAction === "improve_seo"
                ? "Target keyword or topic"
                : "Component intent (e.g. callout for incident summary)"
          }
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
        />
      ) : null}

      {!hasSelection && isSelectionRequired ? (
        <StateMessage tone="info">
          Select editor text first, then pick an action.
        </StateMessage>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={requestDisabled}
        onClick={() =>
          transform.request(intentForAction(activeAction, detail.trim()))
        }
        data-testid="inline-ai-request"
      >
        {transform.state.status === "loading" ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            Generating…
          </>
        ) : (
          <>
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden />
            Ask AI
          </>
        )}
      </Button>

      <StateBody
        state={transform.state}
        onAccept={transform.accept}
        onReject={transform.reject}
        onRetry={() => transform.request(lastIntent)}
      />
    </section>
  );
}
