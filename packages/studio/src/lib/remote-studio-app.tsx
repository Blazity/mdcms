import { useEffect, useState, type ReactNode } from "react";

import type { StudioMountContext } from "@mdcms/shared";

import {
  buildStudioRuntimeRegistry,
  type StudioRouteDefinition,
} from "./runtime-registry.js";

type MatchableRoute = {
  id: string;
  path: string;
};

const DEFAULT_RUNTIME_REGISTRY = buildStudioRuntimeRegistry({
  routes: [
    {
      id: "dashboard",
      path: "/",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-600">
            Remote Studio runtime is mounted and owns the application shell.
          </p>
        </div>
      ),
    },
    {
      id: "content.index",
      path: "/content",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Content</h2>
          <p className="text-sm text-slate-600">
            Schema-first content navigation lives inside the remote runtime.
          </p>
        </div>
      ),
    },
    {
      id: "content.type",
      path: "/content/:type",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Content Type</h2>
          <p className="text-sm text-slate-600">
            Type-specific list views are resolved by the remote runtime router.
          </p>
        </div>
      ),
    },
    {
      id: "content.document",
      path: "/content/:type/:documentId",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">
            Document Editor
          </h2>
          <p className="text-sm text-slate-600">
            Editor flows and field kind handling run inside the remote app.
          </p>
        </div>
      ),
    },
    {
      id: "environments",
      path: "/environments",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Environments</h2>
          <p className="text-sm text-slate-600">
            Environment management is rendered by the remote runtime.
          </p>
        </div>
      ),
    },
    {
      id: "users",
      path: "/users",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Users</h2>
          <p className="text-sm text-slate-600">
            User management is a remote-runtime route.
          </p>
        </div>
      ),
    },
    {
      id: "settings",
      path: "/settings",
      render: () => (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">Settings</p>
            <div className="mt-3 space-y-2">
              {renderSlot("settings.sidebar")}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-xl font-semibold text-slate-900">General</h2>
            <div className="mt-3 space-y-3">
              {renderSettingsPanel("general")}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "trash",
      path: "/trash",
      render: () => (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Trash</h2>
          <p className="text-sm text-slate-600">
            Deleted content recovery is remote-owned.
          </p>
        </div>
      ),
    },
  ],
  navItems: [
    { id: "dashboard", label: "Dashboard", to: "/", order: 10 },
    { id: "content", label: "Content", to: "/content", order: 20 },
    {
      id: "environments",
      label: "Environments",
      to: "/environments",
      order: 30,
    },
    { id: "users", label: "Users", to: "/users", order: 40 },
    { id: "settings", label: "Settings", to: "/settings", order: 50 },
    { id: "trash", label: "Trash", to: "/trash", order: 60 },
  ],
  slotWidgets: [
    {
      id: "dashboard.summary",
      slotId: "dashboard.main",
      priority: 20,
      render: () => (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Runtime widgets are rendered from the remote composition registry.
        </div>
      ),
    },
    {
      id: "content.toolbar.search",
      slotId: "content.list.toolbar",
      priority: 20,
      render: () => (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Search
        </div>
      ),
    },
    {
      id: "settings.general-link",
      slotId: "settings.sidebar",
      priority: 10,
      render: () => (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          General
        </div>
      ),
    },
  ],
  fieldKinds: [
    {
      kind: "json",
      render: () => (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          JSON field editor fallback
        </div>
      ),
    },
  ],
  editorNodes: [
    {
      id: "mdx.component",
      render: () => (
        <div className="text-sm text-slate-600">MDX component preview node</div>
      ),
    },
  ],
  actionOverrides: [
    {
      actionId: "content.publish",
      render: () => (
        <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
          Publish
        </button>
      ),
    },
  ],
  settingsPanels: [
    {
      id: "general",
      title: "General",
      render: () => (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          General settings panel rendered by the remote runtime.
        </div>
      ),
    },
  ],
});

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeInternalPath(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function stripStudioBasePath(
  pathname: string,
  basePath: string,
): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPathname = normalizeInternalPath(pathname);

  if (normalizedBasePath.length === 0) {
    return normalizedPathname;
  }

  if (normalizedPathname === normalizedBasePath) {
    return "/";
  }

  const prefixedBasePath = `${normalizedBasePath}/`;

  if (!normalizedPathname.startsWith(prefixedBasePath)) {
    return "/";
  }

  return normalizeInternalPath(
    normalizedPathname.slice(normalizedBasePath.length),
  );
}

function getRouteSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function matchStudioRoute<T extends MatchableRoute>(
  pathname: string,
  routes: readonly T[],
): T | undefined {
  const targetSegments = getRouteSegments(normalizeInternalPath(pathname));

  return routes.find((route) => {
    const routeSegments = getRouteSegments(route.path);

    if (routeSegments.length !== targetSegments.length) {
      return false;
    }

    return routeSegments.every((segment, index) => {
      if (segment.startsWith(":")) {
        return true;
      }

      return segment === targetSegments[index];
    });
  });
}

function joinStudioPath(basePath: string, targetPath: string): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedTargetPath = normalizeInternalPath(targetPath);

  if (normalizedBasePath.length === 0) {
    return normalizedTargetPath;
  }

  if (normalizedTargetPath === "/") {
    return normalizedBasePath;
  }

  return `${normalizedBasePath}${normalizedTargetPath}`;
}

function renderSlot(slotId: string): ReactNode {
  const widgets = DEFAULT_RUNTIME_REGISTRY.slotWidgetsBySlot.get(slotId) ?? [];

  return widgets.map((widget) => (
    <div key={widget.id} data-mdcms-slot-widget={widget.id}>
      {widget.render() as ReactNode}
    </div>
  ));
}

function renderSettingsPanel(panelId: string): ReactNode {
  const panel = DEFAULT_RUNTIME_REGISTRY.settingsPanels.get(panelId);

  if (!panel) {
    return null;
  }

  return (
    <div data-mdcms-settings-panel={panel.id}>
      {panel.render() as ReactNode}
    </div>
  );
}

function renderRouteContent(
  route: StudioRouteDefinition | undefined,
  internalPath: string,
): ReactNode {
  if (!route) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Unknown Studio route: {internalPath}
      </div>
    );
  }

  return route.render() as ReactNode;
}

export function RemoteStudioApp({ context }: { context: StudioMountContext }) {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? context.basePath : window.location.pathname,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onPopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const internalPath = stripStudioBasePath(pathname, context.basePath);
  const activeRoute =
    matchStudioRoute(internalPath, DEFAULT_RUNTIME_REGISTRY.routes) ??
    DEFAULT_RUNTIME_REGISTRY.routes[0];

  return (
    <section
      data-testid="mdcms-remote-studio-root"
      data-mdcms-base-path={context.basePath}
      data-mdcms-internal-path={internalPath}
      data-mdcms-active-route={activeRoute?.id ?? "unknown"}
      className="min-h-[20rem] space-y-6"
    >
      <header className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            MDCMS Remote Runtime
          </p>
          <h1 className="text-3xl font-semibold text-slate-950">Studio</h1>
          <p className="text-sm text-slate-600">
            Routing and UI state are now remote-owned under {context.basePath}.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Studio navigation">
          {DEFAULT_RUNTIME_REGISTRY.navItems.map((item) => {
            const href = joinStudioPath(context.basePath, item.to);
            const isActive = item.id === activeRoute?.id;

            return (
              <button
                key={item.id}
                type="button"
                data-mdcms-nav-item={item.id}
                data-mdcms-nav-active={isActive ? "true" : "false"}
                className={
                  isActive
                    ? "rounded-full bg-slate-900 px-4 py-2 text-sm text-white"
                    : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                }
                onClick={() => {
                  if (typeof window === "undefined") {
                    return;
                  }

                  window.history.pushState(null, "", href);
                  setPathname(window.location.pathname);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {activeRoute?.id === "dashboard" ? (
        <div className="space-y-4">{renderSlot("dashboard.main")}</div>
      ) : null}

      {activeRoute?.id === "content.index" ? (
        <div className="flex flex-wrap gap-3">
          {renderSlot("content.list.toolbar")}
        </div>
      ) : null}

      <main>{renderRouteContent(activeRoute, internalPath)}</main>
    </section>
  );
}
