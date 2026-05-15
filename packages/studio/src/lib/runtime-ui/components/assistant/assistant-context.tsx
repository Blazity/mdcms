"use client";

import * as React from "react";

import { RuntimeError } from "@mdcms/shared";

import type {
  StudioAiChatMessageRequest,
  StudioAiChatMessageResult,
  StudioAiProposal,
  StudioAiRouteApi,
} from "../../../ai-route-api.js";
import type {
  AssistantContextDoc,
  AssistantMessage,
  AssistantProposal,
  AssistantStore,
  AssistantThread,
} from "./assistant-types.js";

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
  | { type: "toggle-thread-pin"; threadId: string }
  | { type: "create-thread"; thread: AssistantThread }
  | { type: "delete-thread"; threadId: string }
  | { type: "hydrate"; store: AssistantStore }
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
      /**
       * Wire-shape proposals matching `newProposals` by id. Persisted in
       * the store's `wireProposals` map so accept/reject can post them
       * back to the server intact, bypassing the in-memory proposal
       * store on the server side.
       */
      newWireProposals: Record<string, StudioAiProposal>;
    };

const NEW_THREAD_TITLE = "New conversation";

function deriveThreadTitle(text: string): string {
  const single = text.trim().replace(/\s+/g, " ");
  if (!single) return NEW_THREAD_TITLE;
  const trimmed = single.slice(0, 60);
  return single.length > 60 ? `${trimmed}…` : trimmed;
}

function makeEmptyThread(now: string, threadId?: string): AssistantThread {
  return {
    id:
      threadId ??
      `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: NEW_THREAD_TITLE,
    updatedAt: now,
    preview: "",
    contextDocs: [],
    messages: [],
    docCount: 0,
  };
}

export function buildEmptyAssistantStore(now: string): AssistantStore {
  const thread = makeEmptyThread(now);
  return {
    now,
    activeThreadId: thread.id,
    threads: [thread],
    proposals: {},
    wireProposals: {},
  };
}

function collectProposalDocPaths(p: AssistantProposal): string[] {
  if ("docPath" in p && p.docPath) return [p.docPath];
  return [];
}

/**
 * Map a wire-level `StudioAiProposal` (returned by the chat endpoint)
 * into the studio's local `AssistantProposal` discriminated union used
 * by the UI components. The wire schema carries a single-element
 * `operations` array per the SPEC-014 contract; the UI types flatten
 * that into per-kind `op` fields.
 *
 * `delete_document` proposals from the server stamp metadata onto the
 * shared `AiProposal` shape; the studio types model deletion as a
 * top-level kind without the wire's `operations` wrapper. We pick the
 * first operation and shape-shift here so the existing
 * `ProposalCard` router renders without changes.
 */
export function studioProposalFromWire(
  wire: StudioAiProposal,
): AssistantProposal | undefined {
  const op = wire.operations[0];
  if (!op) return undefined;

  const common = {
    proposalId: wire.proposalId,
    summary: wire.summary,
    validation: wire.validation,
    expiresAt: wire.expiresAt,
  };

  if (wire.kind === "replace_selection" && op.op === "replace_selection") {
    return {
      ...common,
      kind: "replace_selection",
      docPath: wire.documentId ?? "",
      type: wire.type,
      locale: wire.locale,
      baseDraftRevision: wire.baseDraftRevision,
      op: {
        op: "replace_selection",
        selectionId: op.selectionId,
        originalText: op.originalText,
        replacementText: op.replacementText,
      },
    };
  }
  if (wire.kind === "insert_block" && op.op === "insert_block") {
    return {
      ...common,
      kind: "insert_block",
      docPath: wire.documentId ?? "",
      type: wire.type,
      locale: wire.locale,
      baseDraftRevision: wire.baseDraftRevision,
      op: {
        op: "insert_block",
        ...(op.afterSelectionId
          ? { afterSelectionId: op.afterSelectionId }
          : {}),
        bodyMdx: op.bodyMdx,
      },
    };
  }
  if (wire.kind === "update_frontmatter" && op.op === "update_frontmatter") {
    return {
      ...common,
      kind: "update_frontmatter",
      docPath: wire.documentId ?? "",
      type: wire.type,
      locale: wire.locale,
      baseDraftRevision: wire.baseDraftRevision,
      op: {
        op: "update_frontmatter",
        patch: op.patch,
      },
    };
  }
  if (wire.kind === "create_document" && op.op === "create_document") {
    return {
      ...common,
      kind: "create_document",
      docPath: op.path,
      type: wire.type,
      locale: wire.locale,
      op: {
        op: "create_document",
        path: op.path,
        format: op.format,
        frontmatter: op.frontmatter,
        bodyPreview: op.body,
        bodyLines: op.body.split("\n").length,
      },
    };
  }
  if (wire.kind === "delete_document" && op.op === "delete_document") {
    return {
      ...common,
      kind: "delete_document",
      docPath: op.path,
      type: wire.type,
      locale: wire.locale,
      baseDraftRevision: wire.baseDraftRevision,
      op: {
        op: "delete_document",
        path: op.path,
        ...(op.reason ? { reason: op.reason } : {}),
      },
    };
  }
  return undefined;
}

/**
 * Side-channel context for the editor route to publish "which document
 * are we looking at right now" so the assistant rail can resolve the
 * schemaHash + documentId + draftRevision needed by the apply route.
 * The chat surface lives outside the editor route, so we can't read
 * those values directly from the page's local state; the editor sets
 * this via `AssistantActiveDocumentProvider` on mount.
 */
export type AssistantActiveDocument = {
  documentId: string;
  path: string;
  schemaHash: string;
  project: string;
  environment: string;
};

export const AssistantActiveDocumentContext =
  React.createContext<AssistantActiveDocument | null>(null);

export function AssistantActiveDocumentProvider({
  value,
  children,
}: {
  value: AssistantActiveDocument | null;
  children: React.ReactNode;
}) {
  return (
    <AssistantActiveDocumentContext.Provider value={value}>
      {children}
    </AssistantActiveDocumentContext.Provider>
  );
}

export function useAssistantActiveDocument(): AssistantActiveDocument | null {
  return React.useContext(AssistantActiveDocumentContext);
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
    case "toggle-thread-pin":
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((t) =>
            t.id === action.threadId ? { ...t, pinned: !t.pinned } : t,
          ),
        },
      };
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
            const nextContextDocs = [...t.contextDocs, action.doc];
            return {
              ...t,
              contextDocs: nextContextDocs,
              docCount: Math.max(t.docCount, nextContextDocs.length),
            };
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
          wireProposals: {
            ...state.store.wireProposals,
            ...action.newWireProposals,
          },
          threads: state.store.threads.map((thread) => {
            if (thread.id !== action.threadId) return thread;
            const docCount = new Set([
              ...thread.contextDocs.map((d) => d.path),
              ...action.newProposals.flatMap((p) => collectProposalDocPaths(p)),
            ]).size;
            const isFirstUserTurn =
              thread.title === NEW_THREAD_TITLE &&
              !thread.messages.some((m) => m.role === "user") &&
              action.userMessage.role === "user" &&
              !!action.userMessage.text;
            const nextTitle = isFirstUserTurn
              ? deriveThreadTitle(action.userMessage.text ?? "")
              : thread.title;
            const nextPreview = action.userMessage.text?.trim()
              ? action.userMessage.text.trim().slice(0, 120)
              : thread.preview;
            return {
              ...thread,
              title: nextTitle,
              preview: nextPreview,
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
    case "create-thread": {
      return {
        ...state,
        activeThreadId: action.thread.id,
        store: {
          ...state.store,
          activeThreadId: action.thread.id,
          threads: [action.thread, ...state.store.threads],
        },
      };
    }
    case "delete-thread": {
      const remaining = state.store.threads.filter(
        (t) => t.id !== action.threadId,
      );
      const proposalIdsToKeep = new Set(
        remaining.flatMap((t) => t.messages.flatMap((m) => m.proposals ?? [])),
      );
      const proposals = Object.fromEntries(
        Object.entries(state.store.proposals).filter(([pid]) =>
          proposalIdsToKeep.has(pid),
        ),
      );
      const wireProposals = Object.fromEntries(
        Object.entries(state.store.wireProposals).filter(([pid]) =>
          proposalIdsToKeep.has(pid),
        ),
      );
      const ensured =
        remaining.length === 0
          ? [makeEmptyThread(new Date().toISOString())]
          : remaining;
      const nextActive =
        state.activeThreadId === action.threadId
          ? (ensured[0]?.id ?? state.activeThreadId)
          : state.activeThreadId;
      return {
        ...state,
        activeThreadId: nextActive,
        store: {
          ...state.store,
          activeThreadId: nextActive,
          threads: ensured,
          proposals,
          wireProposals,
        },
      };
    }
    case "hydrate": {
      return {
        ...state,
        store: action.store,
        activeThreadId: action.store.activeThreadId,
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
      // Reject only strips the proposal from its host message. The
      // follow-up user turn (with rejectionFeedback + rejectedProposalId)
      // and the regenerated assistant turn are both appended by the
      // `runChatRequest` flow via `send-message` — keeping that owner
      // single avoids the duplicate-user-turn bug where reducer +
      // chat success both pushed the same feedback message.
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((thread) => {
            if (thread.id !== action.threadId) return thread;
            return {
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
  /** Toggle the `pinned` flag on a thread (used by the More menu). */
  toggleThreadPin: (threadId: string) => void;
  clearActiveSelection: () => void;
  removeContextDoc: (path: string) => void;
  acceptProposal: (proposal: AssistantProposal) => void;
  rejectProposal: (proposal: AssistantProposal, feedback: string) => void;
  /**
   * Submit a composer message. Appends a user turn, then calls the chat
   * endpoint via the injected `StudioAiRouteApi` and appends the assistant
   * turn + proposals on success (or an inline error turn on failure).
   */
  sendMessage: (text: string) => void;
  /** Add a document to the active thread's context (used by @-mention). */
  attachContextDoc: (doc: AssistantContextDoc) => void;
  /** Create a new empty thread and select it as active. */
  createThread: () => void;
  /** Remove a thread + its dangling proposals from the store. */
  deleteThread: (threadId: string) => void;
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
  wireProposals: {},
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
  toggleThreadPin: () => {},
  clearActiveSelection: () => {},
  removeContextDoc: () => {},
  acceptProposal: () => {},
  rejectProposal: () => {},
  sendMessage: () => {},
  attachContextDoc: () => {},
  createThread: () => {},
  deleteThread: () => {},
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
  /**
   * Studio AI route client. When provided, sendMessage / acceptProposal /
   * rejectProposal call the real `/api/v1/ai/*` endpoints. When omitted
   * (Storybook / unit-test paths) the provider exposes no-op handlers
   * and surfaces an inline "no api configured" error from sendMessage.
   */
  api?: StudioAiRouteApi;
  /**
   * Fetch the active project's schemaHash. Required for the apply route,
   * which validates that the client's view of the schema matches the
   * server's. Used as a fallback when no document is open in the editor
   * (e.g. applying a `create_document` proposal from the standalone
   * assistant page) — open-editor flows use `useAssistantActiveDocument`
   * which already carries schemaHash. The provider caches the result for
   * the session lifetime.
   */
  schemaHashFetcher?: () => Promise<string | null>;
  /**
   * localStorage key for persisting the thread store across reloads.
   * When omitted, persistence is disabled (tests / storybook). The admin
   * layout passes a key scoped to `<project>:<environment>` so projects
   * don't bleed conversations between each other.
   */
  storageKey?: string;
};

// v2 adds the `wireProposals` map needed by the chat surface to round-
// trip proposals back to the apply/reject routes without depending on
// the server's in-memory proposal store. v1 data is discarded on load.
const STORAGE_VERSION = 2;

function loadStoreFromStorage(key: string): AssistantStore | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      v?: number;
      store?: AssistantStore;
    };
    if (parsed.v !== STORAGE_VERSION || !parsed.store) return undefined;
    const store = parsed.store;
    if (
      !Array.isArray(store.threads) ||
      typeof store.activeThreadId !== "string" ||
      typeof store.now !== "string" ||
      !store.proposals ||
      typeof store.proposals !== "object" ||
      !store.wireProposals ||
      typeof store.wireProposals !== "object"
    ) {
      return undefined;
    }
    return store;
  } catch {
    return undefined;
  }
}

function saveStoreToStorage(key: string, store: AssistantStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ v: STORAGE_VERSION, store }),
    );
  } catch {
    // Quota exceeded / private mode — swallow; persistence is best-effort.
  }
}

export function AssistantProvider({
  children,
  initialStore,
  initialMode = "closed",
  api,
  schemaHashFetcher,
  storageKey,
}: AssistantProviderProps) {
  const [state, dispatch] = React.useReducer(reducer, undefined, () => {
    const persisted = storageKey ? loadStoreFromStorage(storageKey) : undefined;
    const store =
      initialStore ??
      persisted ??
      buildEmptyAssistantStore(new Date().toISOString());
    return {
      store,
      mode: initialMode,
      activeThreadId: store.activeThreadId,
    };
  });
  const activeDocument = useAssistantActiveDocument();

  const activeThread =
    state.store.threads.find((t) => t.id === state.activeThreadId) ??
    state.store.threads[0] ??
    FALLBACK_THREAD;

  // Keep the latest active-doc, thread, and api in refs so the async
  // handlers always read the current value rather than what was bound
  // when sendMessage / acceptProposal closed over.
  const apiRef = React.useRef(api);
  React.useEffect(() => {
    apiRef.current = api;
  }, [api]);
  const activeDocumentRef = React.useRef(activeDocument);
  React.useEffect(() => {
    activeDocumentRef.current = activeDocument;
  }, [activeDocument]);
  const activeThreadRef = React.useRef(activeThread);
  React.useEffect(() => {
    activeThreadRef.current = activeThread;
  }, [activeThread]);

  // Cache the project schemaHash for the session — apply needs it, but
  // we don't want a refetch on every accept click. The fetcher is built
  // once by the admin layout from the schema route API.
  const schemaHashFetcherRef = React.useRef(schemaHashFetcher);
  React.useEffect(() => {
    schemaHashFetcherRef.current = schemaHashFetcher;
  }, [schemaHashFetcher]);
  const cachedSchemaHashRef = React.useRef<string | null>(null);
  const inflightSchemaHashRef = React.useRef<Promise<string | null> | null>(
    null,
  );
  const resolveSchemaHash = React.useCallback(async (): Promise<
    string | null
  > => {
    const liveDoc = activeDocumentRef.current;
    if (liveDoc?.schemaHash) return liveDoc.schemaHash;
    if (cachedSchemaHashRef.current) return cachedSchemaHashRef.current;
    const fetcher = schemaHashFetcherRef.current;
    if (!fetcher) return null;
    if (!inflightSchemaHashRef.current) {
      inflightSchemaHashRef.current = (async () => {
        try {
          const value = await fetcher();
          cachedSchemaHashRef.current = value;
          return value;
        } finally {
          inflightSchemaHashRef.current = null;
        }
      })();
    }
    return inflightSchemaHashRef.current;
  }, []);

  // Append an error turn rendered as a plain assistant text message
  // carrying the wire-level error code so the UI can show it inline.
  const appendErrorTurn = React.useCallback(
    (userMessage: AssistantMessage, error: unknown) => {
      const code =
        error instanceof RuntimeError ? error.code : "AI_REQUEST_FAILED";
      const message =
        error instanceof Error ? error.message : "AI request failed.";
      const assistantMessage: AssistantMessage = {
        id: `m-err-${Date.now().toString(36)}`,
        role: "assistant",
        at: new Date().toISOString(),
        text: `${code}: ${message}`,
      };
      dispatch({
        type: "send-message",
        threadId: state.activeThreadId,
        userMessage,
        assistantMessage,
        newProposals: [],
        newWireProposals: {},
      });
    },
    [state.activeThreadId],
  );

  const runChatRequest = React.useCallback(
    async (input: {
      userMessage: AssistantMessage;
      message: string;
      conversationId?: string;
      rejectedProposalId?: string;
      rejectedProposal?: StudioAiProposal;
      rejectionFeedback?: string;
    }) => {
      const liveApi = apiRef.current;
      const liveDoc = activeDocumentRef.current;
      const liveThread = activeThreadRef.current;

      if (!liveApi) {
        appendErrorTurn(
          input.userMessage,
          new RuntimeError({
            code: "AI_CHAT_UNAVAILABLE",
            message:
              "The AI chat endpoint is not configured for this Studio mount.",
            statusCode: 503,
          }),
        );
        return;
      }

      const attachedDocumentIds: string[] = [];
      if (liveDoc?.documentId) {
        attachedDocumentIds.push(liveDoc.documentId);
      }
      for (const ctx of liveThread.contextDocs) {
        if (ctx.documentId && !attachedDocumentIds.includes(ctx.documentId)) {
          attachedDocumentIds.push(ctx.documentId);
        }
      }

      // Build a rolling window of prior conversation turns so the server
      // can resolve anaphora across the thread. Skip empty assistant
      // turns (proposal-only with no text) since they carry no signal
      // the model can resolve against without seeing the proposal body.
      const conversationHistory = liveThread.messages
        .map((m) => {
          const text = m.text?.trim();
          if (!text) return undefined;
          return { role: m.role, text };
        })
        .filter(
          (t): t is { role: "user" | "assistant"; text: string } =>
            t !== undefined,
        )
        .slice(-10);

      const request: StudioAiChatMessageRequest = {
        message: input.message,
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
        ...(attachedDocumentIds.length > 0 ? { attachedDocumentIds } : {}),
        ...(input.rejectedProposalId
          ? { rejectedProposalId: input.rejectedProposalId }
          : {}),
        ...(input.rejectedProposal
          ? { rejectedProposal: input.rejectedProposal }
          : {}),
        ...(input.rejectionFeedback
          ? { rejectionFeedback: input.rejectionFeedback }
          : {}),
        ...(conversationHistory.length > 0 ? { conversationHistory } : {}),
      };

      try {
        const result: StudioAiChatMessageResult =
          await liveApi.chatMessage(request);
        const wireProposals = result.proposals ?? [];
        const newProposals: AssistantProposal[] = [];
        const newWireProposals: Record<string, StudioAiProposal> = {};
        for (const wp of wireProposals) {
          const mapped = studioProposalFromWire(wp);
          if (mapped) {
            newProposals.push(mapped);
            // Persist the original wire shape so accept/reject can post
            // it back to the server intact. The render-time studio shape
            // is a lossy projection (e.g. body → bodyPreview), so we
            // can't reconstruct the wire body from the rendered one.
            newWireProposals[wp.proposalId] = wp;
          }
        }
        const assistantMessage: AssistantMessage = {
          id: result.message.id,
          role: "assistant",
          at: result.message.at,
          ...(result.message.text ? { text: result.message.text } : {}),
          ...(newProposals.length > 0
            ? { proposals: newProposals.map((p) => p.proposalId) }
            : {}),
          ...(result.message.rejectedProposalId
            ? { rejectedProposalId: result.message.rejectedProposalId }
            : {}),
        };
        dispatch({
          type: "send-message",
          threadId: state.activeThreadId,
          userMessage: input.userMessage,
          assistantMessage,
          newProposals,
          newWireProposals,
        });
      } catch (error) {
        appendErrorTurn(input.userMessage, error);
      }
    },
    [appendErrorTurn, state.activeThreadId],
  );

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
      toggleThreadPin: (threadId) =>
        dispatch({ type: "toggle-thread-pin", threadId }),
      clearActiveSelection: () =>
        dispatch({ type: "clear-selection-on-active" }),
      removeContextDoc: (path) =>
        dispatch({ type: "remove-context-doc", path }),
      acceptProposal: (proposal) => {
        void (async () => {
          const liveApi = apiRef.current;
          const placeholderUser: AssistantMessage = {
            id: `m-accept-${Date.now().toString(36)}`,
            role: "user",
            at: new Date().toISOString(),
            text: `Accept ${proposal.proposalId}`,
          };
          if (!liveApi) {
            appendErrorTurn(
              placeholderUser,
              new RuntimeError({
                code: "AI_APPLY_UNAVAILABLE",
                message:
                  "AI route is not configured for this Studio mount — apply is disabled.",
                statusCode: 503,
              }),
            );
            return;
          }
          const schemaHash = await resolveSchemaHash();
          if (!schemaHash) {
            // schemaHash is project-scoped — needed for every apply,
            // including create_document. We only end up here when both
            // the editor context (`useAssistantActiveDocument`) and the
            // schemaHashFetcher prop are missing, which is unexpected
            // in admin layout but possible in tests/storybook.
            appendErrorTurn(
              placeholderUser,
              new RuntimeError({
                code: "SCHEMA_HASH_UNAVAILABLE",
                message:
                  "Studio could not resolve the project schemaHash needed to apply this proposal.",
                statusCode: 503,
              }),
            );
            return;
          }
          // Send the wire-shape proposal body so the server doesn't
          // need to look it up in its in-memory store — chat proposals
          // live entirely client-side.
          const wireProposal = state.store.wireProposals[
            proposal.proposalId
          ] as StudioAiProposal | undefined;
          try {
            await liveApi.applyProposal({
              proposalId: proposal.proposalId,
              draftRevision:
                "baseDraftRevision" in proposal
                  ? proposal.baseDraftRevision
                  : undefined,
              schemaHash,
              ...(wireProposal ? { proposal: wireProposal } : {}),
            });
            dispatch({
              type: "remove-proposal",
              threadId: state.activeThreadId,
              proposalId: proposal.proposalId,
            });
          } catch (error) {
            appendErrorTurn(placeholderUser, error);
          }
        })();
      },
      rejectProposal: (proposal, feedback) => {
        void (async () => {
          const liveApi = apiRef.current;
          const trimmed = feedback.trim();
          const wireProposal = state.store.wireProposals[
            proposal.proposalId
          ] as StudioAiProposal | undefined;
          try {
            if (liveApi) {
              await liveApi.rejectProposal({
                proposalId: proposal.proposalId,
                ...(wireProposal ? { proposal: wireProposal } : {}),
              });
            }
            dispatch({
              type: "reject-proposal",
              threadId: state.activeThreadId,
              proposalId: proposal.proposalId,
              feedback,
            });
            // If the user supplied feedback, immediately request a
            // regenerated proposal via the chat endpoint with the
            // rejected proposal id forwarded.
            if (trimmed && liveApi) {
              const userMessage: AssistantMessage = {
                id: `m-${Date.now().toString(36)}`,
                role: "user",
                at: new Date().toISOString(),
                text: trimmed,
                rejectedProposalId: proposal.proposalId,
              };
              await runChatRequest({
                userMessage,
                message: trimmed,
                conversationId: activeThreadRef.current.id,
                rejectedProposalId: proposal.proposalId,
                ...(wireProposal ? { rejectedProposal: wireProposal } : {}),
                rejectionFeedback: trimmed,
              });
            }
          } catch (error) {
            const placeholderUser: AssistantMessage = {
              id: `m-reject-${Date.now().toString(36)}`,
              role: "user",
              at: new Date().toISOString(),
              text: trimmed || `Reject ${proposal.proposalId}`,
              ...(trimmed ? { rejectedProposalId: proposal.proposalId } : {}),
            };
            appendErrorTurn(placeholderUser, error);
          }
        })();
      },
      sendMessage: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const userMessage: AssistantMessage = {
          id: `m-${Date.now().toString(36)}`,
          role: "user",
          at: new Date().toISOString(),
          text: trimmed,
        };
        void runChatRequest({
          userMessage,
          message: trimmed,
          conversationId: activeThread.id,
        });
      },
      attachContextDoc: (doc) => dispatch({ type: "attach-context-doc", doc }),
      createThread: () => {
        const thread = makeEmptyThread(new Date().toISOString());
        dispatch({ type: "create-thread", thread });
      },
      deleteThread: (threadId) => {
        dispatch({ type: "delete-thread", threadId });
      },
    }),
    [state, activeThread, appendErrorTurn, runChatRequest, resolveSchemaHash],
  );

  // Persist the store to localStorage whenever it changes — best-effort.
  // The activeThreadId from the reducer (top-level) wins so we don't
  // restore to a thread the user has navigated away from.
  React.useEffect(() => {
    if (!storageKey) return;
    saveStoreToStorage(storageKey, {
      ...state.store,
      activeThreadId: state.activeThreadId,
    });
  }, [storageKey, state.store, state.activeThreadId]);

  // Mode is read inside the once-mounted ⌘K handler, so keep a ref in
  // sync with the latest reducer state to avoid stale closure reads.
  const modeRef = React.useRef(state.mode);
  React.useEffect(() => {
    modeRef.current = state.mode;
  }, [state.mode]);

  // Global ⌘K / Ctrl-K behaviour:
  //   closed                              →  open the rail
  //   open + composer focused             →  close the rail
  //   open + composer NOT focused         →  focus the composer
  // Bail when focus is in an input/textarea/contenteditable that is
  // NOT the assistant composer, so we don't steal keystrokes from the
  // user's current field.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMac = (() => {
        if (typeof navigator === "undefined") return false;
        // `navigator.userAgentData.platform` is the modern, non-deprecated
        // surface; fall back to `navigator.platform` on browsers that
        // haven't shipped UA-CH yet (Safari at the time of writing).
        const uaData = (
          navigator as unknown as {
            userAgentData?: { platform?: string };
          }
        ).userAgentData;
        if (uaData?.platform) return /Mac/i.test(uaData.platform);
        return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      })();
      const meta = isMac ? event.metaKey : event.ctrlKey;
      if (!meta) return;
      if (event.key !== "k" && event.key !== "K") return;

      const target = event.target as HTMLElement | null;
      const composerSelector = `[${ASSISTANT_COMPOSER_DATA_ATTR}]`;
      const inComposer = !!target?.closest(composerSelector);

      // Only swallow ⌘K when it's harmless — i.e., we're not stealing it
      // from a form input the user is typing into. Notably we DO want to
      // capture from the TipTap editor body (a contenteditable region):
      // it has no native ⌘K binding, the assistant rail is the primary
      // ⌘K consumer in this product, and a previous version of this
      // guard incorrectly bailed for contenteditable, breaking ⌘K every
      // time the editor was focused.
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT") &&
        !inComposer
      ) {
        return;
      }

      event.preventDefault();

      const mode = modeRef.current;
      if (mode === "closed") {
        dispatch({ type: "open-rail" });
        return;
      }

      if (inComposer) {
        // Already typing in the composer → toggle close.
        dispatch({ type: "close" });
        return;
      }

      // Rail is visible but composer isn't focused → focus it.
      const composerTextarea = document.querySelector(
        `${composerSelector} textarea`,
      ) as HTMLTextAreaElement | null;
      if (composerTextarea) {
        composerTextarea.focus();
        // Place the caret at end so the user can keep typing without
        // re-selecting.
        const end = composerTextarea.value.length;
        composerTextarea.setSelectionRange(end, end);
      }
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
