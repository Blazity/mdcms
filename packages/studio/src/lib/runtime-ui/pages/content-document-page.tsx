"use client";

import {
  type ChangeEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  type ContentDocumentResponse,
  type ContentVersionSummaryResponse,
  RuntimeError,
  type StudioDocumentRouteMountContext,
  type StudioMountContext,
  type TranslationVariantSummary,
} from "@mdcms/shared";

import {
  loadStudioDocumentShell,
  type StudioDocumentShell,
  type StudioDocumentShellData,
} from "../../document-shell.js";
import {
  createStudioDocumentRouteApi,
  type StudioDocumentRouteApi,
} from "../../document-route-api.js";
import {
  loadStudioSchemaState,
  type StudioSchemaState,
} from "../../schema-state.js";
import {
  diffDocumentVersions,
  type DocumentVersionDiff,
} from "../../document-version-diff.js";
import { useParams, useRouter } from "../adapters/next-navigation.js";
import {
  MdxPropsPanel,
  type MdxPropsPanelSelection,
} from "../components/editor/mdx-props-panel.js";
import { TipTapEditor } from "../components/editor/tiptap-editor.js";
import { BreadcrumbTrail } from "../components/layout/page-header.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js";
import { Textarea } from "../components/ui/textarea.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip.js";
import {
  AlertCircle,
  Check,
  Globe,
  History,
  PanelRight,
  PanelRightClose,
  Send,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";

const DOCUMENT_SAVE_DEBOUNCE_MS = 5000;
const SCHEMA_MISMATCH_WRITE_MESSAGE =
  "Schema changes detected. Studio is read-only until schema sync resolves the mismatch.";
const SCHEMA_WRITE_GUARD_CODES = new Set([
  "SCHEMA_HASH_MISMATCH",
  "SCHEMA_NOT_SYNCED",
]);

type ContentDocumentSchemaReadyState = Extract<
  StudioSchemaState,
  {
    status: "ready";
  }
>;

export type ContentDocumentVersionHistoryState =
  | {
      status: "idle" | "loading" | "empty";
      versions: ContentVersionSummaryResponse[];
    }
  | {
      status: "error";
      versions: ContentVersionSummaryResponse[];
      message: string;
    }
  | {
      status: "ready";
      versions: ContentVersionSummaryResponse[];
    };

export type ContentDocumentVersionDiffState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      leftVersion: number;
      rightVersion: number;
    }
  | {
      status: "error";
      leftVersion: number;
      rightVersion: number;
      message: string;
    }
  | {
      status: "ready";
      diff: DocumentVersionDiff;
    };

export type ContentDocumentVersionComparison = {
  leftVersion?: number;
  rightVersion?: number;
};

export type ContentDocumentVariantCreationState = {
  targetLocale: string;
  sourceDocumentId: string;
  sourceLocale: string;
  status: "idle" | "creating";
  error?: string;
};

export type ContentDocumentPageReadyState = {
  status: "ready";
  typeId: string;
  typeLabel: string;
  documentId: string;
  locale: string;
  route: StudioDocumentRouteMountContext;
  schemaState?: StudioSchemaState;
  document: StudioDocumentShellData;
  draftBody: string;
  saveState: "saved" | "saving" | "unsaved";
  mutationError?: string;
  saveRequestBody?: string;
  canWrite: boolean;
  writeMessage?: string;
  publishDialogOpen: boolean;
  publishChangeSummary: string;
  publishState: "idle" | "publishing";
  publishError?: string;
  versionHistory: ContentDocumentVersionHistoryState;
  selectedComparison: ContentDocumentVersionComparison;
  versionDiff: ContentDocumentVersionDiffState;
  translationVariants: TranslationVariantSummary[];
  localized: boolean;
  variantsFetchFailed: boolean;
  variantCreation?: ContentDocumentVariantCreationState;
};

export type ContentDocumentPageState =
  | {
      status: "loading";
      typeId: string;
      typeLabel: string;
      documentId: string;
      locale: string;
      route?: StudioDocumentRouteMountContext;
    }
  | {
      status: "forbidden" | "not-found" | "error";
      typeId: string;
      typeLabel: string;
      documentId: string;
      locale: string;
      route?: StudioDocumentRouteMountContext;
      message: string;
    }
  | ContentDocumentPageReadyState;

type ContentDocumentPageStateInput = {
  shell: StudioDocumentShell;
  typeLabel: string;
  typeId?: string;
  documentRoute: StudioDocumentRouteMountContext;
  schemaState?: StudioSchemaState;
};

type ContentDocumentPageReadyEvent =
  | {
      type: "draftChanged";
      body: string;
    }
  | {
      type: "saveStarted";
    }
  | {
      type: "saveSucceeded";
      updatedAt: string;
      body?: string;
    }
  | {
      type: "saveFailed";
      message: string;
    };

type ContentDocumentPageViewProps = {
  state: ContentDocumentPageState;
  context?: StudioMountContext;
  sidebarOpen?: boolean;
  activeMdxComponent?: MdxPropsPanelSelection | null;
  onDraftChange?: (body: string) => void;
  onActiveMdxComponentChange?: (
    selection: MdxPropsPanelSelection | null,
  ) => void;
  onToggleSidebar?: () => void;
  onGoBack?: () => void;
  onPublishDialogOpenChange?: (open: boolean) => void;
  onPublishChangeSummaryChange?: (value: string) => void;
  onPublishSubmit?: () => void;
  onSchemaSync?: () => void;
  onSelectComparisonVersion?: (
    side: "left" | "right",
    version?: number,
  ) => void;
  onLocaleSwitch?: (locale: string) => void;
  onCreateVariant?: (prefill: boolean) => void;
  onCancelVariantCreation?: () => void;
};

type CreateContentDocumentPageHistoryApi = (input: {
  context: StudioMountContext;
  route: StudioDocumentRouteMountContext;
}) => Pick<StudioDocumentRouteApi, "listVersions">;

function createLoadingState(input: {
  typeId: string;
  typeLabel: string;
  documentId: string;
  locale?: string;
  route?: StudioDocumentRouteMountContext;
}): ContentDocumentPageState {
  return {
    status: "loading",
    typeId: input.typeId,
    typeLabel: input.typeLabel,
    documentId: input.documentId,
    locale: input.locale ?? "en",
    ...(input.route ? { route: input.route } : {}),
  };
}

function resolveContentDocumentWriteAccess(input: {
  route: StudioDocumentRouteMountContext;
  schemaState?: StudioSchemaState;
}): {
  canWrite: boolean;
  writeMessage?: string;
} {
  const routeWriteAccess = resolveRouteWriteAccess(input.route);
  const schemaState = input.schemaState;

  if (!schemaState) {
    return routeWriteAccess;
  }

  if (schemaState.status !== "ready") {
    return {
      canWrite: false,
      writeMessage: schemaState.message,
    };
  }

  if (hasSchemaRecoveryMismatch(schemaState)) {
    return {
      canWrite: false,
      writeMessage: SCHEMA_MISMATCH_WRITE_MESSAGE,
    };
  }

  return routeWriteAccess;
}

function resolveRouteWriteAccess(route: StudioDocumentRouteMountContext): {
  canWrite: boolean;
  writeMessage?: string;
} {
  return route.write.canWrite
    ? {
        canWrite: true,
      }
    : {
        canWrite: false,
        writeMessage: route.write.message,
      };
}

function createErrorState(input: {
  status: "forbidden" | "not-found" | "error";
  typeId: string;
  typeLabel: string;
  documentId: string;
  locale?: string;
  route?: StudioDocumentRouteMountContext;
  message: string;
}): ContentDocumentPageState {
  return {
    status: input.status,
    typeId: input.typeId,
    typeLabel: input.typeLabel,
    documentId: input.documentId,
    locale: input.locale ?? "en",
    ...(input.route ? { route: input.route } : {}),
    message: input.message,
  };
}

function createReadyState(input: {
  shell: StudioDocumentShell;
  typeId: string;
  typeLabel: string;
  documentRoute: StudioDocumentRouteMountContext;
  schemaState?: StudioSchemaState;
}): ContentDocumentPageReadyState {
  const document = input.shell.data as StudioDocumentShellData;
  const writeAccess = resolveContentDocumentWriteAccess({
    route: input.documentRoute,
    schemaState: input.schemaState,
  });

  return {
    status: "ready",
    typeId: input.typeId,
    typeLabel: input.typeLabel,
    documentId: input.shell.documentId,
    locale: document.locale ?? input.shell.locale,
    route: input.documentRoute,
    ...(input.schemaState ? { schemaState: input.schemaState } : {}),
    document,
    draftBody: document.body ?? "",
    saveState: "saved",
    canWrite: writeAccess.canWrite,
    publishDialogOpen: false,
    publishChangeSummary: "",
    publishState: "idle",
    versionHistory: {
      status: "idle",
      versions: [],
    },
    selectedComparison: {},
    versionDiff: {
      status: "idle",
    },
    translationVariants: [],
    localized: false,
    variantsFetchFailed: false,
    ...(writeAccess.writeMessage
      ? { writeMessage: writeAccess.writeMessage }
      : {}),
  };
}

function createVersionHistoryState(
  versions: ContentVersionSummaryResponse[],
): ContentDocumentVersionHistoryState {
  return versions.length === 0
    ? {
        status: "empty",
        versions: [],
      }
    : {
        status: "ready",
        versions,
      };
}

function createDefaultVersionComparison(
  versions: ContentVersionSummaryResponse[],
): ContentDocumentVersionComparison {
  if (versions.length < 2) {
    return {};
  }

  return {
    leftVersion: versions[1]?.version,
    rightVersion: versions[0]?.version,
  };
}

function isReadySchemaState(
  schemaState?: StudioSchemaState,
): schemaState is ContentDocumentSchemaReadyState {
  return schemaState?.status === "ready";
}

function hasSchemaRecoveryMismatch(
  schemaState?: StudioSchemaState,
): schemaState is ContentDocumentSchemaReadyState {
  return (
    isReadySchemaState(schemaState) &&
    (schemaState.isMismatch ||
      (schemaState.localSchemaHash !== undefined &&
        schemaState.serverSchemaHash === undefined))
  );
}

function isSchemaGuardRuntimeError(error: unknown): error is RuntimeError {
  return (
    error instanceof RuntimeError && SCHEMA_WRITE_GUARD_CODES.has(error.code)
  );
}

function formatSchemaRecoveryHash(hash?: string): string {
  return hash?.trim().length ? hash : "Not synced";
}

type SchemaGuardLogger = (message: string, error: unknown) => void;

function defaultSchemaGuardLogger(message: string, error: unknown): void {
  console.error(message, error);
}

export async function reloadSchemaStateForGuard(
  state: ContentDocumentPageReadyState,
  logError: SchemaGuardLogger = defaultSchemaGuardLogger,
): Promise<StudioSchemaState | undefined> {
  if (!isReadySchemaState(state.schemaState)) {
    return undefined;
  }

  try {
    return await state.schemaState.reload();
  } catch (error) {
    logError("reloadSchemaStateForGuard failed", error);
    return undefined;
  }
}

export async function syncSchemaStateForGuard(
  schemaState: ContentDocumentSchemaReadyState,
  logError: SchemaGuardLogger = defaultSchemaGuardLogger,
): Promise<StudioSchemaState | undefined> {
  try {
    return await schemaState.sync();
  } catch (error) {
    logError("syncSchemaStateForGuard failed", error);
    return undefined;
  }
}

function createGuardedSchemaRecoveryState(input: {
  state: ContentDocumentPageReadyState;
  error: RuntimeError;
  reloadedSchemaState?: StudioSchemaState;
}): ContentDocumentSchemaReadyState | undefined {
  const baseState = isReadySchemaState(input.reloadedSchemaState)
    ? input.reloadedSchemaState
    : isReadySchemaState(input.state.schemaState)
      ? input.state.schemaState
      : undefined;

  if (!baseState) {
    return undefined;
  }

  return {
    ...baseState,
    isMismatch: true,
    serverSchemaHash:
      input.error.code === "SCHEMA_NOT_SYNCED"
        ? undefined
        : baseState.serverSchemaHash,
    entries: input.error.code === "SCHEMA_NOT_SYNCED" ? [] : baseState.entries,
    syncError: undefined,
  };
}

function applyGuardedDraftSaveFailureToReadyState(input: {
  state: ContentDocumentPageReadyState;
  schemaState: ContentDocumentSchemaReadyState;
}): ContentDocumentPageReadyState {
  const nextState = applySchemaStateToReadyState(input);

  return {
    ...nextState,
    saveState:
      input.state.draftBody === input.state.document.body ? "saved" : "unsaved",
    mutationError: undefined,
    saveRequestBody: undefined,
  };
}

function applyGuardedPublishFailureToReadyState(input: {
  state: ContentDocumentPageReadyState;
  schemaState: ContentDocumentSchemaReadyState;
}): ContentDocumentPageReadyState {
  return {
    ...applySchemaStateToReadyState(input),
    publishDialogOpen: false,
    publishState: "idle",
    publishError: undefined,
  };
}

export function applySchemaStateToReadyState(input: {
  state: ContentDocumentPageReadyState;
  schemaState: StudioSchemaState;
}): ContentDocumentPageReadyState {
  const writeAccess = resolveContentDocumentWriteAccess({
    route: input.state.route,
    schemaState: input.schemaState,
  });

  return {
    ...input.state,
    schemaState: input.schemaState,
    canWrite: writeAccess.canWrite,
    writeMessage: writeAccess.writeMessage,
  };
}

function createVersionHistoryErrorState(
  message: string,
): ContentDocumentVersionHistoryState {
  return {
    status: "error",
    versions: [],
    message,
  };
}

function resetVersionDiffState(): ContentDocumentVersionDiffState {
  return {
    status: "idle",
  };
}

function normalizeOptionalChangeSummary(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function parseSelectedComparisonVersionValue(
  value: string,
): number | undefined {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  const nextVersion = Number(normalized);
  return Number.isInteger(nextVersion) && nextVersion > 0
    ? nextVersion
    : undefined;
}

function toRouteErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof RuntimeError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function applyDocumentResponseToReadyState(
  state: ContentDocumentPageReadyState,
  document: ContentDocumentResponse,
): ContentDocumentPageReadyState {
  return {
    ...state,
    locale: document.locale,
    document,
    draftBody: document.body ?? "",
    saveState: "saved",
    mutationError: undefined,
    saveRequestBody: undefined,
  };
}

export function createContentDocumentRouteApi(input: {
  context: StudioMountContext;
  route: StudioDocumentRouteMountContext;
}): StudioDocumentRouteApi {
  return createStudioDocumentRouteApi(
    {
      project: input.route.project,
      environment: input.route.initialEnvironment,
      serverUrl: input.context.apiBaseUrl,
    },
    {
      auth: input.context.auth,
    },
  );
}

export async function publishContentDocumentReadyState(input: {
  api: Pick<StudioDocumentRouteApi, "publish" | "listVersions">;
  state: ContentDocumentPageReadyState;
  changeSummary?: string;
}): Promise<ContentDocumentPageReadyState> {
  if (!input.state.canWrite) {
    return input.state;
  }

  const changeSummary = normalizeOptionalChangeSummary(input.changeSummary);
  let document: ContentDocumentResponse;

  try {
    document = await input.api.publish({
      documentId: input.state.documentId,
      locale: input.state.document.locale,
      changeSummary,
    });
  } catch (error) {
    if (isSchemaGuardRuntimeError(error)) {
      const schemaState = createGuardedSchemaRecoveryState({
        state: input.state,
        error,
        reloadedSchemaState: await reloadSchemaStateForGuard(input.state),
      });

      if (schemaState) {
        return applyGuardedPublishFailureToReadyState({
          state: input.state,
          schemaState,
        });
      }
    }

    throw error;
  }

  const nextState = {
    ...applyDocumentResponseToReadyState(input.state, document),
    publishDialogOpen: false,
    publishChangeSummary: "",
    publishState: "idle" as const,
    publishError: undefined,
  };

  try {
    const versionHistoryResponse = await input.api.listVersions({
      documentId: input.state.documentId,
      locale: input.state.document.locale,
    });

    return {
      ...nextState,
      versionHistory: createVersionHistoryState(versionHistoryResponse.data),
      selectedComparison: createDefaultVersionComparison(
        versionHistoryResponse.data,
      ),
      versionDiff: resetVersionDiffState(),
    };
  } catch (error) {
    return {
      ...nextState,
      versionHistory: createVersionHistoryErrorState(
        toRouteErrorMessage(error, "Failed to refresh version history."),
      ),
      selectedComparison: {},
      versionDiff: resetVersionDiffState(),
    };
  }
}

export function applySuccessfulPublishToReadyState(input: {
  state: ContentDocumentPageReadyState;
  requestBody: string;
  publishedState: ContentDocumentPageReadyState;
}): ContentDocumentPageReadyState {
  if (input.state.draftBody === input.requestBody) {
    return input.publishedState;
  }

  return {
    ...input.publishedState,
    draftBody: input.state.draftBody,
    saveState:
      input.state.draftBody === input.publishedState.document.body
        ? "saved"
        : "unsaved",
    mutationError: input.state.mutationError,
    saveRequestBody: input.state.saveRequestBody,
  };
}

export async function loadContentDocumentVersionDiff(input: {
  api: Pick<StudioDocumentRouteApi, "getVersion">;
  documentId: string;
  locale: string;
  leftVersion: number;
  rightVersion: number;
}): Promise<DocumentVersionDiff> {
  const [leftVersion, rightVersion] = await Promise.all([
    input.api.getVersion({
      documentId: input.documentId,
      locale: input.locale,
      version: input.leftVersion,
    }),
    input.api.getVersion({
      documentId: input.documentId,
      locale: input.locale,
      version: input.rightVersion,
    }),
  ]);

  return diffDocumentVersions(leftVersion, rightVersion);
}

export async function loadContentDocumentPageState(input: {
  context?: StudioMountContext;
  typeId: string;
  typeLabel: string;
  documentId: string;
  loadDocumentShell?: typeof loadStudioDocumentShell;
  loadSchemaState?: typeof loadStudioSchemaState;
  createRouteApi?: CreateContentDocumentPageHistoryApi;
}): Promise<ContentDocumentPageState> {
  const route = input.context?.documentRoute;

  if (!input.context || !route) {
    return createErrorState({
      status: "error",
      typeId: input.typeId,
      typeLabel: input.typeLabel,
      documentId: input.documentId,
      message: "Studio document route context is unavailable.",
    });
  }

  const loadDocumentShell = input.loadDocumentShell ?? loadStudioDocumentShell;
  const loadSchemaState = input.loadSchemaState ?? loadStudioSchemaState;
  const routeApiFactory = input.createRouteApi ?? createContentDocumentRouteApi;
  const shell = await loadDocumentShell(
    {
      project: route.project,
      environment: route.initialEnvironment,
      serverUrl: input.context.apiBaseUrl,
    },
    {
      type: input.typeId,
      documentId: input.documentId,
    },
    {
      auth: input.context.auth,
    },
  );

  const nextState = createContentDocumentPageState({
    shell,
    typeId: input.typeId,
    typeLabel: input.typeLabel,
    documentRoute: route,
  });

  if (nextState.status !== "ready") {
    return nextState;
  }

  const schemaState = await loadSchemaState({
    config: {
      project: route.project,
      environment: route.initialEnvironment,
      serverUrl: input.context.apiBaseUrl,
    },
    auth: input.context.auth,
  });
  const readyState = applySchemaStateToReadyState({
    state: nextState,
    schemaState,
  });

  let translationVariants: TranslationVariantSummary[] = [];
  let localized = false;
  let variantsFetchFailed = false;

  if (schemaState.status === "ready") {
    const typeEntry = schemaState.entries.find((e) => e.type === input.typeId);
    localized = typeEntry?.localized ?? false;
  }

  if (
    localized &&
    route.supportedLocales &&
    route.supportedLocales.length > 0
  ) {
    try {
      const routeApi = createContentDocumentRouteApi({
        context: input.context,
        route,
      });
      const variantsResponse = await routeApi.listVariants({
        documentId: input.documentId,
      });
      translationVariants = variantsResponse.data;
    } catch {
      // Degrade gracefully — include the current document so its locale
      // is never shown as missing, and flag the failure so the UI
      // suppresses creation affordances for unverified locales.
      translationVariants = [
        {
          documentId: readyState.documentId,
          locale: readyState.locale,
          path: readyState.document.path,
          publishedVersion: readyState.document.publishedVersion,
          hasUnpublishedChanges: readyState.document.hasUnpublishedChanges,
        },
      ];
      variantsFetchFailed = true;
    }
  }

  const versionState = await loadContentDocumentVersionHistoryState({
    api: routeApiFactory({
      context: input.context,
      route,
    }),
    state: readyState,
  });

  return {
    ...readyState,
    translationVariants,
    localized,
    variantsFetchFailed,
    ...versionState,
  };
}

export async function saveContentDocumentReadyState(input: {
  api: Pick<StudioDocumentRouteApi, "updateDraft">;
  route: StudioDocumentRouteMountContext;
  state: ContentDocumentPageReadyState;
}): Promise<ContentDocumentPageReadyState> {
  if (
    !input.route.write.canWrite ||
    !input.state.canWrite ||
    input.state.saveState !== "unsaved" ||
    input.state.draftBody === input.state.document.body ||
    input.state.saveRequestBody === input.state.draftBody
  ) {
    return input.state;
  }

  const savingState = reduceContentDocumentPageReadyState(input.state, {
    type: "saveStarted",
  });

  try {
    const result = await input.api.updateDraft({
      documentId: input.state.documentId,
      locale: input.state.document.locale,
      payload: {
        body: input.state.draftBody,
      },
      schemaHash: input.route.write.schemaHash,
    });

    return reduceContentDocumentPageReadyState(savingState, {
      type: "saveSucceeded",
      body: result.body ?? input.state.draftBody,
      updatedAt: result.updatedAt ?? input.state.document.updatedAt,
    });
  } catch (error) {
    if (isSchemaGuardRuntimeError(error)) {
      const schemaState = createGuardedSchemaRecoveryState({
        state: savingState,
        error,
        reloadedSchemaState: await reloadSchemaStateForGuard(savingState),
      });

      if (schemaState) {
        return applyGuardedDraftSaveFailureToReadyState({
          state: savingState,
          schemaState,
        });
      }
    }

    return reduceContentDocumentPageReadyState(savingState, {
      type: "saveFailed",
      message: toRouteErrorMessage(error, "Failed to save draft."),
    });
  }
}

async function loadContentDocumentVersionHistoryState(input: {
  api: Pick<StudioDocumentRouteApi, "listVersions">;
  state: ContentDocumentPageReadyState;
}): Promise<{
  versionHistory: ContentDocumentVersionHistoryState;
  selectedComparison: ContentDocumentVersionComparison;
  versionDiff: ContentDocumentVersionDiffState;
}> {
  try {
    const response = await input.api.listVersions({
      documentId: input.state.documentId,
      locale: input.state.document.locale,
    });

    return {
      versionHistory: createVersionHistoryState(response.data),
      selectedComparison: createDefaultVersionComparison(response.data),
      versionDiff: resetVersionDiffState(),
    };
  } catch (error) {
    return {
      versionHistory: createVersionHistoryErrorState(
        toRouteErrorMessage(error, "Failed to load version history."),
      ),
      selectedComparison: {},
      versionDiff: resetVersionDiffState(),
    };
  }
}

function getForbiddenMessage(): string {
  return "You do not have access to this document draft.";
}

function getNotFoundMessage(): string {
  return "Document not found.";
}

export function createContentDocumentPageState(
  input: ContentDocumentPageStateInput,
): ContentDocumentPageState {
  const typeId = input.typeId ?? input.typeLabel;

  if (input.shell.state === "loading") {
    return createLoadingState({
      typeId,
      typeLabel: input.typeLabel,
      documentId: input.shell.documentId,
      locale: input.shell.locale,
      route: input.documentRoute,
    });
  }

  if (input.shell.state === "error") {
    if (
      input.shell.errorCode === "FORBIDDEN" ||
      input.shell.errorCode === "UNAUTHORIZED"
    ) {
      return createErrorState({
        status: "forbidden",
        typeId,
        typeLabel: input.typeLabel,
        documentId: input.shell.documentId,
        locale: input.shell.locale,
        route: input.documentRoute,
        message: getForbiddenMessage(),
      });
    }

    if (input.shell.errorCode === "NOT_FOUND") {
      return createErrorState({
        status: "not-found",
        typeId,
        typeLabel: input.typeLabel,
        documentId: input.shell.documentId,
        locale: input.shell.locale,
        route: input.documentRoute,
        message: getNotFoundMessage(),
      });
    }

    return createErrorState({
      status: "error",
      typeId,
      typeLabel: input.typeLabel,
      documentId: input.shell.documentId,
      locale: input.shell.locale,
      route: input.documentRoute,
      message: input.shell.errorMessage || "Failed to load document draft.",
    });
  }

  return createReadyState({
    shell: input.shell,
    typeId,
    typeLabel: input.typeLabel,
    documentRoute: input.documentRoute,
    schemaState: input.schemaState,
  });
}

export function reduceContentDocumentPageReadyState(
  state: ContentDocumentPageReadyState,
  event: ContentDocumentPageReadyEvent,
): ContentDocumentPageReadyState {
  switch (event.type) {
    case "draftChanged": {
      const isPersisted = event.body === state.document.body;

      return {
        ...state,
        draftBody: event.body,
        saveState: isPersisted ? "saved" : "unsaved",
        mutationError: undefined,
        saveRequestBody: undefined,
      };
    }
    case "saveStarted": {
      if (!state.canWrite || state.draftBody === state.document.body) {
        return state;
      }

      return {
        ...state,
        saveState: "saving",
        mutationError: undefined,
        saveRequestBody: state.draftBody,
      };
    }
    case "saveSucceeded": {
      const requestBody = state.saveRequestBody ?? state.draftBody;
      const savedBody = event.body ?? requestBody;
      const draftBody =
        state.draftBody === requestBody ? savedBody : state.draftBody;

      return {
        ...state,
        document: {
          ...state.document,
          body: savedBody,
          hasUnpublishedChanges: true,
          updatedAt: event.updatedAt,
        },
        draftBody,
        saveState: draftBody === savedBody ? "saved" : "unsaved",
        mutationError: undefined,
        saveRequestBody: undefined,
      };
    }
    case "saveFailed": {
      return {
        ...state,
        saveState:
          state.draftBody === state.document.body ? "saved" : "unsaved",
        mutationError: event.message,
        saveRequestBody: undefined,
      };
    }
  }
}

export function applySuccessfulDraftSaveToReadyState(input: {
  state: ContentDocumentPageReadyState;
  requestBody: string;
  persistedBody?: string;
  updatedAt: string;
}): ContentDocumentPageReadyState {
  const hasNewerSaveInFlight =
    input.state.saveRequestBody !== undefined &&
    input.state.saveRequestBody !== input.requestBody;
  const persistedBody = input.persistedBody ?? input.requestBody;
  const draftBody =
    input.state.draftBody === input.requestBody
      ? persistedBody
      : input.state.draftBody;

  return {
    ...input.state,
    document: {
      ...input.state.document,
      body: persistedBody,
      hasUnpublishedChanges: true,
      updatedAt: input.updatedAt,
    },
    draftBody,
    mutationError: undefined,
    saveRequestBody: hasNewerSaveInFlight
      ? input.state.saveRequestBody
      : undefined,
    saveState: hasNewerSaveInFlight
      ? input.state.saveState
      : draftBody === persistedBody
        ? "saved"
        : "unsaved",
  };
}

export function applyFailedDraftSaveToReadyState(input: {
  state: ContentDocumentPageReadyState;
  requestBody: string;
  message: string;
}): ContentDocumentPageReadyState {
  if (
    input.state.saveRequestBody !== undefined &&
    input.state.saveRequestBody !== input.requestBody
  ) {
    return input.state;
  }

  return {
    ...input.state,
    saveState:
      input.state.draftBody === input.state.document.body ? "saved" : "unsaved",
    mutationError: input.message,
    saveRequestBody: undefined,
  };
}

function formatDocumentLabel(path: string, documentId: string): string {
  const trimmedPath = path.trim();

  if (trimmedPath.length === 0) {
    return documentId;
  }

  const segments = trimmedPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? trimmedPath;
}

function getDocumentWorkflowBadgeLabel(
  state: ContentDocumentPageState,
): string | undefined {
  if (state.status !== "ready") {
    return undefined;
  }

  if (state.document.publishedVersion === null) {
    return "Draft";
  }

  return state.document.hasUnpublishedChanges ? "Changed" : "Published";
}

function renderStatusContent(state: ContentDocumentPageState): string {
  switch (state.status) {
    case "loading":
      return "Loading document draft...";
    case "forbidden":
    case "not-found":
    case "error":
      return state.message;
    case "ready":
      switch (state.saveState) {
        case "saved":
          return "Saved";
        case "saving":
          return "Saving...";
        case "unsaved":
          return "Unsaved changes";
      }
  }
}

function ContentDocumentPageStatusView(props: {
  state: ContentDocumentPageState;
  onGoBack?: () => void;
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="mb-3 text-sm text-foreground-muted">
          {renderStatusContent(props.state)}
        </p>
        {props.state.status !== "loading" ? (
          <Button variant="outline" onClick={() => props.onGoBack?.()}>
            Go back
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function renderVersionHistoryContent(props: {
  state: ContentDocumentPageReadyState;
  onSelectComparisonVersion?: (
    side: "left" | "right",
    version?: number,
  ) => void;
}) {
  switch (props.state.versionHistory.status) {
    case "idle":
      return (
        <p className="text-sm text-foreground-muted">
          Version history will load once the draft is ready.
        </p>
      );
    case "loading":
      return (
        <p className="text-sm text-foreground-muted">
          Loading version history...
        </p>
      );
    case "empty":
      return (
        <p className="text-sm text-foreground-muted">
          No published versions yet.
        </p>
      );
    case "error":
      return (
        <p className="text-sm text-destructive">
          {props.state.versionHistory.message}
        </p>
      );
    case "ready":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium text-foreground-muted">
              <span>Compare from</span>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                value={String(props.state.selectedComparison.leftVersion ?? "")}
                onChange={(event) => {
                  props.onSelectComparisonVersion?.(
                    "left",
                    parseSelectedComparisonVersionValue(
                      event.currentTarget.value,
                    ),
                  );
                }}
              >
                <option value="">Select version</option>
                {props.state.versionHistory.versions.map((version) => (
                  <option
                    key={`left-${version.version}`}
                    value={version.version}
                  >
                    Version {version.version}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground-muted">
              <span>Compare to</span>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                value={String(
                  props.state.selectedComparison.rightVersion ?? "",
                )}
                onChange={(event) => {
                  props.onSelectComparisonVersion?.(
                    "right",
                    parseSelectedComparisonVersionValue(
                      event.currentTarget.value,
                    ),
                  );
                }}
              >
                <option value="">Select version</option>
                {props.state.versionHistory.versions.map((version) => (
                  <option
                    key={`right-${version.version}`}
                    value={version.version}
                  >
                    Version {version.version}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {props.state.versionHistory.versions.map((version) => (
            <article
              key={version.version}
              data-mdcms-version={version.version}
              className="space-y-2 rounded-md border border-border bg-background-subtle p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Version {version.version}</p>
              </div>
              <p className="text-xs text-foreground-muted">
                {version.publishedBy}
              </p>
              <p className="text-xs text-foreground-muted">
                {version.publishedAt}
              </p>
              <p className="text-sm text-foreground-muted">
                {version.changeSummary ?? "No change summary."}
              </p>
            </article>
          ))}
        </div>
      );
  }
}

function renderVersionDiffContent(state: ContentDocumentPageReadyState) {
  switch (state.versionDiff.status) {
    case "idle":
      return (
        <p className="text-sm text-foreground-muted">
          Select two versions to compare.
        </p>
      );
    case "loading":
      return (
        <p className="text-sm text-foreground-muted">Loading comparison...</p>
      );
    case "error":
      return (
        <p className="text-sm text-destructive">{state.versionDiff.message}</p>
      );
    case "ready": {
      const { diff } = state.versionDiff;

      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">
              Comparing v{diff.leftVersion} to v{diff.rightVersion}
            </p>
            {state.selectedComparison.leftVersion &&
            state.selectedComparison.rightVersion ? (
              <p className="text-xs text-foreground-muted">
                Selected versions: v{state.selectedComparison.leftVersion} and v
                {state.selectedComparison.rightVersion}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Path
            </p>
            <p className="text-sm text-foreground-muted">{diff.path.before}</p>
            <p className="text-sm">{diff.path.after}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Frontmatter
            </p>
            {diff.frontmatter.changes.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                No frontmatter changes.
              </p>
            ) : (
              diff.frontmatter.changes.map((change) => (
                <div
                  key={change.path}
                  className="rounded-md border border-border p-2"
                >
                  <p className="text-xs text-foreground-muted">{change.path}</p>
                  <p className="text-sm">{String(change.after ?? "")}</p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Body
            </p>
            {diff.body.lines.length === 0 ? (
              <p className="text-sm text-foreground-muted">No body changes.</p>
            ) : (
              <div className="space-y-1 rounded-md border border-border p-2">
                {diff.body.lines.map((line, index) => (
                  <div
                    key={`${line.leftLineNumber}:${line.rightLineNumber}:${index}`}
                    className="grid grid-cols-[56px_56px_1fr] gap-2 text-xs"
                  >
                    <span className="text-foreground-muted">
                      {line.leftLineNumber ?? ""}
                    </span>
                    <span className="text-foreground-muted">
                      {line.rightLineNumber ?? ""}
                    </span>
                    <span>{line.rightText ?? line.leftText ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
  }
}

function renderSchemaRecoveryBanner(input: {
  state: ContentDocumentPageReadyState;
  onSchemaSync?: () => void;
}) {
  const schemaState = input.state.schemaState;

  if (!hasSchemaRecoveryMismatch(schemaState)) {
    return null;
  }

  const localSchemaHash = formatSchemaRecoveryHash(schemaState.localSchemaHash);
  const serverSchemaHash = formatSchemaRecoveryHash(
    schemaState.serverSchemaHash,
  );

  return (
    <section
      data-mdcms-schema-recovery-state="mismatch"
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-foreground"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">Schema changes detected</p>
          <p className="text-foreground-muted">
            {SCHEMA_MISMATCH_WRITE_MESSAGE}
          </p>
          <div className="grid gap-2 text-xs text-foreground-muted sm:grid-cols-2">
            <p data-mdcms-schema-recovery-hash="local">
              <span className="font-medium text-foreground">
                Local schema hash
              </span>{" "}
              <code>{localSchemaHash}</code>
            </p>
            <p data-mdcms-schema-recovery-hash="server">
              <span className="font-medium text-foreground">
                Server schema hash
              </span>{" "}
              <code>{serverSchemaHash}</code>
            </p>
          </div>
          {schemaState.syncError ? (
            <p
              data-mdcms-schema-sync-state="error"
              className="text-destructive"
            >
              {schemaState.syncError}
            </p>
          ) : null}
        </div>

        {schemaState.canSync ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => input.onSchemaSync?.()}
          >
            Sync Schema
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ContentDocumentPageSidebar(props: {
  context?: StudioMountContext;
  state: ContentDocumentPageReadyState;
  activeMdxComponent?: MdxPropsPanelSelection | null;
  onSelectComparisonVersion?: (
    side: "left" | "right",
    version?: number,
  ) => void;
}) {
  return (
    <aside
      data-mdcms-editor-pane="sidebar"
      className="w-80 shrink-0 border-l border-border bg-background"
    >
      <div className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Document workflow</p>
          <p className="text-sm text-foreground-muted">
            This page loads the routed draft, saves draft edits, and publishes
            the current draft through the live content API.
          </p>
          <p className="text-sm text-foreground-muted">
            If Studio cannot derive the local schema hash required for writes,
            the editor stays read-only until schema recovery completes.
          </p>
        </div>

        <div
          data-mdcms-version-history-state={props.state.versionHistory.status}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-foreground-muted" />
            <p className="text-sm font-medium">Version history</p>
          </div>
          {renderVersionHistoryContent(props)}
        </div>

        <div
          data-mdcms-version-diff-state={props.state.versionDiff.status}
          className="space-y-3"
        >
          <p className="text-sm font-medium">Version diff</p>
          {renderVersionDiffContent(props.state)}
        </div>

        {props.context?.mdx ? (
          <MdxPropsPanel
            context={props.context}
            selection={props.activeMdxComponent ?? null}
          />
        ) : null}
      </div>
    </aside>
  );
}

export function ContentDocumentPageView({
  state,
  context,
  sidebarOpen = true,
  activeMdxComponent = null,
  onDraftChange,
  onActiveMdxComponentChange,
  onToggleSidebar,
  onGoBack,
  onPublishDialogOpenChange,
  onPublishChangeSummaryChange,
  onPublishSubmit,
  onSchemaSync,
  onSelectComparisonVersion,
  onLocaleSwitch,
  onCreateVariant,
  onCancelVariantCreation,
}: ContentDocumentPageViewProps) {
  const documentLabel =
    state.status === "ready"
      ? formatDocumentLabel(state.document.path, state.documentId)
      : state.documentId;
  const writeState =
    state.status === "ready"
      ? state.canWrite
        ? "enabled"
        : "blocked"
      : "idle";
  const canPublish =
    state.status === "ready" &&
    state.canWrite &&
    state.saveState === "saved" &&
    state.document.hasUnpublishedChanges &&
    state.publishState !== "publishing";
  const workflowBadgeLabel = getDocumentWorkflowBadgeLabel(state);

  return (
    <TooltipProvider>
      <div
        data-mdcms-editor-layout="document"
        data-mdcms-document-state={state.status}
        data-mdcms-document-write-state={writeState}
        className="flex h-screen min-w-0 flex-col overflow-x-hidden"
      >
        <header className="sticky top-0 z-30 flex min-w-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <BreadcrumbTrail
              className="flex-1"
              breadcrumbs={[
                { label: "Content", href: "/admin/content" },
                {
                  label: state.typeLabel,
                  href: `/admin/content/${state.typeId}`,
                },
                { label: documentLabel },
              ]}
            />

            <div className="flex shrink-0 items-center gap-1.5 text-sm">
              {state.status === "ready" && state.saveState === "saved" ? (
                <>
                  <Check className="h-4 w-4 text-success" />
                  <span className="text-foreground-muted">Saved</span>
                </>
              ) : null}
              {state.status === "ready" && state.saveState === "saving" ? (
                <span className="animate-pulse text-foreground-muted">
                  Saving...
                </span>
              ) : null}
              {state.status === "ready" && state.saveState === "unsaved" ? (
                <>
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <span className="text-warning">Unsaved changes</span>
                </>
              ) : null}
              {state.status === "loading" ? (
                <span className="text-foreground-muted">
                  Loading document draft...
                </span>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {state.status === "ready" &&
            state.localized &&
            state.route.supportedLocales &&
            state.route.supportedLocales.length > 0 ? (
              <Select
                value={state.variantCreation?.targetLocale ?? state.locale}
                onValueChange={(value) => onLocaleSwitch?.(value)}
              >
                <SelectTrigger className="h-8 w-auto min-w-[100px] gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.route.supportedLocales.map((loc) => {
                    const hasVariant = state.translationVariants.some(
                      (v) => v.locale === loc,
                    );
                    // Hide missing locales when: user is read-only, or
                    // variants fetch failed (we can't confirm what exists)
                    if (
                      !hasVariant &&
                      (!state.canWrite || state.variantsFetchFailed)
                    )
                      return null;
                    return (
                      <SelectItem key={loc} value={loc}>
                        {hasVariant ? loc : `+ ${loc}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : null}

            {workflowBadgeLabel ? (
              <Badge variant="outline" className="text-xs">
                {workflowBadgeLabel}
              </Badge>
            ) : null}

            {state.status === "ready" &&
            state.document.publishedVersion !== null ? (
              <Badge variant="outline" className="text-xs">
                v{state.document.publishedVersion}
              </Badge>
            ) : null}

            {state.status === "ready" && !state.canWrite ? (
              <Badge variant="outline" className="text-xs">
                Read-only
              </Badge>
            ) : null}

            {state.status === "ready" ? (
              <Button
                className="bg-accent text-white hover:bg-accent-hover"
                disabled={!canPublish}
                onClick={() => onPublishDialogOpenChange?.(true)}
              >
                <Send className="mr-2 h-4 w-4" />
                Publish
              </Button>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
                  {sidebarOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRight className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            data-mdcms-editor-pane="canvas"
            className="min-w-0 flex-1 overflow-y-auto p-6"
          >
            <div className="mx-auto max-w-4xl">
              {state.status !== "ready" ? (
                <ContentDocumentPageStatusView
                  state={state}
                  onGoBack={onGoBack}
                />
              ) : state.variantCreation ? (
                <div className="flex min-h-[320px] items-center justify-center p-6">
                  <div className="max-w-md text-center">
                    <Globe className="mx-auto mb-4 h-10 w-10 text-foreground-muted" />
                    <p className="mb-1 text-base font-medium">
                      No {state.variantCreation.targetLocale} variant exists yet
                    </p>
                    <p className="mb-5 text-sm text-foreground-muted">
                      Create a translation variant for this document to start
                      editing in {state.variantCreation.targetLocale}.
                    </p>
                    {state.variantCreation.error ? (
                      <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {state.variantCreation.error}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        variant="outline"
                        disabled={state.variantCreation.status === "creating"}
                        onClick={() => onCreateVariant?.(false)}
                      >
                        Create empty
                      </Button>
                      <Button
                        className="bg-accent text-white hover:bg-accent-hover"
                        disabled={state.variantCreation.status === "creating"}
                        onClick={() => onCreateVariant?.(true)}
                      >
                        {state.variantCreation.status === "creating"
                          ? "Creating..."
                          : `Pre-fill from ${state.variantCreation.sourceLocale}`}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {hasSchemaRecoveryMismatch(state.schemaState)
                    ? renderSchemaRecoveryBanner({
                        state,
                        onSchemaSync,
                      })
                    : null}

                  {state.mutationError ? (
                    <div
                      data-mdcms-document-mutation-state="error"
                      className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                    >
                      {state.mutationError}
                    </div>
                  ) : null}

                  {!state.canWrite &&
                  state.writeMessage &&
                  !hasSchemaRecoveryMismatch(state.schemaState) ? (
                    <div className="rounded-md border border-border bg-background-subtle px-4 py-3 text-sm text-foreground-muted">
                      {state.writeMessage}
                    </div>
                  ) : null}

                  {state.publishError ? (
                    <div
                      data-mdcms-document-publish-state="error"
                      className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                    >
                      {state.publishError}
                    </div>
                  ) : null}

                  <TipTapEditor
                    content={state.draftBody}
                    context={context}
                    onChange={onDraftChange}
                    onActiveMdxComponentChange={onActiveMdxComponentChange}
                    readOnly={!state.canWrite}
                    forbidden={false}
                  />
                </div>
              )}
            </div>
          </div>

          {state.status === "ready" && sidebarOpen ? (
            <ContentDocumentPageSidebar
              context={context}
              state={state}
              activeMdxComponent={activeMdxComponent}
              onSelectComparisonVersion={onSelectComparisonVersion}
            />
          ) : null}
        </div>

        {state.status === "ready" ? (
          <Dialog
            open={state.publishDialogOpen}
            onOpenChange={onPublishDialogOpenChange}
          >
            <DialogContent
              forceMount={state.publishDialogOpen ? true : undefined}
              data-mdcms-publish-dialog="open"
            >
              <DialogHeader>
                <DialogTitle>Publish document</DialogTitle>
                <DialogDescription>
                  This creates a new immutable version from the current draft.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Change summary (optional)
                  </label>
                  <Textarea
                    value={state.publishChangeSummary}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      onPublishChangeSummaryChange?.(event.currentTarget.value)
                    }
                    placeholder="Describe what changed..."
                    rows={3}
                  />
                </div>
                <p className="text-sm text-foreground-muted">
                  Current published version:{" "}
                  {state.document.publishedVersion === null
                    ? "Not published"
                    : `v${state.document.publishedVersion}`}
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => onPublishDialogOpenChange?.(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-accent text-white hover:bg-accent-hover"
                  disabled={state.publishState === "publishing"}
                  onClick={onPublishSubmit}
                >
                  {state.publishState === "publishing"
                    ? "Publishing..."
                    : "Publish"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

export default function ContentDocumentPage({
  context,
}: {
  context?: StudioMountContext;
}) {
  const params = useParams();
  const router = useRouter();
  const typeId = (params.type as string) || "content";
  const documentId = (params.documentId as string) || "";
  const typeLabel = typeId;
  const route = context?.documentRoute;

  const [state, setState] = useState<ContentDocumentPageState>(() =>
    route
      ? createLoadingState({
          typeId,
          typeLabel,
          documentId,
          route,
        })
      : createErrorState({
          status: "error",
          typeId,
          typeLabel,
          documentId,
          message: "Studio document route context is unavailable.",
        }),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMdxComponent, setActiveMdxComponent] =
    useState<MdxPropsPanelSelection | null>(null);
  const stateRef = useRef(state);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function createRouteApi(): StudioDocumentRouteApi | undefined {
    if (!context || !route) {
      return undefined;
    }

    return createContentDocumentRouteApi({
      context,
      route,
    });
  }

  const loadSelectedVersionDiff = useEffectEvent(async () => {
    const currentState = stateRef.current;
    const api = createRouteApi();

    if (
      !api ||
      currentState.status !== "ready" ||
      !currentState.selectedComparison.leftVersion ||
      !currentState.selectedComparison.rightVersion
    ) {
      return;
    }

    const leftVersion = currentState.selectedComparison.leftVersion;
    const rightVersion = currentState.selectedComparison.rightVersion;

    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            versionDiff: {
              status: "loading",
              leftVersion,
              rightVersion,
            },
          }
        : current,
    );

    try {
      const diff = await loadContentDocumentVersionDiff({
        api,
        documentId: currentState.documentId,
        locale: currentState.document.locale,
        leftVersion,
        rightVersion,
      });

      setState((current) =>
        current.status === "ready" &&
        current.selectedComparison.leftVersion === leftVersion &&
        current.selectedComparison.rightVersion === rightVersion
          ? {
              ...current,
              versionDiff: {
                status: "ready",
                diff,
              },
            }
          : current,
      );
    } catch (error) {
      const message = toRouteErrorMessage(
        error,
        "Failed to load document version diff.",
      );

      setState((current) =>
        current.status === "ready" &&
        current.selectedComparison.leftVersion === leftVersion &&
        current.selectedComparison.rightVersion === rightVersion
          ? {
              ...current,
              versionDiff: {
                status: "error",
                leftVersion,
                rightVersion,
                message,
              },
            }
          : current,
      );
    }
  });

  const publishDocument = useEffectEvent(async () => {
    const currentState = stateRef.current;
    const api = createRouteApi();

    if (!api || currentState.status !== "ready" || !currentState.canWrite) {
      return;
    }

    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            publishState: "publishing",
            publishError: undefined,
          }
        : current,
    );

    try {
      const nextState = await publishContentDocumentReadyState({
        api,
        state: currentState,
        changeSummary: currentState.publishChangeSummary,
      });

      const recoveredSchemaState = nextState.schemaState;

      if (hasSchemaRecoveryMismatch(recoveredSchemaState)) {
        setState((current) =>
          current.status === "ready"
            ? applyGuardedPublishFailureToReadyState({
                state: current,
                schemaState: recoveredSchemaState,
              })
            : current,
        );
        return;
      }

      setState((current) =>
        current.status === "ready" &&
        current.documentId === currentState.documentId
          ? applySuccessfulPublishToReadyState({
              state: current,
              requestBody: currentState.draftBody,
              publishedState: nextState,
            })
          : current,
      );
    } catch (error) {
      const message = toRouteErrorMessage(error, "Failed to publish document.");

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              publishState: "idle",
              publishError: message,
            }
          : current,
      );
    }
  });

  const syncSchema = useEffectEvent(async () => {
    const currentState = stateRef.current;

    if (
      currentState.status !== "ready" ||
      !currentState.schemaState ||
      currentState.schemaState.status !== "ready" ||
      !currentState.schemaState.canSync
    ) {
      return;
    }

    // Sync Schema forwards the authored config snapshot through the schema
    // registry contract; Studio does not edit schema definitions here.
    const nextSchemaState = await syncSchemaStateForGuard(
      currentState.schemaState,
    );

    if (!nextSchemaState) {
      return;
    }

    setState((current) =>
      current.status === "ready" &&
      current.documentId === currentState.documentId
        ? applySchemaStateToReadyState({
            state: current,
            schemaState: nextSchemaState,
          })
        : current,
    );
  });

  const loadDocument = useEffectEvent(async () => {
    const loadRequestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = loadRequestId;

    setState(
      createLoadingState({
        typeId,
        typeLabel,
        documentId,
        route,
      }),
    );

    const nextState = await loadContentDocumentPageState({
      context,
      typeId,
      typeLabel,
      documentId,
    });

    if (loadRequestIdRef.current !== loadRequestId) {
      return;
    }

    setState(nextState);
    stateRef.current = nextState;
  });

  const saveDraft = useEffectEvent(async () => {
    const currentState = stateRef.current;
    const api = createRouteApi();

    if (
      !api ||
      // Fail closed when the embedded host cannot derive the local schema hash
      // required by guarded draft-write routes.
      !route ||
      !route.write.canWrite ||
      currentState.status !== "ready"
    ) {
      return;
    }

    if (
      !currentState.canWrite ||
      currentState.saveState !== "unsaved" ||
      currentState.draftBody === currentState.document.body ||
      currentState.saveRequestBody === currentState.draftBody
    ) {
      return;
    }

    const requestBody = currentState.draftBody;

    setState((current) =>
      current.status === "ready"
        ? reduceContentDocumentPageReadyState(current, {
            type: "saveStarted",
          })
        : current,
    );

    const nextState = await saveContentDocumentReadyState({
      api,
      route,
      state: currentState,
    });

    const recoveredSchemaState = nextState.schemaState;

    if (hasSchemaRecoveryMismatch(recoveredSchemaState)) {
      setState((current) =>
        current.status === "ready"
          ? applyGuardedDraftSaveFailureToReadyState({
              state: current,
              schemaState: recoveredSchemaState,
            })
          : current,
      );
      return;
    }

    const mutationError = nextState.mutationError;
    if (mutationError) {
      setState((current) =>
        current.status === "ready"
          ? applyFailedDraftSaveToReadyState({
              state: current,
              requestBody,
              message: mutationError,
            })
          : current,
      );
      return;
    }

    setState((current) =>
      current.status === "ready"
        ? applySuccessfulDraftSaveToReadyState({
            state: current,
            requestBody,
            persistedBody: nextState.document.body,
            updatedAt: nextState.document.updatedAt,
          })
        : current,
    );
  });

  const handleLocaleSwitch = useEffectEvent(async (targetLocale: string) => {
    const currentState = stateRef.current;
    if (currentState.status !== "ready") return;

    // If selecting the current locale, clear variant creation state
    if (targetLocale === currentState.locale && !currentState.variantCreation) {
      return;
    }

    // Unsaved changes guard: save before switching
    if (
      currentState.saveState === "unsaved" &&
      currentState.canWrite &&
      currentState.draftBody !== currentState.document.body
    ) {
      await saveDraft();

      // Abort switch if save failed — edits would be lost
      const afterSave = stateRef.current;
      if (
        afterSave.status === "ready" &&
        afterSave.saveState !== "saved" &&
        afterSave.draftBody !== afterSave.document.body
      ) {
        return;
      }
    }

    // Check if variant exists
    const existingVariant = currentState.translationVariants.find(
      (v) => v.locale === targetLocale,
    );

    if (existingVariant) {
      // Clear variant creation state and navigate to the existing variant
      setState((current) =>
        current.status === "ready"
          ? { ...current, variantCreation: undefined }
          : current,
      );
      router.push(
        `/admin/content/${currentState.typeId}/${existingVariant.documentId}`,
      );
      return;
    }

    // No variant exists — show creation prompt (only if user can write)
    if (!currentState.canWrite) {
      return;
    }

    // Prefer the default locale variant as the prefill source per SPEC-009.
    // Fall back to the current variant if the default locale variant is
    // not available (e.g., not yet created or current doc is the default).
    const defaultLocale = route?.defaultLocale;
    const defaultVariant =
      defaultLocale && defaultLocale !== currentState.locale
        ? currentState.translationVariants.find(
            (v) => v.locale === defaultLocale,
          )
        : undefined;

    const sourceDocumentId =
      defaultVariant?.documentId ?? currentState.documentId;
    const sourceLocale = defaultVariant?.locale ?? currentState.locale;

    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            variantCreation: {
              targetLocale,
              sourceDocumentId,
              sourceLocale,
              status: "idle",
            },
          }
        : current,
    );
  });

  const handleCreateVariant = useEffectEvent(async (prefill: boolean) => {
    const currentState = stateRef.current;
    const api = createRouteApi();

    if (
      !api ||
      currentState.status !== "ready" ||
      !currentState.variantCreation ||
      !currentState.canWrite
    ) {
      return;
    }

    const { targetLocale, sourceDocumentId } = currentState.variantCreation;

    setState((current) =>
      current.status === "ready" && current.variantCreation
        ? {
            ...current,
            variantCreation: {
              ...current.variantCreation,
              status: "creating",
              error: undefined,
            },
          }
        : current,
    );

    try {
      const sourceFrontmatter =
        "frontmatter" in currentState.document
          ? (currentState.document as ContentDocumentResponse).frontmatter
          : {};
      const result = await api.create({
        type: currentState.typeId,
        path: currentState.document.path,
        locale: targetLocale,
        format: "mdx",
        frontmatter: prefill ? sourceFrontmatter : {},
        body: prefill ? currentState.draftBody : "",
        sourceDocumentId,
        schemaHash: route?.write.canWrite ? route.write.schemaHash : undefined,
      });

      router.push(`/admin/content/${currentState.typeId}/${result.documentId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create variant.";

      setState((current) =>
        current.status === "ready" && current.variantCreation
          ? {
              ...current,
              variantCreation: {
                ...current.variantCreation,
                status: "idle",
                error: message,
              },
            }
          : current,
      );
    }
  });

  const handleCancelVariantCreation = useEffectEvent(() => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, variantCreation: undefined }
        : current,
    );
  });

  useEffect(() => {
    void loadDocument();
  }, [context, documentId, route, typeId, typeLabel]);

  const readyDraftBody = state.status === "ready" ? state.draftBody : undefined;
  const readyDocumentBody =
    state.status === "ready" ? state.document.body : undefined;
  const readyCanWrite = state.status === "ready" ? state.canWrite : false;
  const readySaveRequestBody =
    state.status === "ready" ? state.saveRequestBody : undefined;
  const readySaveState = state.status === "ready" ? state.saveState : undefined;
  const readyLeftComparisonVersion =
    state.status === "ready" ? state.selectedComparison.leftVersion : undefined;
  const readyRightComparisonVersion =
    state.status === "ready"
      ? state.selectedComparison.rightVersion
      : undefined;

  useEffect(() => {
    if (
      state.status !== "ready" ||
      !state.canWrite ||
      state.saveState !== "unsaved" ||
      state.draftBody === state.document.body ||
      state.saveRequestBody === state.draftBody
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      void saveDraft();
    }, DOCUMENT_SAVE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    readyCanWrite,
    readyDocumentBody,
    readyDraftBody,
    readySaveRequestBody,
    readySaveState,
    state.status,
  ]);

  useEffect(() => {
    if (
      state.status !== "ready" ||
      !state.selectedComparison.leftVersion ||
      !state.selectedComparison.rightVersion
    ) {
      return;
    }

    if (
      state.versionDiff.status === "ready" &&
      state.versionDiff.diff.leftVersion ===
        state.selectedComparison.leftVersion &&
      state.versionDiff.diff.rightVersion ===
        state.selectedComparison.rightVersion
    ) {
      return;
    }

    if (
      state.versionDiff.status === "loading" &&
      state.versionDiff.leftVersion === state.selectedComparison.leftVersion &&
      state.versionDiff.rightVersion === state.selectedComparison.rightVersion
    ) {
      return;
    }

    void loadSelectedVersionDiff();
  }, [
    readyLeftComparisonVersion,
    readyRightComparisonVersion,
    state.status,
    state.status === "ready" ? state.versionDiff.status : "idle",
    state.status === "ready" && state.versionDiff.status === "ready"
      ? state.versionDiff.diff.leftVersion
      : undefined,
    state.status === "ready" && state.versionDiff.status === "ready"
      ? state.versionDiff.diff.rightVersion
      : undefined,
    state.status === "ready" && state.versionDiff.status === "loading"
      ? state.versionDiff.leftVersion
      : undefined,
    state.status === "ready" && state.versionDiff.status === "loading"
      ? state.versionDiff.rightVersion
      : undefined,
  ]);

  return (
    <ContentDocumentPageView
      state={state}
      context={context}
      sidebarOpen={sidebarOpen}
      activeMdxComponent={activeMdxComponent}
      onDraftChange={(body) => {
        setState((current) =>
          current.status === "ready"
            ? reduceContentDocumentPageReadyState(current, {
                type: "draftChanged",
                body,
              })
            : current,
        );
      }}
      onActiveMdxComponentChange={setActiveMdxComponent}
      onToggleSidebar={() => setSidebarOpen((current) => !current)}
      onGoBack={() => router.back()}
      onPublishDialogOpenChange={(open) => {
        setState((current) =>
          current.status === "ready"
            ? {
                ...current,
                publishDialogOpen: open,
                publishState: open ? current.publishState : "idle",
                publishError: open ? undefined : current.publishError,
                publishChangeSummary: open ? current.publishChangeSummary : "",
              }
            : current,
        );
      }}
      onPublishChangeSummaryChange={(value) => {
        setState((current) =>
          current.status === "ready"
            ? {
                ...current,
                publishChangeSummary: value,
              }
            : current,
        );
      }}
      onPublishSubmit={() => {
        void publishDocument();
      }}
      onSchemaSync={() => {
        void syncSchema();
      }}
      onSelectComparisonVersion={(side, version) => {
        setState((current) =>
          current.status === "ready"
            ? {
                ...current,
                selectedComparison: {
                  ...current.selectedComparison,
                  [side === "left" ? "leftVersion" : "rightVersion"]: version,
                },
                versionDiff: resetVersionDiffState(),
              }
            : current,
        );
      }}
      onLocaleSwitch={(locale) => {
        void handleLocaleSwitch(locale);
      }}
      onCreateVariant={(prefill) => {
        void handleCreateVariant(prefill);
      }}
      onCancelVariantCreation={handleCancelVariantCreation}
    />
  );
}
