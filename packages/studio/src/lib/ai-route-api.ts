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
    | "create_document";
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
  signal?: AbortSignal;
};

export type StudioAiApplyResult = {
  proposal: StudioAiProposal;
  document: ContentDocumentResponse;
};

export type StudioAiRejectRequest = {
  proposalId: string;
  signal?: AbortSignal;
};

export type StudioAiRouteApi = {
  inlineTransform(
    input: StudioAiInlineTransformRequest,
  ): Promise<StudioAiInlineTransformResult>;
  applyProposal(input: StudioAiApplyRequest): Promise<StudioAiApplyResult>;
  rejectProposal(
    input: StudioAiRejectRequest,
  ): Promise<{ proposal: StudioAiProposal }>;
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
 * createStudioAiRouteApi mirrors the `document-route-api.ts` factory but
 * targets `/api/v1/ai/*`. The proposal id returned from inline-transform
 * is opaque to callers — they pass it back to `applyProposal` or
 * `rejectProposal` to resolve the lifecycle.
 */
export function createStudioAiRouteApi(
  config: StudioAiRouteConfig,
  options: StudioAiRouteApiOptions = {},
): StudioAiRouteApi {
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
      const response = await fetchAi(config, options, url, {
        method: "POST",
        headers: targetHeaders(config),
        signal: input.signal,
        body: JSON.stringify({
          draftRevision: input.draftRevision,
          schemaHash: input.schemaHash,
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
      const response = await fetchAi(config, options, url, {
        method: "POST",
        headers: targetHeaders(config),
        signal: input.signal,
        body: "{}",
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
  };
}
