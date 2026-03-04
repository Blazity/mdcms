import { RuntimeError } from "@mdcms/shared";

import type { StudioConfig } from "./studio-component.js";

export type StudioDocumentShellState = "loading" | "ready" | "error";

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

/**
 * loadStudioDocumentShell fetches draft-scoped document content for the
 * `/admin/content/:type/:documentId` shell route with explicit target headers.
 */
export async function loadStudioDocumentShell(
  config: StudioConfig,
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
    const message =
      error instanceof Error ? error.message : "Failed to load document shell.";
    return {
      state: "error",
      type: input.type,
      documentId: input.documentId,
      locale,
      errorMessage: message,
    };
  }
}
