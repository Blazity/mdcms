import { RuntimeError } from "@mdcms/shared";

import type { MdcmsConfig } from "./studio-component.js";

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
  fetcher?: typeof fetch;
};

type ContentGetResponse = {
  data?: {
    documentId?: string;
    type?: string;
    locale?: string;
    path?: string;
    body?: string;
    updatedAt?: string;
  };
  code?: string;
  message?: string;
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
  const fetcher = options.fetcher ?? fetch;
  const url = new URL(
    `/api/v1/content/${encodeURIComponent(input.documentId)}`,
    config.serverUrl,
  );
  url.searchParams.set("draft", "true");

  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        "x-mdcms-project": config.project,
        "x-mdcms-environment": config.environment,
        "x-mdcms-locale": locale,
      },
    });
    const payload = (await response.json()) as ContentGetResponse;

    if (!response.ok) {
      throw new RuntimeError({
        code: payload.code ?? "DOCUMENT_LOAD_FAILED",
        message: payload.message ?? "Failed to load document content.",
        statusCode: response.status,
      });
    }

    if (!payload.data?.documentId || !payload.data.path) {
      throw new RuntimeError({
        code: "DOCUMENT_LOAD_FAILED",
        message: "Document response payload is missing required fields.",
        statusCode: 500,
      });
    }

    return {
      state: "ready",
      type: input.type,
      documentId: input.documentId,
      locale,
      data: {
        documentId: payload.data.documentId,
        type: payload.data.type ?? input.type,
        locale: payload.data.locale ?? locale,
        path: payload.data.path,
        body: payload.data.body ?? "",
        updatedAt: payload.data.updatedAt ?? "",
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
