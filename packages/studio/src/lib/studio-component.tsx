import { Button } from "./ui/button.js";

export type StudioConfig = {
  project: string;
  serverUrl: string;
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
  state?: StudioShellState;
  errorMessage?: string;
  role?: StudioRole;
};

/**
 * Studio is the host-embedded entrypoint for MDCMS Studio.
 * CMS-47 adds Tailwind/shadcn-style shell composition, deterministic
 * state handling, and role-aware interaction constraints.
 */
export function Studio({
  config,
  state = "ready",
  errorMessage,
  role = "viewer",
}: StudioProps) {
  const canWrite = role === "owner" || role === "admin" || role === "editor";
  const canPublish = role === "owner" || role === "admin" || role === "editor";
  const isViewerSafe = !canWrite;
  const statusMessage =
    state === "loading"
      ? "Loading Studio..."
      : state === "empty"
        ? "No content found for this route."
        : state === "forbidden"
          ? "You do not have permission to access Studio."
          : state === "error"
            ? errorMessage?.trim() || "Failed to initialize Studio."
            : "Studio shell ready.";

  return (
    <section
      data-testid="mdcms-studio-root"
      data-mdcms-project={config.project}
      data-mdcms-server-url={config.serverUrl}
      data-mdcms-state={state}
      data-mdcms-brand="MDCMS"
      data-mdcms-role={role}
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

      {state === "loading" ? (
        <div className="space-y-3" aria-live="polite">
          <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
          <div className="h-20 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ) : state === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {statusMessage}
        </div>
      ) : state === "forbidden" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {statusMessage}
        </div>
      ) : state === "empty" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {statusMessage}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Connected to <span className="font-mono">{config.serverUrl}</span>{" "}
            for <span className="font-medium">{config.project}</span>.
          </div>
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
