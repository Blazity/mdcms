"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ContentDocumentResponse,
  DocumentPromotionResult,
  EnvironmentSummary,
} from "@mdcms/shared";

import { createStudioContentListApi } from "../../../content-list-api.js";
import { createStudioEnvironmentApi } from "../../../environment-api.js";
import { useStudioMountInfo } from "./mount-info-context.js";
import { useStudioSession } from "./session-context.js";
import {
  PageHeader,
  PageHeaderDescription,
} from "../../components/layout/page-header.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Label } from "../../components/ui/label.js";
import { Switch } from "../../components/ui/switch.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.js";

// Promote page implements the cross-environment per-document promotion
// workflow described in SPEC-009 (#Promoting). It is a two-stage flow:
//
//   1. Operator picks source/target/documents, runs a dry-run preview.
//   2. Operator confirms the explicit overwrite list, the page calls the
//      real run, surfaces atomic-remap failures, or reports success.
//
// The page is intentionally minimal — it relies on the existing content-list
// API and the environment-api clone/promote client. Authorization is enforced
// by the server (`environments:promote` scope); we surface 401/403 as
// "forbidden" UI states.

export type PromotePageState =
  | { status: "loading"; message: string }
  | { status: "missing-route" }
  | {
      status: "forbidden";
      message: string;
    }
  | {
      status: "error";
      message: string;
    }
  | {
      status: "ready";
      project: string;
      environments: EnvironmentSummary[];
    };

// `PromotePreviewSnapshot` freezes the inputs that produced a successful
// dry-run. A real run uses these — not the live form state — so an operator
// who tweaks the selection after previewing has to re-preview before
// executing, never accidentally promoting a different set of documents than
// the confirmation dialog showed.
export type PromotePreviewSnapshot = {
  sourceEnvId: string;
  sourceEnvName: string;
  targetEnvId: string;
  targetEnvName: string;
  documentIds: string[];
  includeUnpublished: boolean;
};

export type PromotePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      results: DocumentPromotionResult[];
      snapshot: PromotePreviewSnapshot;
    }
  | {
      status: "error";
      message: string;
      remapDetails?: {
        sourceDocumentId?: string;
        fieldPath?: string;
        translationGroupId?: string;
        locale?: string;
      };
    };

function readRuntimeErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }
  return fallback;
}

function readRuntimeErrorStatus(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return null;
}

function readRemapDetails(
  error: unknown,
): PromotePreviewState extends { status: "error"; remapDetails?: infer R }
  ? R
  : never;
function readRemapDetails(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof (error as { details?: unknown }).details === "object" &&
    (error as { details?: unknown }).details !== null
  ) {
    const details = (error as { details?: Record<string, unknown> }).details!;
    return {
      sourceDocumentId:
        typeof details.sourceDocumentId === "string"
          ? details.sourceDocumentId
          : undefined,
      fieldPath:
        typeof details.fieldPath === "string" ? details.fieldPath : undefined,
      translationGroupId:
        typeof details.translationGroupId === "string"
          ? details.translationGroupId
          : undefined,
      locale: typeof details.locale === "string" ? details.locale : undefined,
    };
  }
  return undefined;
}

export default function PromotePage() {
  const { project, environment, apiBaseUrl, auth } = useStudioMountInfo();
  const sessionState = useStudioSession();

  // Initial state reflects routing synchronously so SSR markup matches the
  // hydrated state — missing routing renders the missing-route panel,
  // present routing renders the loading panel until the env list arrives.
  const [state, setState] = useState<PromotePageState>(() =>
    !project || !environment
      ? { status: "missing-route" }
      : { status: "loading", message: "Loading environments." },
  );
  const [sourceEnvId, setSourceEnvId] = useState<string>("");
  const [targetEnvId, setTargetEnvId] = useState<string>("");
  const [documents, setDocuments] = useState<ContentDocumentResponse[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [includeUnpublished, setIncludeUnpublished] = useState(false);
  const [preview, setPreview] = useState<PromotePreviewState>({
    status: "idle",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{
    promoted: DocumentPromotionResult[];
  } | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !environment) {
      setState({ status: "missing-route" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", message: "Loading environments." });

    const environmentApi = createStudioEnvironmentApi(
      { project, environment, serverUrl: apiBaseUrl },
      { auth },
    );

    void environmentApi
      .list()
      .then((result) => {
        if (cancelled) return;
        const envs = result.data;
        setState({ status: "ready", project, environments: envs });
        // Default the source picker to the active environment, target to a
        // different one if available.
        const activeEnv = envs.find((entry) => entry.name === environment);
        const otherEnv = envs.find((entry) => entry.name !== environment);
        setSourceEnvId(activeEnv?.id ?? envs[0]?.id ?? "");
        setTargetEnvId(otherEnv?.id ?? "");
      })
      .catch((error) => {
        if (cancelled) return;
        const status = readRuntimeErrorStatus(error);
        if (status === 401 || status === 403) {
          setState({
            status: "forbidden",
            message: readRuntimeErrorMessage(error, "Forbidden."),
          });
        } else {
          setState({
            status: "error",
            message: readRuntimeErrorMessage(
              error,
              "Failed to load environments.",
            ),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, auth.mode, auth.token, environment, project]);

  // Reload documents whenever source environment changes.
  useEffect(() => {
    if (!project || !sourceEnvId || state.status !== "ready") return;
    const sourceEnv = state.environments.find(
      (entry) => entry.id === sourceEnvId,
    );
    if (!sourceEnv) return;

    let cancelled = false;
    setDocumentsLoading(true);

    const contentApi = createStudioContentListApi(
      { project, environment: sourceEnv.name, serverUrl: apiBaseUrl },
      { auth },
    );

    void contentApi
      .list({ limit: 100, sort: "updatedAt", order: "desc" })
      .then((result) => {
        if (cancelled) return;
        setDocuments(result.data);
        setSelectedIds([]);
      })
      .catch(() => {
        if (cancelled) return;
        setDocuments([]);
      })
      .finally(() => {
        if (!cancelled) setDocumentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, auth.mode, auth.token, project, sourceEnvId, state]);

  const sourceEnv = useMemo(
    () =>
      state.status === "ready"
        ? state.environments.find((entry) => entry.id === sourceEnvId)
        : undefined,
    [state, sourceEnvId],
  );
  const targetEnv = useMemo(
    () =>
      state.status === "ready"
        ? state.environments.find((entry) => entry.id === targetEnvId)
        : undefined,
    [state, targetEnvId],
  );

  // Invalidate any prior preview when the user changes inputs that drive it.
  // Combined with the snapshot recorded inside the preview result, this means
  // the operator must re-preview after editing source/target/selection
  // before the "Confirm & Promote" button works again.
  useEffect(() => {
    setPreview((current) =>
      current.status === "ready" ? { status: "idle" } : current,
    );
  }, [sourceEnvId, targetEnvId, selectedIds, includeUnpublished]);

  async function handlePreview() {
    if (!project || !targetEnv || !sourceEnv) return;
    if (sessionState.status !== "authenticated") {
      setPreview({
        status: "error",
        message: "Session could not be verified.",
      });
      return;
    }
    if (selectedIds.length === 0) {
      setPreview({
        status: "error",
        message: "Pick at least one source document to promote.",
      });
      return;
    }
    // Snapshot inputs at preview time. The real run uses *these*, not the
    // live form state, so the confirmation dialog never lies about what
    // will execute.
    const snapshot: PromotePreviewSnapshot = {
      sourceEnvId: sourceEnv.id,
      sourceEnvName: sourceEnv.name,
      targetEnvId: targetEnv.id,
      targetEnvName: targetEnv.name,
      documentIds: [...selectedIds],
      includeUnpublished,
    };
    setPreview({ status: "loading" });
    try {
      const environmentApi = createStudioEnvironmentApi(
        {
          project,
          environment: snapshot.sourceEnvName,
          serverUrl: apiBaseUrl,
        },
        { auth, csrfToken: sessionState.csrfToken },
      );
      const result = await environmentApi.promote(snapshot.targetEnvId, {
        sourceEnvironmentId: snapshot.sourceEnvId,
        documentIds: snapshot.documentIds,
        includeUnpublished: snapshot.includeUnpublished,
        dryRun: true,
      });
      setPreview({ status: "ready", results: result.promoted, snapshot });
    } catch (error) {
      setPreview({
        status: "error",
        message: readRuntimeErrorMessage(error, "Promote preview failed."),
        remapDetails: readRemapDetails(error),
      });
    }
  }

  async function handleConfirmExecute() {
    if (!project) return;
    if (preview.status !== "ready") {
      setExecuteError("Re-run preview before promoting.");
      return;
    }
    if (sessionState.status !== "authenticated") {
      setExecuteError("Session could not be verified.");
      return;
    }
    const snapshot = preview.snapshot;
    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const environmentApi = createStudioEnvironmentApi(
        {
          project,
          environment: snapshot.sourceEnvName,
          serverUrl: apiBaseUrl,
        },
        { auth, csrfToken: sessionState.csrfToken },
      );
      // Replay the dry-run plan: send back the target ids the preview
      // returned so the real run uses identical UUIDs (and identical
      // overwrite/create classification).
      const preallocatedTargetIds: Record<string, string> = {};
      for (const entry of preview.results) {
        if (entry.status === "created" && entry.targetDocumentId) {
          preallocatedTargetIds[entry.sourceDocumentId] =
            entry.targetDocumentId;
        }
      }
      const result = await environmentApi.promote(snapshot.targetEnvId, {
        sourceEnvironmentId: snapshot.sourceEnvId,
        documentIds: snapshot.documentIds,
        includeUnpublished: snapshot.includeUnpublished,
        dryRun: false,
        ...(Object.keys(preallocatedTargetIds).length > 0
          ? { preallocatedTargetIds }
          : {}),
      });
      setExecuteResult(result);
      setConfirmOpen(false);
    } catch (error) {
      setExecuteError(
        readRuntimeErrorMessage(error, "Promote execution failed."),
      );
    } finally {
      setExecuting(false);
    }
  }

  const overwriteRows =
    preview.status === "ready"
      ? preview.results.filter((entry) => entry.status === "overwrote")
      : [];
  const createRows =
    preview.status === "ready"
      ? preview.results.filter((entry) => entry.status === "created")
      : [];
  const skippedRows =
    preview.status === "ready"
      ? preview.results.filter(
          (entry) => entry.status === "skipped_unpublished",
        )
      : [];

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Promote" }]} />
      <div className="space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Promote content
          </h1>
          <PageHeaderDescription>
            Push selected documents from one environment to another. Promotion
            is an explicit overwrite — target content is replaced, no merge or
            conflict resolution. Per SPEC-009, references are remapped by
            translation_group_id + locale; if any reference cannot be remapped
            the entire promotion fails atomically.
          </PageHeaderDescription>
        </div>

        {state.status === "missing-route" ? (
          <section className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Promote requires an active project and environment.
          </section>
        ) : state.status === "loading" ? (
          <section className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {state.message}
          </section>
        ) : state.status === "forbidden" ? (
          <section
            data-mdcms-promote-page-state="forbidden"
            className="space-y-2 rounded-lg border border-dashed p-4"
          >
            <Badge variant="default">Forbidden</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </section>
        ) : state.status === "error" ? (
          <section
            data-mdcms-promote-page-state="error"
            className="space-y-2 rounded-lg border border-dashed p-4"
          >
            <Badge variant="destructive">Error</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </section>
        ) : (
          <div data-mdcms-promote-page-state="ready" className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-md border p-4">
                <Label htmlFor="promote-source">Source environment</Label>
                <select
                  id="promote-source"
                  data-mdcms-promote-source
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={sourceEnvId}
                  onChange={(event) => setSourceEnvId(event.target.value)}
                >
                  {state.environments.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 rounded-md border p-4">
                <Label htmlFor="promote-target">Target environment</Label>
                <select
                  id="promote-target"
                  data-mdcms-promote-target
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={targetEnvId}
                  onChange={(event) => setTargetEnvId(event.target.value)}
                >
                  <option value="">Select target...</option>
                  {state.environments
                    .filter((entry) => entry.id !== sourceEnvId)
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                </select>
              </div>
            </section>

            <section className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Select documents</h2>
                <label className="flex items-center gap-2 text-sm">
                  Include unpublished drafts
                  <Switch
                    checked={includeUnpublished}
                    onCheckedChange={setIncludeUnpublished}
                  />
                </label>
              </div>
              {documentsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading documents…
                </p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No documents in source environment.
                </p>
              ) : (
                <ul
                  className="max-h-72 overflow-y-auto rounded border"
                  data-mdcms-promote-document-list
                >
                  {documents.map((doc) => {
                    const checked = selectedIds.includes(doc.documentId);
                    return (
                      <li
                        key={doc.documentId}
                        className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          data-mdcms-promote-document-checkbox={doc.documentId}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedIds((prev) => [
                                ...prev,
                                doc.documentId,
                              ]);
                            } else {
                              setSelectedIds((prev) =>
                                prev.filter((id) => id !== doc.documentId),
                              );
                            }
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{doc.path}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {doc.type} · {doc.locale}
                            {doc.publishedVersion === null
                              ? " · draft"
                              : ` · v${doc.publishedVersion}`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="flex items-center gap-2">
              <Button
                onClick={handlePreview}
                disabled={
                  !targetEnv ||
                  selectedIds.length === 0 ||
                  preview.status === "loading"
                }
                data-mdcms-promote-preview-button
              >
                {preview.status === "loading"
                  ? "Previewing..."
                  : "Preview promote"}
              </Button>
              <Button
                variant="default"
                disabled={
                  preview.status !== "ready" ||
                  preview.results.filter(
                    (entry) => entry.status !== "skipped_unpublished",
                  ).length === 0
                }
                onClick={() => setConfirmOpen(true)}
                data-mdcms-promote-confirm-button
              >
                Confirm & Promote
              </Button>
            </section>

            {preview.status === "error" ? (
              <section
                data-mdcms-promote-preview-error
                className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <p>{preview.message}</p>
                {preview.remapDetails ? (
                  <p className="text-xs">
                    Field{" "}
                    <span className="font-mono">
                      {preview.remapDetails.fieldPath ?? "?"}
                    </span>{" "}
                    on source{" "}
                    <span className="font-mono">
                      {preview.remapDetails.sourceDocumentId ?? "?"}
                    </span>{" "}
                    cannot be remapped to (
                    <span className="font-mono">
                      {preview.remapDetails.translationGroupId ?? "?"}
                    </span>
                    ,{" "}
                    <span className="font-mono">
                      {preview.remapDetails.locale ?? "?"}
                    </span>
                    ) in target.
                  </p>
                ) : null}
              </section>
            ) : null}

            {preview.status === "ready" ? (
              <section
                data-mdcms-promote-preview
                className="space-y-3 rounded-md border p-4"
              >
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant="default">{createRows.length} created</Badge>
                  <Badge variant="default">
                    {overwriteRows.length} overwrites
                  </Badge>
                  {skippedRows.length > 0 ? (
                    <Badge variant="outline">
                      {skippedRows.length} skipped (unpublished)
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  No merge — target content is fully replaced. Source content
                  wins. Target version history is preserved.
                </p>
                <ul className="space-y-1 text-xs">
                  {preview.results.map((entry) => (
                    <li
                      key={entry.sourceDocumentId}
                      className="flex justify-between"
                      data-mdcms-promote-preview-row={entry.sourceDocumentId}
                    >
                      <span className="font-mono">
                        {entry.path} · {entry.locale}
                      </span>
                      <span>
                        {entry.status === "overwrote"
                          ? "→ overwrote target"
                          : entry.status === "created"
                            ? "→ create new target"
                            : "skipped (unpublished)"}
                        {entry.remappedReferences > 0
                          ? ` · ${entry.remappedReferences} ref(s) remapped`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {executeResult ? (
              <section
                data-mdcms-promote-result
                className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"
              >
                Promoted {executeResult.promoted.length} document(s) to{" "}
                <span className="font-mono">{targetEnv?.name ?? ""}</span>.
              </section>
            ) : null}

            {executeError ? (
              <section
                data-mdcms-promote-execute-error
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {executeError}
              </section>
            ) : null}
          </div>
        )}

        <Dialog
          open={confirmOpen && preview.status === "ready"}
          onOpenChange={(open) => setConfirmOpen(open)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm promote</DialogTitle>
              <DialogDescription>
                The following target documents will be replaced. This is an
                explicit overwrite — target content is replaced and history is
                preserved in the target environment, but no merge happens.
              </DialogDescription>
            </DialogHeader>
            <div
              className="max-h-72 space-y-1 overflow-y-auto rounded border p-3 text-sm"
              data-mdcms-promote-confirm-list
            >
              {overwriteRows.length === 0 && createRows.length === 0 ? (
                <p className="text-muted-foreground">
                  Nothing to promote (everything was skipped).
                </p>
              ) : (
                <>
                  {overwriteRows.length > 0 ? (
                    <>
                      <p className="font-medium text-destructive">
                        Overwrite ({overwriteRows.length})
                      </p>
                      <ul className="space-y-1">
                        {overwriteRows.map((entry) => (
                          <li
                            key={entry.sourceDocumentId}
                            className="font-mono text-xs"
                          >
                            {entry.path} · {entry.locale}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {createRows.length > 0 ? (
                    <>
                      <p className="font-medium">
                        Create ({createRows.length})
                      </p>
                      <ul className="space-y-1">
                        {createRows.map((entry) => (
                          <li
                            key={entry.sourceDocumentId}
                            className="font-mono text-xs"
                          >
                            {entry.path} · {entry.locale}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
            </div>
            {executeError ? (
              <p className="text-sm text-destructive">{executeError}</p>
            ) : null}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={executing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmExecute}
                disabled={executing}
                data-mdcms-promote-execute-button
              >
                {executing
                  ? "Promoting..."
                  : `Promote ${overwriteRows.length + createRows.length} document(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
