"use client";

import { useEffect, useState } from "react";

import type { EnvironmentSummary } from "@mdcms/shared";
import { Plus, Trash2 } from "lucide-react";

import { createStudioEnvironmentApi } from "../../../environment-api.js";
import { useStudioSession } from "./session-context.js";
import { useStudioMountInfo } from "./mount-info-context.js";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
} from "../../components/layout/page-header.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog.js";
import { Input } from "../../components/ui/input.js";
import { Label } from "../../components/ui/label.js";

export type EnvironmentManagementState =
  | {
      status: "loading";
      project: string;
      message: string;
    }
  | {
      status: "forbidden";
      project: string;
      message: string;
    }
  | {
      status: "error";
      project: string;
      message: string;
    }
  | {
      status: "ready";
      project: string;
      environments: EnvironmentSummary[];
    };

type EnvironmentManagementPageViewProps = {
  state: EnvironmentManagementState;
  createName?: string;
  createError?: string | null;
  actionError?: string | null;
  pendingCreate?: boolean;
  pendingDeleteId?: string | null;
  deleteTarget?: EnvironmentSummary | null;
  isCreateDialogOpen?: boolean;
  onCreateDialogChange?: (open: boolean) => void;
  onCreateNameChange?: (value: string) => void;
  onCreateSubmit?: () => void;
  onDeleteDialogChange?: (open: boolean) => void;
  onRequestDelete?: (environment: EnvironmentSummary) => void;
  onDeleteConfirm?: () => void;
  onRetry?: () => void;
};

function createLoadingState(project: string): EnvironmentManagementState {
  return {
    status: "loading",
    project,
    message: "Loading environments.",
  };
}

function createMissingRouteState(): EnvironmentManagementState {
  return {
    status: "error",
    project: "unknown",
    message:
      "Environment management requires an active project and environment.",
  };
}

function isEnvironmentSummary(value: unknown): value is EnvironmentSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

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
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
}

function sortEnvironments(
  environments: readonly EnvironmentSummary[],
): EnvironmentSummary[] {
  return [...environments].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function renderRetryButton(onRetry?: () => void) {
  if (!onRetry) {
    return null;
  }

  return (
    <Button variant="outline" onClick={onRetry}>
      Retry
    </Button>
  );
}

export function EnvironmentManagementPageView({
  state,
  createName = "",
  createError = null,
  actionError = null,
  pendingCreate = false,
  pendingDeleteId = null,
  deleteTarget = null,
  isCreateDialogOpen = false,
  onCreateDialogChange,
  onCreateNameChange,
  onCreateSubmit,
  onDeleteDialogChange,
  onRequestDelete,
  onDeleteConfirm,
  onRetry,
}: EnvironmentManagementPageViewProps) {
  const canManage = state.status === "ready";

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={[{ label: "Environments" }]} />
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Environments
            </h1>
            <PageHeaderDescription>
              Manage project environments for {state.project}.
            </PageHeaderDescription>
          </div>
          {canManage ? (
            <PageHeaderActions>
              <Dialog
                open={isCreateDialogOpen}
                onOpenChange={onCreateDialogChange}
              >
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto" type="button">
                    <Plus className="mr-2 h-4 w-4" />
                    New Environment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Environment</DialogTitle>
                    <DialogDescription>
                      Create a new environment for this project.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="environment-name">Name</Label>
                      <Input
                        id="environment-name"
                        placeholder="e.g. staging"
                        value={createName}
                        onChange={(event) =>
                          onCreateNameChange?.(event.target.value)
                        }
                      />
                    </div>
                    {createError ? (
                      <p className="text-sm text-destructive">{createError}</p>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => onCreateDialogChange?.(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={pendingCreate}
                      onClick={() => onCreateSubmit?.()}
                    >
                      {pendingCreate ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </PageHeaderActions>
          ) : null}
        </div>

        {actionError ? (
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {actionError}
          </section>
        ) : null}

        {state.status === "loading" ? (
          <section
            data-mdcms-environments-page-state="loading"
            className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
          >
            {state.message}
          </section>
        ) : state.status === "forbidden" ? (
          <section
            data-mdcms-environments-page-state="forbidden"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="secondary">Forbidden</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">{state.project}</p>
          </section>
        ) : state.status === "error" ? (
          <section
            data-mdcms-environments-page-state="error"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="destructive">Error</Badge>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">{state.project}</p>
            {renderRetryButton(onRetry)}
          </section>
        ) : state.environments.length === 0 ? (
          <section
            data-mdcms-environments-page-state="empty"
            className="space-y-3 rounded-lg border border-dashed p-6"
          >
            <Badge variant="outline">Empty</Badge>
            <p className="text-sm text-muted-foreground">
              No environments were returned for this project yet.
            </p>
            <p className="text-xs text-muted-foreground">{state.project}</p>
          </section>
        ) : (
          <section
            data-mdcms-environments-page-state="ready"
            className="grid gap-4"
          >
            {state.environments.map((environment) => (
              <article
                key={environment.id}
                data-mdcms-environment-row={environment.name}
                className="space-y-4 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight">
                        {environment.name}
                      </h2>
                      {environment.isDefault ? (
                        <Badge variant="secondary">Default</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {environment.extends
                        ? `Extends ${environment.extends}`
                        : "No parent environment"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatCreatedAt(environment.createdAt)}
                    </p>
                  </div>
                  {!environment.isDefault ? (
                    <Button
                      variant="outline"
                      disabled={pendingDeleteId === environment.id}
                      onClick={() => onRequestDelete?.(environment)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {pendingDeleteId === environment.id
                        ? `Deleting ${environment.name}...`
                        : `Delete ${environment.name}`}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        )}

        <Dialog
          open={deleteTarget !== null}
          onOpenChange={(open) => onDeleteDialogChange?.(open)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Environment</DialogTitle>
              <DialogDescription>
                {isEnvironmentSummary(deleteTarget)
                  ? `Delete ${deleteTarget.name} from ${state.project}?`
                  : "Delete this environment?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onDeleteDialogChange?.(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!deleteTarget || pendingDeleteId === deleteTarget.id}
                onClick={() => onDeleteConfirm?.()}
              >
                {deleteTarget && pendingDeleteId === deleteTarget.id
                  ? `Deleting ${deleteTarget.name}...`
                  : deleteTarget
                    ? `Delete ${deleteTarget.name}`
                    : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function EnvironmentsPage() {
  const { project, environment, apiBaseUrl, auth } = useStudioMountInfo();
  const sessionState = useStudioSession();
  const [state, setState] = useState<EnvironmentManagementState>(() =>
    project ? createLoadingState(project) : createMissingRouteState(),
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnvironmentSummary | null>(
    null,
  );

  useEffect(() => {
    if (!project || !environment) {
      setState(createMissingRouteState());
      return;
    }

    let cancelled = false;
    setState(createLoadingState(project));

    const environmentApi = createStudioEnvironmentApi(
      {
        project,
        environment,
        serverUrl: apiBaseUrl,
      },
      { auth },
    );

    void environmentApi
      .list()
      .then((environments) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "ready",
          project,
          environments: sortEnvironments(environments),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        const message = readRuntimeErrorMessage(
          error,
          "Environment request failed.",
        );
        const statusCode = readRuntimeErrorStatus(error);

        setState(
          statusCode === 401 || statusCode === 403
            ? {
                status: "forbidden",
                project,
                message,
              }
            : {
                status: "error",
                project,
                message,
              },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, auth.mode, auth.token, environment, project, reloadVersion]);

  async function handleCreateSubmit() {
    if (!project || !environment) {
      setCreateError("Environment management requires an active project.");
      return;
    }

    if (sessionState.status !== "authenticated") {
      setCreateError("Session could not be verified.");
      return;
    }

    setPendingCreate(true);
    setCreateError(null);
    setActionError(null);

    try {
      const environmentApi = createStudioEnvironmentApi(
        {
          project,
          environment,
          serverUrl: apiBaseUrl,
        },
        {
          auth,
          csrfToken: sessionState.csrfToken,
        },
      );

      await environmentApi.create({ name: createName });
      setCreateName("");
      setIsCreateDialogOpen(false);
      setReloadVersion((current) => current + 1);
    } catch (error) {
      setCreateError(
        readRuntimeErrorMessage(error, "Environment creation failed."),
      );
    } finally {
      setPendingCreate(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!project || !environment || !deleteTarget) {
      setActionError("Environment deletion requires an active target.");
      return;
    }

    if (sessionState.status !== "authenticated") {
      setActionError("Session could not be verified.");
      return;
    }

    setPendingDeleteId(deleteTarget.id);
    setActionError(null);

    try {
      const environmentApi = createStudioEnvironmentApi(
        {
          project,
          environment,
          serverUrl: apiBaseUrl,
        },
        {
          auth,
          csrfToken: sessionState.csrfToken,
        },
      );

      await environmentApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      setReloadVersion((current) => current + 1);
    } catch (error) {
      setActionError(
        readRuntimeErrorMessage(error, "Environment deletion failed."),
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <EnvironmentManagementPageView
      state={state}
      createName={createName}
      createError={createError}
      actionError={actionError}
      pendingCreate={pendingCreate}
      pendingDeleteId={pendingDeleteId}
      deleteTarget={deleteTarget}
      isCreateDialogOpen={isCreateDialogOpen}
      onCreateDialogChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) {
          setCreateError(null);
          setCreateName("");
        }
      }}
      onCreateNameChange={setCreateName}
      onCreateSubmit={handleCreateSubmit}
      onDeleteDialogChange={(open) => {
        if (!open) {
          setDeleteTarget(null);
        }
      }}
      onRequestDelete={(environment) => {
        setActionError(null);
        setDeleteTarget(environment);
      }}
      onDeleteConfirm={handleDeleteConfirm}
      onRetry={() => {
        setActionError(null);
        setReloadVersion((current) => current + 1);
      }}
    />
  );
}
