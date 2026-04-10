"use client";

import {
  type ChangeEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
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
import { type MdxPropsPanelSelection } from "../components/editor/mdx-props-panel.js";
import {
  TipTapEditor,
  type TipTapEditorHandle,
} from "../components/editor/tiptap-editor.js";
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
  PanelRight,
  PanelRightClose,
  Send,
} from "lucide-react";
import { cn } from "../lib/utils.js";
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
  viewingVersion?: {
    version: number;
    body: string;
    status: "loading" | "ready" | "error";
    error?: string;
  };
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
  editorRef?: React.Ref<TipTapEditorHandle>;
  onViewVersion?: (version: number) => void;
  onBackToDraft?: () => void;
  onLocaleSwitch?: (locale: string) => void;
  onCreateVariant?: (prefill: boolean) => void;
  onCancelVariantCreation?: () => void;
};

type CreateContentDocumentPageHistoryApi = (input: {
  context: StudioMountContext;
  route: StudioDocumentRouteMountContext;
}) => Pick<StudioDocumentRouteApi, "listVersions" | "listVariants">;

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

  // Fallback: if schema entries are empty (e.g., SCHEMA_NOT_SYNCED) but the
  // document has a real locale and supportedLocales is configured, infer the
  // type is localized so the switcher still appears for read-only navigation.
  if (
    !localized &&
    route.supportedLocales &&
    route.supportedLocales.length > 0 &&
    readyState.locale !== "__mdcms_default__"
  ) {
    localized = true;
  }

  if (
    localized &&
    route.supportedLocales &&
    route.supportedLocales.length > 0
  ) {
    try {
      const routeApi = routeApiFactory({
        context: input.context,
        route,
      });
      const variantsResponse = await routeApi.listVariants({
        documentId: input.documentId,
      });
      translationVariants = variantsResponse.data;

      // Ensure the current document always appears in the variants list
      // even if RBAC path filtering omitted it from the server response.
      if (
        !translationVariants.some((v) => v.documentId === readyState.documentId)
      ) {
        translationVariants = [
          {
            documentId: readyState.documentId,
            locale: readyState.locale,
            path: readyState.document.path,
            publishedVersion: readyState.document.publishedVersion,
            hasUnpublishedChanges: readyState.document.hasUnpublishedChanges,
          },
          ...translationVariants,
        ];
      }
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

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

function getStatusBadge(state: ContentDocumentPageReadyState): {
  label: string;
  color: string;
} {
  if (state.document.publishedVersion === null) {
    return { label: "Draft", color: "#888" };
  }

  return state.document.hasUnpublishedChanges
    ? { label: "Changed", color: "#f59e0b" }
    : { label: "Published", color: "#22c55e" };
}

function SidebarPropertiesTab(props: { state: ContentDocumentPageReadyState }) {
  const status = getStatusBadge(props.state);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Status
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-background-subtle px-2.5 py-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: status.color }}
          />
          <span className="text-xs font-medium">{status.label}</span>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Published version
        </div>
        <span className="text-sm">
          {props.state.document.publishedVersion !== null
            ? `v${props.state.document.publishedVersion}`
            : "Not published"}
        </span>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Locale
        </div>
        <span className="text-sm">{props.state.locale}</span>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Last edited
        </div>
        <span className="text-sm">
          {formatRelativeTime(props.state.document.updatedAt)}
        </span>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Path
        </div>
        <span className="font-mono text-xs text-foreground-muted">
          {props.state.document.path}
        </span>
      </div>
    </div>
  );
}

function SidebarHistoryTab(props: {
  state: ContentDocumentPageReadyState;
  onViewVersion?: (version: number) => void;
  onBackToDraft?: () => void;
}) {
  const { versionHistory, viewingVersion } = props.state;

  const isViewingLatest = !viewingVersion;

  return (
    <div className="p-4">
      {versionHistory.status === "idle" ||
      versionHistory.status === "loading" ? (
        <p className="text-sm text-foreground-muted">
          {versionHistory.status === "loading"
            ? "Loading versions..."
            : "Loading..."}
        </p>
      ) : versionHistory.status === "error" ? (
        <p className="text-sm text-destructive">{versionHistory.message}</p>
      ) : versionHistory.status === "empty" ? (
        <p className="text-sm text-foreground-muted">
          No published versions yet.
        </p>
      ) : (
        <div className="relative border-l-2 border-border pl-4">
          {/* Latest (current draft) entry */}
          <button
            type="button"
            className={cn(
              "relative mb-4 w-full rounded-md px-2 py-1.5 text-left transition-colors",
              isViewingLatest ? "bg-accent/10" : "hover:bg-background-subtle",
            )}
            onClick={() => {
              if (!isViewingLatest) {
                props.onBackToDraft?.();
              }
            }}
          >
            <div className="absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
            <p className="text-sm font-medium">
              Latest
              {isViewingLatest ? (
                <span className="ml-1.5 text-xs font-normal text-accent">
                  viewing
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Current draft
            </p>
          </button>

          {/* Published versions */}
          {versionHistory.versions.map((version) => {
            const isViewing = viewingVersion?.version === version.version;

            return (
              <button
                key={version.version}
                type="button"
                data-mdcms-version={version.version}
                className={cn(
                  "relative mb-4 w-full rounded-md px-2 py-1.5 text-left transition-colors last:mb-0",
                  isViewing ? "bg-accent/10" : "hover:bg-background-subtle",
                )}
                onClick={() => {
                  if (isViewing) {
                    props.onBackToDraft?.();
                  } else {
                    props.onViewVersion?.(version.version);
                  }
                }}
              >
                <div className="absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
                <p className="text-sm font-medium">
                  v{version.version}
                  {isViewing ? (
                    <span className="ml-1.5 text-xs font-normal text-accent">
                      viewing
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {version.changeSummary ?? "No summary"}
                </p>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {formatRelativeTime(version.publishedAt)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContentDocumentPageSidebar(props: {
  state: ContentDocumentPageReadyState;
  onViewVersion?: (version: number) => void;
  onBackToDraft?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"properties" | "history">(
    "properties",
  );

  return (
    <aside
      data-mdcms-editor-pane="sidebar"
      className="flex w-80 shrink-0 flex-col border-l border-border bg-background"
    >
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          className={cn(
            "flex-1 py-2.5 text-center text-xs font-semibold transition-colors",
            activeTab === "properties"
              ? "border-b-2 border-accent text-accent"
              : "text-foreground-muted hover:text-foreground",
          )}
          onClick={() => setActiveTab("properties")}
        >
          Properties
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 py-2.5 text-center text-xs font-semibold transition-colors",
            activeTab === "history"
              ? "border-b-2 border-accent text-accent"
              : "text-foreground-muted hover:text-foreground",
          )}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "properties" ? (
          <SidebarPropertiesTab state={props.state} />
        ) : (
          <SidebarHistoryTab
            state={props.state}
            onViewVersion={props.onViewVersion}
            onBackToDraft={props.onBackToDraft}
          />
        )}
      </div>
    </aside>
  );
}

export function filterLocaleOptions(input: {
  supportedLocales: string[];
  translationVariants: TranslationVariantSummary[];
  canWrite: boolean;
  variantsFetchFailed: boolean;
}): Array<{ locale: string; hasVariant: boolean }> {
  return input.supportedLocales
    .map((loc) => ({
      locale: loc,
      hasVariant: input.translationVariants.some((v) => v.locale === loc),
    }))
    .filter(
      (item) =>
        item.hasVariant || (input.canWrite && !input.variantsFetchFailed),
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
  editorRef,
  onViewVersion,
  onBackToDraft,
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
        <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-3 border-b border-border bg-background px-4">
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
                disabled={state.variantCreation?.status === "creating"}
              >
                <SelectTrigger className="h-8 w-auto min-w-[100px] gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterLocaleOptions({
                    supportedLocales: state.route.supportedLocales,
                    translationVariants: state.translationVariants,
                    canWrite: state.canWrite,
                    variantsFetchFailed: state.variantsFetchFailed,
                  }).map(({ locale: loc, hasVariant }) => (
                    <SelectItem key={loc} value={loc}>
                      {hasVariant ? loc : `+ ${loc}`}
                    </SelectItem>
                  ))}
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

                  {state.viewingVersion ? (
                    <div className="mb-3 flex items-center justify-between rounded-md border border-accent/30 bg-accent/5 px-4 py-2.5">
                      <p className="text-sm font-medium">
                        Viewing version {state.viewingVersion.version}
                        {state.viewingVersion.status === "loading"
                          ? " — Loading..."
                          : null}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => onBackToDraft?.()}
                      >
                        View latest
                      </Button>
                    </div>
                  ) : null}

                  {state.viewingVersion?.status === "error" ? (
                    <div className="mb-3 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {state.viewingVersion.error}
                    </div>
                  ) : null}

                  <TipTapEditor
                    ref={editorRef}
                    initialContent={state.draftBody}
                    context={context}
                    onChange={onDraftChange}
                    onActiveMdxComponentChange={onActiveMdxComponentChange}
                    readOnly={!state.canWrite || !!state.viewingVersion}
                    forbidden={false}
                  />
                </div>
              )}
            </div>
          </div>

          {state.status === "ready" && sidebarOpen ? (
            <ContentDocumentPageSidebar
              state={state}
              onViewVersion={onViewVersion}
              onBackToDraft={onBackToDraft}
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
  const editorRef = useRef<TipTapEditorHandle>(null);
  const [activeMdxComponent, setActiveMdxComponent] =
    useState<MdxPropsPanelSelection | null>(null);
  const stateRef = useRef(state);
  const loadRequestIdRef = useRef(0);

  // Sync ref after commit so event handlers and async callbacks always
  // see the latest committed state. useLayoutEffect runs synchronously
  // after commit but before paint, avoiding the stale-ref gap of useEffect
  // while respecting React's rule against mutating refs during render.
  useLayoutEffect(() => {
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

      // If publish normalized the body, rehydrate the editor — but only
      // if the user hasn't typed newer edits during the in-flight publish.
      const publishedBody = nextState.document.body;
      const latestAfterPublish = stateRef.current;
      if (
        publishedBody !== currentState.draftBody &&
        latestAfterPublish.status === "ready" &&
        latestAfterPublish.documentId === currentState.documentId &&
        latestAfterPublish.draftBody === currentState.draftBody &&
        !latestAfterPublish.viewingVersion
      ) {
        editorRef.current?.setContent(publishedBody);
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
  });

  const saveDraft = useEffectEvent(async (): Promise<boolean> => {
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
      return false;
    }

    if (
      !currentState.canWrite ||
      currentState.saveState !== "unsaved" ||
      currentState.draftBody === currentState.document.body ||
      currentState.saveRequestBody === currentState.draftBody
    ) {
      return false;
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
      return false;
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
      return false;
    }

    // If the server normalized the body (whitespace, etc.), rehydrate the
    // editor — but only if the user hasn't typed newer edits during the
    // in-flight save. The reducer already preserves newer drafts in state.
    const persistedBody = nextState.document.body;
    const latestAfterSave = stateRef.current;
    if (
      persistedBody !== requestBody &&
      latestAfterSave.status === "ready" &&
      latestAfterSave.documentId === currentState.documentId &&
      latestAfterSave.draftBody === requestBody &&
      !latestAfterSave.viewingVersion
    ) {
      editorRef.current?.setContent(persistedBody);
    }

    setState((current) =>
      current.status === "ready" &&
      current.documentId === currentState.documentId
        ? applySuccessfulDraftSaveToReadyState({
            state: current,
            requestBody,
            persistedBody,
            updatedAt: nextState.document.updatedAt,
          })
        : current,
    );
    return true;
  });

  const handleLocaleSwitch = useEffectEvent(async (targetLocale: string) => {
    const currentState = stateRef.current;
    if (currentState.status !== "ready") return;

    // If selecting the current locale, clear variant creation state
    if (targetLocale === currentState.locale && !currentState.variantCreation) {
      return;
    }

    // Unsaved changes guard: save before switching (covers both unsaved
    // edits and in-flight saves that haven't persisted yet)
    if (
      currentState.saveState !== "saved" &&
      currentState.canWrite &&
      currentState.draftBody !== currentState.document.body
    ) {
      const saved = await saveDraft();

      if (!saved) {
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
      // Always fetch the source document via loadDraft for prefill.
      // StudioDocumentShellData does not carry frontmatter or format,
      // so reading from local state would lose metadata.
      let sourceBody = "";
      let sourceFrontmatter: Record<string, unknown> = {};
      let sourceFormat: "md" | "mdx" = "mdx";

      if (prefill) {
        const sourceDoc = await api.loadDraft({
          documentId: sourceDocumentId,
          type: currentState.typeId,
          locale: currentState.variantCreation.sourceLocale,
        });
        sourceBody = sourceDoc.body ?? "";
        sourceFrontmatter = sourceDoc.frontmatter ?? {};
        sourceFormat = sourceDoc.format ?? "mdx";
      }

      const result = await api.create({
        type: currentState.typeId,
        path: currentState.document.path,
        locale: targetLocale,
        format: sourceFormat,
        frontmatter: prefill ? sourceFrontmatter : {},
        body: prefill ? sourceBody : "",
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

  const handleViewVersion = useEffectEvent(async (version: number) => {
    const currentState = stateRef.current;
    const api = createRouteApi();

    if (!api || currentState.status !== "ready") return;

    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            viewingVersion: { version, body: "", status: "loading" },
          }
        : current,
    );

    try {
      const versionDoc = await api.getVersion({
        documentId: currentState.documentId,
        locale: currentState.document.locale,
        version,
      });

      const versionBody = versionDoc.body ?? "";

      // Only update the editor if this version is still the one the UI expects.
      // A newer version click may have fired while this fetch was in-flight.
      const afterFetch = stateRef.current;
      if (
        afterFetch.status !== "ready" ||
        afterFetch.documentId !== currentState.documentId ||
        afterFetch.viewingVersion?.version !== version
      ) {
        return;
      }

      editorRef.current?.setContent(versionBody);

      setState((current) =>
        current.status === "ready" &&
        current.viewingVersion?.version === version
          ? {
              ...current,
              viewingVersion: {
                version,
                body: versionBody,
                status: "ready",
              },
            }
          : current,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load version.";

      setState((current) =>
        current.status === "ready" &&
        current.viewingVersion?.version === version
          ? {
              ...current,
              viewingVersion: {
                version,
                body: "",
                status: "error",
                error: message,
              },
            }
          : current,
      );
    }
  });

  const handleBackToDraft = useEffectEvent(() => {
    const currentState = stateRef.current;

    if (currentState.status === "ready") {
      editorRef.current?.setContent(currentState.draftBody);
    }

    setState((current) =>
      current.status === "ready"
        ? { ...current, viewingVersion: undefined }
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
      editorRef={editorRef}
      onViewVersion={(version) => {
        void handleViewVersion(version);
      }}
      onBackToDraft={handleBackToDraft}
    />
  );
}
