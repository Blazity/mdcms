import { RuntimeError, type ContentDocumentResponse } from "@mdcms/shared";

import {
  applyStudioAuthToRequestInit,
  isStudioCookieAuth,
  type StudioRuntimeAuth,
} from "./request-auth.js";
import { resolveStudioRelativeUrl } from "./url-resolution.js";
import type { MdcmsConfig } from "./studio-component.js";

export type StudioAiRouteConfig = Pick<
  MdcmsConfig,
  "project" | "environment" | "serverUrl"
>;

export type StudioAiRouteApiOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

/**
 * Inline-transform actions are scoped to selection-anchored copy edits.
 * Frontmatter (SEO) suggestions and MDX block insertion are produced
 * through other surfaces (properties panel and slash menu / chat
 * respectively) per SPEC-014 §Inline Selection Transforms.
 */
export type StudioAiInlineAction =
  | "rewrite"
  | "shorten"
  | "expand"
  | "change_tone"
  | "fix_grammar"
  | "improve_clarity";

export type StudioAiProposalOperation =
  | {
      op: "replace_selection";
      selectionId: string;
      originalText: string;
      replacementText: string;
    }
  | {
      op: "insert_block";
      afterSelectionId?: string;
      bodyMdx: string;
    }
  | {
      op: "update_frontmatter";
      patch: Record<string, unknown>;
    }
  | {
      op: "create_document";
      path: string;
      format: "md" | "mdx";
      frontmatter: Record<string, unknown>;
      body: string;
    }
  | {
      op: "delete_document";
      path: string;
      reason?: string;
    };

export type StudioAiProposalValidation =
  | { status: "valid" }
  | {
      status: "invalid";
      errors: { code: string; message: string; path?: string }[];
    };

export type StudioAiProposal = {
  proposalId: string;
  kind:
    | "replace_selection"
    | "insert_block"
    | "update_frontmatter"
    | "create_document"
    | "delete_document";
  project: string;
  environment: string;
  documentId?: string;
  baseDraftRevision?: number;
  type: string;
  locale: string;
  summary: string;
  operations: StudioAiProposalOperation[];
  validation: StudioAiProposalValidation;
  expiresAt: string;
  provider: {
    providerId: string;
    model: string;
    promptTemplateId: string;
  };
};

export type StudioAiInlineTransformRequest = {
  documentId?: string;
  draftRevision?: number;
  /** Stable id for the selection range; the server stamps this onto every replacement op. */
  selectionId: string;
  /** Plain-text contents of the selection. */
  selectedText: string;
  action: StudioAiInlineAction;
  instruction?: string;
  /** Required when `action` is `change_tone`; ignored otherwise. */
  tone?: string;
  signal?: AbortSignal;
};

export type StudioAiInlineTransformResult = {
  proposals: StudioAiProposal[];
};

export type StudioAiApplyRequest = {
  proposalId: string;
  draftRevision?: number;
  schemaHash: string;
  /**
   * Full proposal body. The chat surface persists proposals client-side
   * and sends the body back here so apply doesn't depend on the
   * server's in-memory proposal store surviving a restart. Inline
   * transforms omit this and rely on a proposalId lookup.
   */
  proposal?: StudioAiProposal;
  signal?: AbortSignal;
};

export type StudioAiApplyResult = {
  proposal: StudioAiProposal;
  document: ContentDocumentResponse;
};

export type StudioAiRejectRequest = {
  proposalId: string;
  /**
   * Full proposal body — same rationale as in `StudioAiApplyRequest`.
   * When the chat surface rejects a client-owned proposal it sends the
   * body here so the server doesn't need a store lookup.
   */
  proposal?: StudioAiProposal;
  signal?: AbortSignal;
};

export type StudioAiChatAllowedAction =
  | "answer"
  | "edit_document"
  | "create_document"
  | "delete_document";

export type StudioAiChatAttachedSelection = {
  documentId: string;
  draftRevision: number;
  selectionId: string;
  text: string;
};

export type StudioAiChatConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

export type StudioAiChatMessageRequest = {
  message: string;
  conversationId?: string;
  attachedDocumentIds?: string[];
  attachedSelection?: StudioAiChatAttachedSelection;
  rejectedProposalId?: string;
  /**
   * Full body of the rejected proposal — sent so the regenerate flow
   * doesn't depend on the server's in-memory proposal store.
   */
  rejectedProposal?: StudioAiProposal;
  rejectionFeedback?: string;
  allowedActions?: StudioAiChatAllowedAction[];
  /**
   * Prior conversation turns from the same thread, oldest first. The
   * server is stateless per request — the client owns conversation
   * memory — so we send a rolling window of recent turns alongside the
   * new message so the model can resolve anaphora across the thread.
   */
  conversationHistory?: StudioAiChatConversationTurn[];
  signal?: AbortSignal;
};

export type StudioAiChatMessage = {
  id: string;
  role: "user" | "assistant";
  at: string;
  text?: string;
  proposals?: string[];
  rejectedProposalId?: string;
};

export type StudioAiChatMessageResult = {
  conversationId: string;
  message: StudioAiChatMessage;
  proposals?: StudioAiProposal[];
};

export type StudioAiRouteApi = {
  inlineTransform(
    input: StudioAiInlineTransformRequest,
  ): Promise<StudioAiInlineTransformResult>;
  applyProposal(input: StudioAiApplyRequest): Promise<StudioAiApplyResult>;
  rejectProposal(
    input: StudioAiRejectRequest,
  ): Promise<{ proposal: StudioAiProposal }>;
  chatMessage(
    input: StudioAiChatMessageRequest,
  ): Promise<StudioAiChatMessageResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildAiUrl(config: StudioAiRouteConfig, path: string): URL {
  return resolveStudioRelativeUrl(path, config.serverUrl);
}

function targetHeaders(
  config: StudioAiRouteConfig,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "x-mdcms-project": config.project,
    "x-mdcms-environment": config.environment,
    "content-type": "application/json",
    ...(extra ?? {}),
  };
}

function isDevEnvironment(): boolean {
  try {
    return (
      typeof process !== "undefined" && process.env?.NODE_ENV !== "production"
    );
  } catch {
    return false;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isDevEnvironment()) {
      // eslint-disable-next-line no-console -- dev-only diagnostic
      console.warn(
        `[mdcms-studio] failed to parse AI route JSON (status ${response.status}, url ${response.url})`,
        error,
      );
    }
    return undefined;
  }
}

function failureFromResponse(
  operation: string,
  response: Response,
  payload: unknown,
  fallback: string,
): RuntimeError {
  const code =
    isRecord(payload) && typeof payload.code === "string" && payload.code
      ? payload.code
      : "AI_REQUEST_FAILED";
  const message =
    isRecord(payload) && typeof payload.message === "string" && payload.message
      ? payload.message
      : fallback;

  return new RuntimeError({
    code,
    message,
    statusCode: response.status,
    details: {
      operation,
      status: response.status,
      payload,
    },
  });
}

function unwrapData<T>(operation: string, payload: unknown): T {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new RuntimeError({
      code: "AI_REQUEST_FAILED",
      message: `Unexpected response shape for ${operation}.`,
      statusCode: 500,
    });
  }

  return payload.data as T;
}

async function fetchAi(
  config: StudioAiRouteConfig,
  options: StudioAiRouteApiOptions,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const cookieAuth = options.auth && isStudioCookieAuth(options.auth);
  const finalInit = applyStudioAuthToRequestInit(options.auth, init);

  return fetcher(url.toString(), {
    ...finalInit,
    credentials: cookieAuth ? "include" : finalInit.credentials,
  });
}

/**
 * Bootstrap (and cache) the studio CSRF token used by state-changing
 * AI endpoints: chat-message, apply, and reject all gate session-auth
 * mutations on a valid `x-mdcms-csrf-token`. API-key auth is exempt
 * server-side (the bearer header itself proves intent), so we skip the
 * extra round-trip in that case.
 *
 * The token is fetched once per `createStudioAiRouteApi` lifetime and
 * shared across all three endpoints — matching the cadence the
 * document-route API uses for content mutations. If the session
 * endpoint omits the token (e.g. on an unauthenticated cookie request)
 * we return undefined and let the server respond with its own 403.
 */
function createCsrfTokenLoader(
  config: StudioAiRouteConfig,
  options: StudioAiRouteApiOptions,
): () => Promise<string | undefined> {
  let cachedPromise: Promise<string | undefined> | undefined;

  return () => {
    if (!options.auth || !isStudioCookieAuth(options.auth)) {
      return Promise.resolve(undefined);
    }
    if (!cachedPromise) {
      cachedPromise = (async () => {
        try {
          const url = buildAiUrl(config, "/api/v1/auth/session");
          const response = await fetchAi(config, options, url, {
            method: "GET",
            headers: { "content-type": "application/json" },
          });
          if (!response.ok) return undefined;
          const payload = await readJson(response);
          if (!isRecord(payload) || !isRecord(payload.data)) return undefined;
          const token = payload.data.csrfToken;
          return typeof token === "string" && token.length > 0
            ? token
            : undefined;
        } catch {
          return undefined;
        }
      })();
    }
    return cachedPromise;
  };
}

/**
 * createStudioAiRouteApi mirrors the `document-route-api.ts` factory but
 * targets `/api/v1/ai/*`. The proposal id returned from inline-transform
 * is opaque to callers — they pass it back to `applyProposal` or
 * `rejectProposal` to resolve the lifecycle.
 */
export function createStudioAiRouteApi(
  config: StudioAiRouteConfig,
  options: StudioAiRouteApiOptions = {},
): StudioAiRouteApi {
  const loadCsrfToken = createCsrfTokenLoader(config, options);
  return {
    async inlineTransform(input) {
      const url = buildAiUrl(config, "/api/v1/ai/inline-transform");
      const response = await fetchAi(config, options, url, {
        method: "POST",
        headers: targetHeaders(config),
        signal: input.signal,
        body: JSON.stringify({
          documentId: input.documentId,
          draftRevision: input.draftRevision,
          selectionId: input.selectionId,
          selectedText: input.selectedText,
          action: input.action,
          instruction: input.instruction,
          tone: input.tone,
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw failureFromResponse(
          "POST /api/v1/ai/inline-transform",
          response,
          payload,
          "Failed to request AI inline transform.",
        );
      }

      return unwrapData<StudioAiInlineTransformResult>(
        "POST /api/v1/ai/inline-transform",
        payload,
      );
    },
    async applyProposal(input) {
      const url = buildAiUrl(
        config,
        `/api/v1/ai/proposals/${encodeURIComponent(input.proposalId)}/apply`,
      );
      const csrfToken = await loadCsrfToken();
      const response = await fetchAi(config, options, url, {
        method: "POST",
        headers: targetHeaders(
          config,
          csrfToken ? { "x-mdcms-csrf-token": csrfToken } : undefined,
        ),
        signal: input.signal,
        body: JSON.stringify({
          draftRevision: input.draftRevision,
          schemaHash: input.schemaHash,
          ...(input.proposal !== undefined ? { proposal: input.proposal } : {}),
        }),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw failureFromResponse(
          "POST /api/v1/ai/proposals/:id/apply",
          response,
          payload,
          "Failed to apply AI proposal.",
        );
      }

      return unwrapData<StudioAiApplyResult>(
        "POST /api/v1/ai/proposals/:id/apply",
        payload,
      );
    },
    async rejectProposal(input) {
      const url = buildAiUrl(
        config,
        `/api/v1/ai/proposals/${encodeURIComponent(input.proposalId)}/reject`,
      );
      const csrfToken = await loadCsrfToken();
      const response = await fetchAi(config, options, url, {
        method: "POST",
        headers: targetHeaders(
          config,
          csrfToken ? { "x-mdcms-csrf-token": csrfToken } : undefined,
        ),
        signal: input.signal,
        body: JSON.stringify(
          input.proposal !== undefined ? { proposal: input.proposal } : {},
        ),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw failureFromResponse(
          "POST /api/v1/ai/proposals/:id/reject",
          response,
          payload,
          "Failed to reject AI proposal.",
        );
      }

      return unwrapData<{ proposal: StudioAiProposal }>(
        "POST /api/v1/ai/proposals/:id/reject",
        payload,
      );
    },
    async chatMessage(input) {
      const url = buildAiUrl(config, "/api/v1/ai/chat/messages");
      const body: Record<string, unknown> = {
        message: input.message,
      };
      if (input.conversationId !== undefined) {
        body.conversationId = input.conversationId;
      }
      if (input.attachedDocumentIds && input.attachedDocumentIds.length > 0) {
        body.attachedDocumentIds = input.attachedDocumentIds;
      }
      if (input.attachedSelection !== undefined) {
        body.attachedSelection = input.attachedSelection;
      }
      if (input.rejectedProposalId !== undefined) {
        body.rejectedProposalId = input.rejectedProposalId;
      }
      if (input.rejectedProposal !== undefined) {
        body.rejectedProposal = input.rejectedProposal;
      }
      if (input.rejectionFeedback !== undefined) {
        body.rejectionFeedback = input.rejectionFeedback;
      }
      if (input.allowedActions && input.allowedActions.length > 0) {
        body.allowedActions = input.allowedActions;
      }
      if (input.conversationHistory && input.conversationHistory.length > 0) {
        body.conversationHistory = input.conversationHistory;
      }

      const csrfToken = await loadCsrfToken();
      const response = await fetchAi(config, options, url, {
        method: "POST",
        headers: targetHeaders(
          config,
          csrfToken ? { "x-mdcms-csrf-token": csrfToken } : undefined,
        ),
        signal: input.signal,
        body: JSON.stringify(body),
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw failureFromResponse(
          "POST /api/v1/ai/chat/messages",
          response,
          payload,
          "Failed to send AI chat message.",
        );
      }

      return unwrapData<StudioAiChatMessageResult>(
        "POST /api/v1/ai/chat/messages",
        payload,
      );
    },
  };
}
