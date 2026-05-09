"use client";

import * as React from "react";

import type {
  AssistantContextDoc,
  AssistantMessage,
  AssistantProposal,
  AssistantStore,
  AssistantThread,
} from "./assistant-types.js";
import { buildAssistantMockStore } from "./assistant-mock-data.js";
import { respondToUserMessage } from "./assistant-stub-orchestrator.js";

type RailMode = "closed" | "rail" | "fullscreen";

type AssistantState = {
  store: AssistantStore;
  mode: RailMode;
  activeThreadId: string;
};

type AssistantAction =
  | { type: "open-rail" }
  | { type: "close" }
  | { type: "toggle-fullscreen" }
  | { type: "set-mode"; mode: RailMode }
  | { type: "select-thread"; threadId: string }
  | { type: "clear-selection-on-active" }
  | { type: "remove-context-doc"; path: string }
  | { type: "attach-context-doc"; doc: AssistantContextDoc }
  | { type: "remove-proposal"; threadId: string; proposalId: string }
  | {
      type: "reject-proposal";
      threadId: string;
      proposalId: string;
      feedback: string;
    }
  | {
      type: "send-message";
      threadId: string;
      userMessage: AssistantMessage;
      assistantMessage: AssistantMessage;
      newProposals: AssistantProposal[];
    };

function collectProposalDocPaths(p: AssistantProposal): string[] {
  if (p.kind === "batch") return p.children.map((c) => c.docPath);
  if ("docPath" in p && p.docPath) return [p.docPath];
  return [];
}

function reducer(
  state: AssistantState,
  action: AssistantAction,
): AssistantState {
  switch (action.type) {
    case "open-rail":
      return state.mode === "closed" ? { ...state, mode: "rail" } : state;
    case "close":
      return { ...state, mode: "closed" };
    case "toggle-fullscreen":
      if (state.mode === "fullscreen") return { ...state, mode: "rail" };
      if (state.mode === "rail") return { ...state, mode: "fullscreen" };
      return state;
    case "set-mode":
      return { ...state, mode: action.mode };
    case "select-thread":
      return { ...state, activeThreadId: action.threadId };
    case "clear-selection-on-active":
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((t) =>
            t.id === state.activeThreadId
              ? { ...t, attachedSelection: undefined }
              : t,
          ),
        },
      };
    case "remove-context-doc":
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((t) =>
            t.id === state.activeThreadId
              ? {
                  ...t,
                  contextDocs: t.contextDocs.filter(
                    (d) => d.path !== action.path,
                  ),
                }
              : t,
          ),
        },
      };
    case "attach-context-doc":
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((t) => {
            if (t.id !== state.activeThreadId) return t;
            if (t.contextDocs.some((d) => d.path === action.doc.path)) {
              return t;
            }
            return { ...t, contextDocs: [...t.contextDocs, action.doc] };
          }),
        },
      };
    case "send-message": {
      const proposalDelta = Object.fromEntries(
        action.newProposals.map((p) => [p.proposalId, p]),
      );
      return {
        ...state,
        store: {
          ...state.store,
          proposals: { ...state.store.proposals, ...proposalDelta },
          threads: state.store.threads.map((thread) => {
            if (thread.id !== action.threadId) return thread;
            const docCount = new Set([
              ...thread.contextDocs.map((d) => d.path),
              ...action.newProposals.flatMap((p) => collectProposalDocPaths(p)),
            ]).size;
            return {
              ...thread,
              docCount: Math.max(thread.docCount, docCount),
              updatedAt: action.assistantMessage.at,
              messages: [
                ...thread.messages,
                action.userMessage,
                action.assistantMessage,
              ],
            };
          }),
        },
      };
    }
    case "remove-proposal":
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((thread) =>
            thread.id === action.threadId
              ? {
                  ...thread,
                  messages: thread.messages.map((m) => {
                    if (!m.proposals?.includes(action.proposalId)) return m;
                    return {
                      ...m,
                      proposals: m.proposals.filter(
                        (id) => id !== action.proposalId,
                      ),
                    };
                  }),
                }
              : thread,
          ),
        },
      };
    case "reject-proposal": {
      // Reject removes the proposal from its message and appends a user
      // turn carrying the regenerate feedback so the chat history is
      // honest about what the user asked for. The empty-string case is
      // treated as a silent reject and skips the feedback turn.
      const trimmedFeedback = action.feedback.trim();
      const feedbackUserMessage = trimmedFeedback
        ? {
            id: `m-${Date.now()}`,
            role: "user" as const,
            at: new Date().toISOString(),
            text: trimmedFeedback,
            rejectedProposalId: action.proposalId,
          }
        : null;
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((thread) => {
            if (thread.id !== action.threadId) return thread;
            const messagesWithoutProposal = thread.messages.map((m) => {
              if (!m.proposals?.includes(action.proposalId)) return m;
              return {
                ...m,
                proposals: m.proposals.filter((id) => id !== action.proposalId),
              };
            });
            return {
              ...thread,
              messages: feedbackUserMessage
                ? [...messagesWithoutProposal, feedbackUserMessage]
                : messagesWithoutProposal,
            };
          }),
        },
      };
    }
    default:
      return state;
  }
}

export type AssistantContextValue = {
  store: AssistantStore;
  mode: RailMode;
  isOpen: boolean;
  isFullscreen: boolean;
  activeThread: AssistantThread;
  openRail: () => void;
  close: () => void;
  toggleFullscreen: () => void;
  setMode: (mode: RailMode) => void;
  selectThread: (threadId: string) => void;
  clearActiveSelection: () => void;
  removeContextDoc: (path: string) => void;
  acceptProposal: (proposal: AssistantProposal) => void;
  rejectProposal: (proposal: AssistantProposal, feedback: string) => void;
  /**
   * Submit a composer message. Appends a user turn, then runs the stub
   * orchestrator (replaceable with a real chat endpoint) and appends the
   * resulting assistant turn + proposals.
   */
  sendMessage: (text: string) => void;
  /** Add a document to the active thread's context (used by @-mention). */
  attachContextDoc: (doc: AssistantContextDoc) => void;
};

/**
 * Marker selector applied to the assistant composer textarea so the
 * global ⌘K handler can keep listening even when focus is inside the
 * composer (the user typically wants ⌘K to dismiss the rail). Any other
 * input/textarea/contenteditable element should be left alone.
 */
export const ASSISTANT_COMPOSER_DATA_ATTR = "data-assistant-composer";

/**
 * Headless fallback returned when `useAssistant()` is called outside of an
 * `AssistantProvider`. The launcher embeds inside the page header, which
 * is rendered by unit tests in isolation; we don't want those tests to
 * have to wrap every page in a provider just because the topbar exposes
 * the launcher. The fallback intentionally exposes an empty store and
 * no-op handlers — the launcher is invisible in that mode.
 */
const FALLBACK_STORE: AssistantStore = {
  now: new Date(0).toISOString(),
  activeThreadId: "fallback",
  threads: [],
  proposals: {},
};

const FALLBACK_THREAD: AssistantThread = {
  id: "fallback",
  title: "AI assistant",
  updatedAt: new Date(0).toISOString(),
  preview: "",
  contextDocs: [],
  messages: [],
  docCount: 0,
};

const FALLBACK_VALUE: AssistantContextValue = {
  store: FALLBACK_STORE,
  mode: "closed",
  isOpen: false,
  isFullscreen: false,
  activeThread: FALLBACK_THREAD,
  openRail: () => {},
  close: () => {},
  toggleFullscreen: () => {},
  setMode: () => {},
  selectThread: () => {},
  clearActiveSelection: () => {},
  removeContextDoc: () => {},
  acceptProposal: () => {},
  rejectProposal: () => {},
  sendMessage: () => {},
  attachContextDoc: () => {},
};

const AssistantContext =
  React.createContext<AssistantContextValue>(FALLBACK_VALUE);

/**
 * Dedicated boolean context that flips to `true` only when an
 * `AssistantProvider` is mounted above the consumer. The launcher reads
 * this to hide itself outside the provider — and unlike comparing the
 * value context against the FALLBACK_VALUE singleton, this is robust to
 * the value object being spread or replaced.
 */
const AssistantMountedContext = React.createContext<boolean>(false);

export type AssistantProviderProps = {
  children: React.ReactNode;
  /** Optional override for tests / Storybook-style harnesses. */
  initialStore?: AssistantStore;
  /** Initial visibility — defaults to closed. */
  initialMode?: RailMode;
};

export function AssistantProvider({
  children,
  initialStore,
  initialMode = "closed",
}: AssistantProviderProps) {
  const [state, dispatch] = React.useReducer(reducer, undefined, () => {
    const store = initialStore ?? buildAssistantMockStore();
    return {
      store,
      mode: initialMode,
      activeThreadId: store.activeThreadId,
    };
  });

  const activeThread =
    state.store.threads.find((t) => t.id === state.activeThreadId) ??
    state.store.threads[0] ??
    FALLBACK_THREAD;

  const value = React.useMemo<AssistantContextValue>(
    () => ({
      store: state.store,
      mode: state.mode,
      isOpen: state.mode !== "closed",
      isFullscreen: state.mode === "fullscreen",
      activeThread,
      openRail: () => dispatch({ type: "open-rail" }),
      close: () => dispatch({ type: "close" }),
      toggleFullscreen: () => dispatch({ type: "toggle-fullscreen" }),
      setMode: (mode) => dispatch({ type: "set-mode", mode }),
      selectThread: (threadId) => dispatch({ type: "select-thread", threadId }),
      clearActiveSelection: () =>
        dispatch({ type: "clear-selection-on-active" }),
      removeContextDoc: (path) =>
        dispatch({ type: "remove-context-doc", path }),
      acceptProposal: (proposal) =>
        dispatch({
          type: "remove-proposal",
          threadId: state.activeThreadId,
          proposalId: proposal.proposalId,
        }),
      rejectProposal: (proposal, feedback) =>
        dispatch({
          type: "reject-proposal",
          threadId: state.activeThreadId,
          proposalId: proposal.proposalId,
          feedback,
        }),
      sendMessage: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const userMessage: AssistantMessage = {
          id: `m-${Date.now().toString(36)}`,
          role: "user",
          at: new Date().toISOString(),
          text: trimmed,
        };
        const result = respondToUserMessage({
          thread: activeThread,
          userMessage,
        });
        dispatch({
          type: "send-message",
          threadId: state.activeThreadId,
          userMessage,
          assistantMessage: result.assistantMessage,
          newProposals: result.newProposals,
        });
      },
      attachContextDoc: (doc) => dispatch({ type: "attach-context-doc", doc }),
    }),
    [state, activeThread],
  );

  // Global ⌘K / Ctrl-K opens the rail (and toggles closed → rail).
  // Bail when focus is inside an input/textarea/contenteditable so the
  // hotkey doesn't steal keystrokes the user expects to land in their
  // current field — except when the focus is the assistant composer
  // itself, where ⌘K is the natural toggle-close gesture.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const meta = isMac ? event.metaKey : event.ctrlKey;
      if (!meta) return;
      if (event.key !== "k" && event.key !== "K") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable) &&
        !target.closest(`[${ASSISTANT_COMPOSER_DATA_ATTR}]`)
      ) {
        return;
      }
      event.preventDefault();
      dispatch({ type: "open-rail" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AssistantMountedContext.Provider value={true}>
      <AssistantContext.Provider value={value}>
        {children}
      </AssistantContext.Provider>
    </AssistantMountedContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  return React.useContext(AssistantContext);
}

/**
 * `true` when the consumer is inside a real `AssistantProvider` rather
 * than the headless fallback. Components like the topbar launcher use
 * this to hide themselves entirely outside the provider.
 */
export function useAssistantMounted(): boolean {
  return React.useContext(AssistantMountedContext);
}

export function relTime(iso: string, nowIso?: string): string {
  const d = new Date(iso);
  const now = nowIso ? new Date(nowIso) : new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return "";
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}
