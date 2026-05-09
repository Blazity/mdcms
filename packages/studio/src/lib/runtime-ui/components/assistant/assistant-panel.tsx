"use client";

import * as React from "react";
import {
  AtSign,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Send,
  X,
} from "lucide-react";

import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";
import {
  ASSISTANT_COMPOSER_DATA_ATTR,
  useAssistant,
  relTime,
} from "./assistant-context.js";
import type {
  AssistantMessage,
  AssistantProposal,
  AssistantThread,
} from "./assistant-types.js";
import { ProposalCard } from "./proposal-card.js";
import { SparkleMark } from "./sparkle-mark.js";

export type AssistantPanelProps = {
  /** Hide the close (×) button — used when the surface chrome owns dismissal. */
  hideClose?: boolean;
  /** Hide the thread list pane; collapse the panel to a single conversation. */
  hideThreadList?: boolean;
  /** Hide the Fullscreen toggle in the header. */
  hideExpand?: boolean;
  /** When true, render with the rail-mode width hint for chip overflow. */
  variant?: "rail" | "fullscreen";
};

function ThreadList({
  threads,
  activeId,
  onPick,
}: {
  threads: AssistantThread[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-divider/40 bg-background-subtle">
      <div className="flex items-center gap-2 border-b border-divider/40 px-3 py-2.5">
        <span className="flex-1 font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
          Conversations
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <Plus className="h-3 w-3" aria-hidden /> New
        </Button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-1.5">
        {threads.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => onPick(t.id)}
            aria-current={t.id === activeId ? "true" : undefined}
            className={cn(
              "mb-0.5 block w-full rounded-md border px-2.5 py-2 text-left transition-colors",
              t.id === activeId
                ? "border-divider/60 bg-card text-foreground"
                : "border-transparent text-foreground hover:bg-card/60",
            )}
          >
            <div className="mb-0.5 truncate text-[12.5px] font-semibold">
              {t.pinned && <span className="mr-1.5 text-primary">●</span>}
              {t.title}
            </div>
            <div className="flex gap-1.5 font-mono text-[10px] text-foreground-muted">
              <span>{relTime(t.updatedAt)}</span>
              <span>·</span>
              <span>
                {t.docCount} doc{t.docCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-foreground-muted">
              {t.preview}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type MentionCandidate = { path: string; type: string; locale: string };

/**
 * Build a candidate list for the @-mention picker. The list is sourced
 * from the active assistant store: every distinct document that already
 * appears as a thread context, attached selection, or proposal target
 * is a candidate. This keeps the picker fully self-contained while the
 * server-backed content-search endpoint for chat lands in a follow-up.
 */
function useMentionCandidates(): MentionCandidate[] {
  const assistant = useAssistant();
  return React.useMemo(() => {
    const seen = new Map<string, MentionCandidate>();
    const add = (
      path: string | undefined,
      type: string | undefined,
      locale: string | undefined,
    ) => {
      if (!path || seen.has(path)) return;
      seen.set(path, {
        path,
        type: type ?? "doc",
        locale: locale ?? "en",
      });
    };
    for (const thread of assistant.store.threads) {
      for (const doc of thread.contextDocs) add(doc.path, doc.type, doc.locale);
      add(
        thread.attachedSelection?.path,
        undefined,
        thread.attachedSelection ? "en" : undefined,
      );
    }
    for (const proposal of Object.values(assistant.store.proposals)) {
      if (proposal.kind === "batch") {
        for (const child of proposal.children) {
          add(child.docPath, "doc", child.locale);
        }
      } else if ("docPath" in proposal) {
        add(proposal.docPath, proposal.type, proposal.locale);
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }, [assistant.store]);
}

function MentionPicker({
  query,
  excludePaths,
  onPick,
  onClose,
}: {
  query: string;
  excludePaths: Set<string>;
  onPick: (path: string, type: string, locale: string) => void;
  onClose: () => void;
}) {
  const candidates = useMentionCandidates();
  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    return candidates
      .filter((c) => !excludePaths.has(c.path))
      .filter((c) => !q || c.path.toLowerCase().includes(q))
      .slice(0, 8);
  }, [candidates, query, excludePaths]);

  if (filtered.length === 0) {
    return (
      <div
        role="listbox"
        aria-label="Document picker"
        className="absolute bottom-full left-3 right-3 mb-1 rounded-md border border-divider/60 bg-popover px-3 py-3 text-[12px] text-foreground-muted shadow-lg"
      >
        No documents match{" "}
        {query ? <code className="font-mono">@{query}</code> : "yet"}.{" "}
        <button
          type="button"
          onClick={onClose}
          className="ml-1 underline hover:text-foreground"
        >
          dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Document picker"
      className="absolute bottom-full left-3 right-3 mb-1 max-h-72 overflow-y-auto rounded-md border border-divider/60 bg-popover py-1 shadow-lg"
    >
      <div className="border-b border-divider/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
        Attach document
      </div>
      {filtered.map((c) => (
        <button
          key={c.path}
          type="button"
          role="option"
          onClick={() => onPick(c.path, c.type, c.locale)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-accent-subtle"
        >
          <span className="shrink-0 rounded-sm bg-blue-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
            {c.type}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">
            {c.path}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-foreground-muted/80">
            {c.locale}
          </span>
        </button>
      ))}
    </div>
  );
}

function ContextChips({
  thread,
  onClearSelection,
  onRemoveDoc,
}: {
  thread: AssistantThread;
  onClearSelection: () => void;
  onRemoveDoc: (path: string) => void;
}) {
  const current = thread.contextDocs[0];
  const others = thread.contextDocs.slice(1);
  const sel = thread.attachedSelection;
  return (
    <div className="-mb-px flex flex-wrap items-center gap-1.5 rounded-t-lg border border-b-0 border-divider/60 bg-card px-2.5 py-1.5">
      <span className="mr-0.5 font-mono text-[9px] uppercase tracking-wider text-foreground-muted">
        Context
      </span>
      {current && (
        <span
          className="inline-flex items-center gap-1.5 rounded-sm border border-divider/60 bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-foreground-muted"
          title={`Current document — ${current.path}`}
        >
          <span className="text-primary">◆</span> current
        </span>
      )}
      {others.map((d) => (
        <span
          key={d.path}
          className="inline-flex items-center gap-1.5 rounded-sm border border-divider/60 bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-foreground-muted"
          title={`Selected document — ${d.path}`}
        >
          <span className="text-foreground-muted">＋</span>
          {d.path}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveDoc(d.path);
            }}
            className="-mr-0.5 ml-0.5 rounded text-foreground-muted hover:text-foreground"
            aria-label={`Remove ${d.path} from context`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {sel && (
        <span
          className="inline-flex items-center gap-1.5 rounded-sm border border-primary/30 bg-blue-100 px-1.5 py-0.5 font-mono text-[10.5px] text-primary"
          title={sel.text}
        >
          <SparkleMark size={9} />
          selected text
          <button
            type="button"
            onClick={onClearSelection}
            className="-mr-0.5 ml-0.5 rounded text-primary/80 hover:text-primary"
            aria-label="Detach selection"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      )}
    </div>
  );
}

function UserBubble({ message }: { message: AssistantMessage }) {
  return (
    <div className="mb-4 flex justify-end">
      <div className="max-w-[80%] rounded-[12px_12px_2px_12px] bg-secondary px-3 py-2 text-[13px] leading-snug text-secondary-foreground">
        {message.text}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  proposalsById,
  onAccept,
  onReject,
}: {
  message: AssistantMessage;
  proposalsById: Record<string, AssistantProposal>;
  onAccept: (proposalId: string) => void;
  onReject: (proposalId: string, feedback: string) => void;
}) {
  const proposalIds = message.proposals ?? [];
  const text = message.text?.trim();
  if (proposalIds.length === 0 && !text) return null;
  const isSingleTurn = proposalIds.length === 1;
  return (
    <div className="mb-5 space-y-2">
      {text && (
        <div className="max-w-[92%] text-[13.5px] leading-relaxed text-foreground">
          {text}
        </div>
      )}
      {proposalIds.map((pid, i) => {
        const proposal = proposalsById[pid];
        if (!proposal) return null;
        // Single-suggestion turns expand by default; multi-proposal turns
        // collapse all but the first to keep the conversation scannable.
        const defaultCollapsed = !isSingleTurn && i > 0;
        return (
          <ProposalCard
            key={pid}
            proposal={proposal}
            defaultCollapsed={defaultCollapsed}
            onAccept={() => onAccept(pid)}
            onReject={(feedback) => onReject(pid, feedback)}
          />
        );
      })}
    </div>
  );
}

function Composer({
  thread,
  onClearSelection,
  onRemoveDoc,
}: {
  thread: AssistantThread;
  onClearSelection: () => void;
  onRemoveDoc: (path: string) => void;
}) {
  const assistant = useAssistant();
  const [draft, setDraft] = React.useState("");
  const [mention, setMention] = React.useState<{
    query: string;
    caret: number;
  } | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    if (!draft.trim()) return;
    assistant.sendMessage(draft);
    setDraft("");
    setMention(null);
  };

  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    const next = e.target.value;
    setDraft(next);
    const caret = e.target.selectionStart ?? next.length;
    const upToCaret = next.slice(0, caret);
    const atIndex = upToCaret.lastIndexOf("@");
    if (atIndex < 0) {
      setMention(null);
      return;
    }
    const between = upToCaret.slice(atIndex + 1);
    // Only treat the @ as a mention if it sits at start-of-string or
    // after a whitespace char, and the text after it has no whitespace.
    const before = atIndex === 0 ? "" : upToCaret[atIndex - 1];
    if (before && !/\s/.test(before)) {
      setMention(null);
      return;
    }
    if (/\s/.test(between)) {
      setMention(null);
      return;
    }
    setMention({ query: between, caret });
  };

  const handlePick = (path: string, type: string, locale: string) => {
    assistant.attachContextDoc({ path, type, locale });
    if (mention) {
      const before = draft.slice(0, mention.caret);
      const after = draft.slice(mention.caret);
      const atIndex = before.lastIndexOf("@");
      const replaced = `${draft.slice(0, atIndex)}@${path}${after}`;
      setDraft(replaced);
    }
    setMention(null);
    textareaRef.current?.focus();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative border-t border-divider/40 bg-background-subtle px-3 pb-3 pt-2.5"
    >
      <ContextChips
        thread={thread}
        onClearSelection={onClearSelection}
        onRemoveDoc={onRemoveDoc}
      />
      <div
        {...{ [ASSISTANT_COMPOSER_DATA_ATTR]: "" }}
        className="rounded-b-lg border border-divider/60 bg-card px-3 py-2.5 transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={onChange}
          rows={2}
          placeholder="Ask about any doc, propose edits, draft new posts…"
          className="w-full resize-none border-none bg-transparent text-[13.5px] leading-snug text-foreground outline-none placeholder:text-foreground-muted"
          onKeyDown={(e) => {
            if (mention && e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex-1 font-mono text-[10px] text-foreground-muted">
            ⌘ ↵ to send · @ to reference a doc · # to attach selection
          </span>
          <button
            type="button"
            onClick={() => {
              const ta = textareaRef.current;
              if (!ta) return;
              ta.focus();
              const caret = ta.selectionStart ?? draft.length;
              const next =
                draft.slice(0, caret) +
                (caret > 0 && !/\s/.test(draft[caret - 1] ?? "") ? " @" : "@") +
                draft.slice(caret);
              setDraft(next);
              const newCaret = next.length - draft.slice(caret).length;
              setMention({ query: "", caret: newCaret });
              window.setTimeout(() => {
                ta.setSelectionRange(newCaret, newCaret);
              }, 0);
            }}
            className="grid h-6 w-6 place-items-center rounded text-foreground-muted hover:bg-muted hover:text-foreground"
            title="Attach document (@)"
            aria-label="Attach document"
          >
            <AtSign className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="submit"
            disabled={!draft.trim()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors",
              draft.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-foreground-muted",
            )}
          >
            <Send className="h-3 w-3" aria-hidden /> Send
            <span className="font-mono text-[9px] opacity-70">⌘↵</span>
          </button>
        </div>
      </div>
      {mention && (
        <MentionPicker
          query={mention.query}
          excludePaths={new Set(thread.contextDocs.map((d) => d.path))}
          onPick={handlePick}
          onClose={() => setMention(null)}
        />
      )}
    </form>
  );
}

export function AssistantPanel({
  hideClose = false,
  hideThreadList = false,
  hideExpand = false,
  variant = "rail",
}: AssistantPanelProps) {
  const assistant = useAssistant();
  const thread = assistant.activeThread;

  const visibleThreadList = !hideThreadList;

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-card text-card-foreground">
      {visibleThreadList && (
        <ThreadList
          threads={assistant.store.threads}
          activeId={assistant.activeThread.id}
          onPick={assistant.selectThread}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-9 items-center gap-2 border-b border-divider/40 px-3 py-1.5">
          <span className="text-primary">
            <SparkleMark size={14} />
          </span>
          <div className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
            {thread.title}
          </div>
          {!hideExpand && (
            <button
              type="button"
              onClick={assistant.toggleFullscreen}
              className="grid h-6 w-6 place-items-center rounded text-foreground-muted hover:bg-muted hover:text-foreground"
              title={assistant.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={
                assistant.isFullscreen ? "Exit fullscreen" : "Fullscreen"
              }
            >
              {assistant.isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          )}
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded text-foreground-muted hover:bg-muted hover:text-foreground"
            title="More"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
          </button>
          {!hideClose && (
            <button
              type="button"
              onClick={assistant.close}
              className="grid h-6 w-6 place-items-center rounded text-foreground-muted hover:bg-muted hover:text-foreground"
              title="Close"
              aria-label="Close assistant"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <div
          className={cn(
            "scrollbar-thin flex-1 space-y-1 overflow-y-auto p-4",
            variant === "fullscreen" && "px-8",
          )}
        >
          {thread.messages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={m.id} message={m} />
            ) : (
              <AssistantBubble
                key={m.id}
                message={m}
                proposalsById={assistant.store.proposals}
                onAccept={(pid) => {
                  const p = assistant.store.proposals[pid];
                  if (p) assistant.acceptProposal(p);
                }}
                onReject={(pid, feedback) => {
                  const p = assistant.store.proposals[pid];
                  if (p) assistant.rejectProposal(p, feedback);
                }}
              />
            ),
          )}
        </div>
        <Composer
          thread={thread}
          onClearSelection={assistant.clearActiveSelection}
          onRemoveDoc={assistant.removeContextDoc}
        />
      </div>
    </div>
  );
}
