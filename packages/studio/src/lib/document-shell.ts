import { RuntimeError } from "@mdcms/shared";

import type { MdcmsConfig } from "./studio-component.js";
import { createStudioDocumentRouteApi } from "./document-route-api.js";
import type { StudioRuntimeAuth } from "./request-auth.js";

export type StudioDocumentShellState = "loading" | "ready" | "error";

export type StudioDocumentShellErrorCode =
  | "DOCUMENT_LOAD_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ERROR";

export type StudioDocumentShellData = {
  documentId: string;
  type: string;
  locale: string;
  path: string;
  body: string;
  updatedAt: string;
};

export type StudioDocumentShell = {
  state: StudioDocumentShellState;
  type: string;
  documentId: string;
  locale: string;
  data?: StudioDocumentShellData;
  errorCode?: StudioDocumentShellErrorCode;
  errorMessage?: string;
};

export type LoadStudioDocumentShellInput = {
  type: string;
  documentId: string;
  locale?: string;
};

type LoadStudioDocumentShellOptions = {
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
};

const STUDIO_DOCUMENT_SHELL_ERROR_CODES: ReadonlySet<StudioDocumentShellErrorCode> =
  new Set([
    "DOCUMENT_LOAD_FAILED",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "INTERNAL_ERROR",
    "UNKNOWN_ERROR",
  ]);

function normalizeDocumentShellErrorCode(
  code: unknown,
): StudioDocumentShellErrorCode {
  if (
    typeof code === "string" &&
    STUDIO_DOCUMENT_SHELL_ERROR_CODES.has(code as StudioDocumentShellErrorCode)
  ) {
    return code as StudioDocumentShellErrorCode;
  }

  return "UNKNOWN_ERROR";
}

function toDocumentShellError(error: unknown): {
  code: StudioDocumentShellErrorCode;
  message: string;
} {
  if (error instanceof RuntimeError) {
    return {
      code: normalizeDocumentShellErrorCode(error.code),
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message || "Failed to load document shell.",
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "Failed to load document shell.",
  };
}

/**
 * loadStudioDocumentShell fetches draft-scoped document content for the
 * `/admin/content/:type/:documentId` shell route with explicit target headers.
 */
export async function loadStudioDocumentShell(
  config: MdcmsConfig,
  input: LoadStudioDocumentShellInput,
  options: LoadStudioDocumentShellOptions = {},
): Promise<StudioDocumentShell> {
  const locale = input.locale?.trim() || "en";
  const documentRouteApi = createStudioDocumentRouteApi(config, {
    auth: options.auth,
    fetcher: options.fetcher,
  });

  try {
    const document = await documentRouteApi.loadDraft({
      type: input.type,
      documentId: input.documentId,
      locale,
    });

    return {
      state: "ready",
      type: input.type,
      documentId: input.documentId,
      locale,
      data: {
        documentId: document.documentId,
        type: document.type ?? input.type,
        locale: document.locale ?? locale,
        path: document.path,
        body: document.body ?? "",
        updatedAt: document.updatedAt ?? "",
      },
    };
  } catch (error) {
    const failure = toDocumentShellError(error);
    return {
      state: "error",
      type: input.type,
      documentId: input.documentId,
      locale,
      errorCode: failure.code,
      errorMessage: failure.message,
    };
  }
}
