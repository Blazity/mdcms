"use client";

import { useEffect, useState } from "react";

import type {
  EnvironmentDefinitionsMeta,
  EnvironmentSummary,
} from "@mdcms/shared";
import {
  ArrowRightLeft,
  Clock,
  GitBranch,
  MoreHorizontal,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import { Input } from "../../components/ui/input.js";
import { Label } from "../../components/ui/label.js";
import { cn } from "../../lib/utils.js";

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
      definitionsMeta: EnvironmentDefinitionsMeta;
    };

type EnvironmentManagementPageViewProps = {
  state: EnvironmentManagementState;
  activeEnvironment?: string | null;
  createName?: string;
  createError?: string | null;
  actionError?: string | null;
  deleteError?: string | null;
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
  onSwitchEnvironment?: (environment: string) => void;
  onRetry?: () => void;
};

const CREATE_SYNC_REQUIRED_MESSAGE =
  "Environment management requires a successful cms schema sync from the host app repo before new environments can be created.";

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
  const normalizeMessage = (message: string): string =>
    message === "Server config is required to manage environments."
      ? "Environment management is unavailable because the connected backend could not load mdcms.config.ts."
      : message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return normalizeMessage(error.message);
  }

  return normalizeMessage(fallback);
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

export function resolveDeleteFailureState(error: unknown): {
  message: string;
  shouldCloseDialog: boolean;
  shouldReload: boolean;
  renderInDialog: boolean;
} {
  const message = readRuntimeErrorMessage(
    error,
    "Environment deletion failed.",
  );
  const statusCode = readRuntimeErrorStatus(error);

  return {
    message,
    shouldCloseDialog: statusCode === 404,
    shouldReload: statusCode === 404,
    renderInDialog: statusCode !== 404,
  };
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
}

const MONTH_ABBREV = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDisplayDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${MONTH_ABBREV[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
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
  activeEnvironment = null,
  createName = "",
  createError = null,
  actionError = null,
  deleteError = null,
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
  onSwitchEnvironment,
  onRetry,
}: EnvironmentManagementPageViewProps) {
  const canManage = state.status === "ready";
  const canCreate =
    state.status === "ready" &&
    state.definitionsMeta.definitionsStatus === "ready";

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
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    disabled={!canCreate}
                  >
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
          <section
            data-mdcms-page-action-error
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {actionError}
          </section>
        ) : null}

        {state.status === "ready" &&
        state.definitionsMeta.definitionsStatus === "missing" ? (
          <section
            data-mdcms-environments-create-gated
            className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
          >
            {CREATE_SYNC_REQUIRED_MESSAGE}
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
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {state.environments.map((environment) => (
              <Card
                key={environment.id}
                data-mdcms-environment-row={environment.name}
                className={cn(
                  "flex flex-col",
                  environment.isDefault && "border-primary/40 shadow-md",
                  activeEnvironment === environment.name &&
                    "ring-2 ring-primary/50",
                )}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        environment.isDefault
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {environment.isDefault ? (
                        <Shield className="h-5 w-5" />
                      ) : (
                        <GitBranch className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <span className="truncate">{environment.name}</span>
                        {environment.isDefault ? (
                          <Badge variant="secondary">Default</Badge>
                        ) : null}
                        {activeEnvironment === environment.name ? (
                          <Badge variant="outline">Active</Badge>
                        ) : null}
                      </CardTitle>
                      <CardDescription>
                        {environment.extends
                          ? `Extends ${environment.extends}`
                          : "No parent environment"}
                      </CardDescription>
                    </div>
                    {!environment.isDefault ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${environment.name}`}
                            data-mdcms-environment-actions={environment.name}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">
                              Delete {environment.name}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            disabled={pendingDeleteId === environment.id}
                            onClick={() => onRequestDelete?.(environment)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {pendingDeleteId === environment.id
                              ? `Deleting ${environment.name}...`
                              : `Delete ${environment.name}`}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <time dateTime={formatCreatedAt(environment.createdAt)}>
                      Created {formatDisplayDate(environment.createdAt)}
                    </time>
                  </div>
                  {activeEnvironment !== environment.name ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => onSwitchEnvironment?.(environment.name)}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Switch to {environment.name}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
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
            {deleteError ? (
              <p data-mdcms-delete-error className="text-sm text-destructive">
                {deleteError}
              </p>
            ) : null}
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
  const { project, environment, setEnvironment, apiBaseUrl, auth } =
    useStudioMountInfo();
  const sessionState = useStudioSession();
  const [state, setState] = useState<EnvironmentManagementState>(() =>
    project ? createLoadingState(project) : createMissingRouteState(),
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
      .then((result) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "ready",
          project,
          environments: sortEnvironments(result.data),
          definitionsMeta: result.meta,
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

    if (
      state.status !== "ready" ||
      state.definitionsMeta.definitionsStatus !== "ready"
    ) {
      setCreateError(CREATE_SYNC_REQUIRED_MESSAGE);
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
    setDeleteError(null);

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
      setDeleteError(null);
      setDeleteTarget(null);
      setReloadVersion((current) => current + 1);
    } catch (error) {
      const failure = resolveDeleteFailureState(error);

      setActionError(failure.renderInDialog ? null : failure.message);
      setDeleteError(failure.renderInDialog ? failure.message : null);

      if (failure.shouldCloseDialog) {
        setDeleteTarget(null);
      }

      if (failure.shouldReload) {
        setReloadVersion((current) => current + 1);
      }
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <EnvironmentManagementPageView
      state={state}
      activeEnvironment={environment}
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
          setDeleteError(null);
          setDeleteTarget(null);
        }
      }}
      onRequestDelete={(environment) => {
        setActionError(null);
        setDeleteError(null);
        setDeleteTarget(environment);
      }}
      onDeleteConfirm={handleDeleteConfirm}
      deleteError={deleteError}
      onSwitchEnvironment={setEnvironment}
      onRetry={() => {
        setActionError(null);
        setReloadVersion((current) => current + 1);
      }}
    />
  );
}
