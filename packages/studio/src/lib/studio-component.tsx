import { Button } from "./ui/button.js";
import { roundTripMarkdown } from "./markdown-pipeline.js";

export type StudioConfig = {
  project: string;
  serverUrl: string;
  environment: string;
};

export type StudioRole = "owner" | "admin" | "editor" | "viewer";

export type StudioShellState =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "forbidden";

export type StudioProps = {
  config: StudioConfig;
  path?: string | string[];
  state?: StudioShellState;
  errorMessage?: string;
  role?: StudioRole;
  documentShell?: {
    state: "loading" | "ready" | "error";
    type: string;
    documentId: string;
    locale: string;
    data?: {
      path: string;
      body: string;
      updatedAt: string;
    };
    errorMessage?: string;
  };
};

export type StudioInternalRoute =
  | "dashboard"
  | "content"
  | "trash"
  | "environments"
  | "users"
  | "settings";

export type ContentNavigationMode = "schema" | "folder";

const ROUTE_LABELS: Record<StudioInternalRoute, string> = {
  dashboard: "Dashboard",
  content: "Content",
  trash: "Trash",
  environments: "Environments",
  users: "Users",
  settings: "Settings",
};

function normalizeRoutePath(path: StudioProps["path"]): string[] {
  if (!path) {
    return [];
  }

  if (Array.isArray(path)) {
    return path.map((segment) => segment.trim()).filter(Boolean);
  }

  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolveInternalRoute(path: StudioProps["path"]): {
  route: StudioInternalRoute;
  subPath: string[];
  isUnknown: boolean;
  contentViewMode: ContentNavigationMode;
} {
  const [first, ...rest] = normalizeRoutePath(path);

  if (!first) {
    return {
      route: "dashboard",
      subPath: [],
      isUnknown: false,
      contentViewMode: "schema",
    };
  }

  if (first === "content") {
    const [modeMarker, ...modeSubPath] = rest;
    return {
      route: "content",
      subPath: modeMarker === "by-path" ? modeSubPath : rest,
      isUnknown: false,
      contentViewMode: modeMarker === "by-path" ? "folder" : "schema",
    };
  }

  if (
    first === "dashboard" ||
    first === "trash" ||
    first === "environments" ||
    first === "users" ||
    first === "settings"
  ) {
    return {
      route: first,
      subPath: rest,
      isUnknown: false,
      contentViewMode: "schema",
    };
  }

  return {
    route: "dashboard",
    subPath: [],
    isUnknown: true,
    contentViewMode: "schema",
  };
}

/**
 * Studio is the host-embedded entrypoint for MDCMS Studio.
 * CMS-47 adds Tailwind/shadcn-style shell composition, deterministic
 * state handling, and role-aware interaction constraints.
 */
export function Studio({
  config,
  path,
  state = "ready",
  errorMessage,
  role = "viewer",
  documentShell,
}: StudioProps) {
  const canWrite = role === "owner" || role === "admin" || role === "editor";
  const canPublish = role === "owner" || role === "admin" || role === "editor";
  const hasAdminAccess = role === "owner" || role === "admin";
  const isViewerSafe = !canWrite;
  const resolvedRoute = resolveInternalRoute(path);
  const routeRequiresAdmin =
    resolvedRoute.route === "users" || resolvedRoute.route === "settings";
  const effectiveState: StudioShellState =
    state === "ready" && routeRequiresAdmin && !hasAdminAccess
      ? "forbidden"
      : state === "ready" && resolvedRoute.isUnknown
        ? "empty"
        : state;

  const subRouteLabel =
    resolvedRoute.route === "content" && resolvedRoute.subPath.length > 0
      ? `/content/${resolvedRoute.subPath.join("/")}`
      : null;
  const isDocumentShellRoute =
    resolvedRoute.route === "content" && resolvedRoute.subPath.length >= 2;
  let documentRoundTripBody: string | undefined;

  if (documentShell?.state === "ready" && documentShell.data) {
    try {
      documentRoundTripBody = roundTripMarkdown(
        documentShell.data.body,
      ).markdown;
    } catch {
      documentRoundTripBody = documentShell.data.body;
    }
  }
  const statusMessage =
    effectiveState === "loading"
      ? "Loading Studio..."
      : effectiveState === "empty"
        ? "No content found for this route."
        : effectiveState === "forbidden"
          ? "You do not have permission to access Studio."
          : effectiveState === "error"
            ? errorMessage?.trim() || "Failed to initialize Studio."
            : "Studio shell ready.";

  return (
    <section
      data-testid="mdcms-studio-root"
      data-mdcms-project={config.project}
      data-mdcms-server-url={config.serverUrl}
      data-mdcms-state={effectiveState}
      data-mdcms-brand="MDCMS"
      data-mdcms-role={role}
      data-mdcms-route={resolvedRoute.route}
      data-mdcms-content-view={resolvedRoute.contentViewMode}
      data-mdcms-can-write={canWrite ? "true" : "false"}
      data-mdcms-can-publish={canPublish ? "true" : "false"}
      className="mx-auto w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            MDCMS
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Studio</h1>
          <p className="text-sm text-slate-600">{statusMessage}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {role}
        </span>
      </header>

      {effectiveState === "loading" ? (
        <div className="space-y-3" aria-live="polite">
          <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
          <div className="h-20 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ) : effectiveState === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {statusMessage}
        </div>
      ) : effectiveState === "forbidden" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {statusMessage}
        </div>
      ) : effectiveState === "empty" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {statusMessage}
        </div>
      ) : (
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-2" aria-label="Studio routes">
            {(
              [
                "dashboard",
                "content",
                "trash",
                "environments",
                "users",
                "settings",
              ] as const
            ).map((route) => (
              <span
                key={route}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                data-mdcms-nav-route={route}
                data-mdcms-nav-active={
                  route === resolvedRoute.route ? "true" : "false"
                }
              >
                {ROUTE_LABELS[route]}
              </span>
            ))}
          </nav>

          {resolvedRoute.route === "content" ? (
            <div
              className="flex flex-wrap items-center gap-2"
              data-mdcms-content-view-toggle="true"
            >
              <a
                href="/admin/content"
                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700"
                data-mdcms-content-view-option="schema"
                data-mdcms-content-view-active={
                  resolvedRoute.contentViewMode === "schema" ? "true" : "false"
                }
              >
                Schema View
              </a>
              <a
                href="/admin/content/by-path"
                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700"
                data-mdcms-content-view-option="folder"
                data-mdcms-content-view-active={
                  resolvedRoute.contentViewMode === "folder" ? "true" : "false"
                }
              >
                Folder View
              </a>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div>
              Connected to <span className="font-mono">{config.serverUrl}</span>{" "}
              for <span className="font-medium">{config.project}</span>/
              <span className="font-medium">{config.environment}</span>.
            </div>
            <div className="mt-1">
              Active route: <strong>{ROUTE_LABELS[resolvedRoute.route]}</strong>
              {subRouteLabel ? (
                <>
                  {" "}
                  <span className="text-slate-500">({subRouteLabel})</span>
                </>
              ) : null}
            </div>
            {resolvedRoute.route === "content" ? (
              <div className="mt-1 text-slate-600">
                Browsing mode:{" "}
                <strong>
                  {resolvedRoute.contentViewMode === "schema"
                    ? "Schema-first"
                    : "Folder-path"}
                </strong>
              </div>
            ) : null}
          </div>

          {isDocumentShellRoute ? (
            <div
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800"
              data-mdcms-document-shell="true"
              data-mdcms-editor-engine="tiptap-markdown"
            >
              <div className="mb-2 text-xs text-slate-500">
                Document Shell Route
              </div>
              <div>
                Type: <strong>{resolvedRoute.subPath[0]}</strong>
              </div>
              <div>
                Document ID: <code>{resolvedRoute.subPath[1]}</code>
              </div>
              <div>
                Locale: <strong>{documentShell?.locale ?? "en"}</strong>
              </div>
              {documentShell?.state === "loading" ? (
                <div className="mt-2 text-slate-600">Loading document...</div>
              ) : documentShell?.state === "error" ? (
                <div className="mt-2 text-red-700">
                  {documentShell.errorMessage ?? "Failed to load document."}
                </div>
              ) : documentShell?.data ? (
                <div className="mt-2 space-y-1">
                  <div>
                    Path: <code>{documentShell.data.path}</code>
                  </div>
                  <div>
                    Updated:{" "}
                    <span className="font-mono">
                      {documentShell.data.updatedAt}
                    </span>
                  </div>
                  <pre className="max-h-44 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                    {documentRoundTripBody}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canWrite}
              data-mdcms-action="create-content"
            >
              New Document
            </Button>
            <Button
              type="button"
              disabled={!canPublish}
              data-mdcms-action="publish-content"
              variant="outline"
            >
              Publish
            </Button>
          </div>
        </div>
      )}

      <small
        data-mdcms-capability="viewer-safe"
        className="mt-6 block text-xs text-slate-500"
      >
        {isViewerSafe
          ? "Viewer-safe mode: mutating actions remain disabled."
          : "Role permits content mutations in this shell state."}
      </small>
    </section>
  );
}
