"use client";

import { useState, useEffect, useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { StudioMountContext, EnvironmentSummary } from "@mdcms/shared";

import { createStudioQueryClient } from "../../query-client.js";
import { ToastProvider } from "../../components/toast.js";

import { createStudioCurrentPrincipalCapabilitiesApi } from "../../../current-principal-capabilities-api.js";
import { createStudioSessionApi } from "../../../session-api.js";
import { createStudioEnvironmentApi } from "../../../environment-api.js";
import { AdminCapabilitiesProvider } from "./capabilities-context.js";
import {
  StudioSessionProvider,
  type StudioSessionState,
} from "./session-context.js";
import { StudioMountInfoProvider } from "./mount-info-context.js";
import { usePathname, useRouter } from "../../navigation.js";
import { AppSidebar } from "../../components/layout/app-sidebar.js";
import { cn } from "../../lib/utils.js";

type AdminLayoutCapabilitiesLoadInput = {
  config: {
    project: string;
    environment: string;
    serverUrl: string;
  };
  auth: StudioMountContext["auth"];
};

type AdminLayoutSessionLoadInput = {
  config: { serverUrl: string };
  auth: StudioMountContext["auth"];
};

export function createAdminLayoutCapabilitiesLoadInput(
  context: StudioMountContext,
): AdminLayoutCapabilitiesLoadInput | null {
  const route = context.documentRoute;

  if (!route) {
    return null;
  }

  return {
    config: {
      project: route.project,
      environment: route.initialEnvironment,
      serverUrl: context.apiBaseUrl,
    },
    auth: context.auth,
  };
}

export function createAdminLayoutSessionLoadInput(
  context: StudioMountContext,
): AdminLayoutSessionLoadInput {
  return {
    config: { serverUrl: context.apiBaseUrl },
    auth: context.auth,
  };
}

export function createAdminLayoutTokenSessionState(
  auth: StudioMountContext["auth"],
): StudioSessionState | null {
  if (auth.mode !== "token") {
    return null;
  }

  if (!auth.token) {
    return {
      status: "token-error",
      reason: "missing",
      message:
        "No bearer token was provided. The host application must supply a token when using auth.mode = \"token\".",
    };
  }

  return {
    status: "authenticated",
    session: {
      id: "token-auth-session",
      userId: "token-auth-user",
      email: "API token",
      issuedAt: "",
      expiresAt: "",
    },
    csrfToken: "",
  };
}

export default function AdminLayout({
  children,
  context,
}: {
  children: React.ReactNode;
  context: StudioMountContext;
}) {
  const [queryClient] = useState(() => createStudioQueryClient());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [canReadSchema, setCanReadSchema] = useState(false);
  const [canCreateContent, setCanCreateContent] = useState(false);
  const [canPublishContent, setCanPublishContent] = useState(false);
  const [canUnpublishContent, setCanUnpublishContent] = useState(false);
  const [canDeleteContent, setCanDeleteContent] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canManageSettings, setCanManageSettings] = useState(false);
  const [activeEnvironment, setActiveEnvironmentRaw] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        const fromQuery = new URLSearchParams(window.location.search).get(
          "env",
        );
        if (fromQuery) return fromQuery;
      }
      return context.documentRoute?.initialEnvironment ?? null;
    },
  );

  const setActiveEnvironment = useCallback((env: string) => {
    setActiveEnvironmentRaw(env);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("env", env);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);
  const [sessionState, setSessionState] = useState<StudioSessionState>({
    status: "loading",
  });
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);

  // Persist sidebar state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  // Fetch capabilities
  useEffect(() => {
    const project = context.documentRoute?.project;
    const loadInput =
      project && activeEnvironment
        ? {
            config: {
              project,
              environment: activeEnvironment,
              serverUrl: context.apiBaseUrl,
            },
            auth: context.auth,
          }
        : null;

    if (!loadInput) {
      setCanReadSchema(false);
      setCanCreateContent(false);
      setCanPublishContent(false);
      setCanUnpublishContent(false);
      setCanDeleteContent(false);
      setCanManageUsers(false);
      setCanManageSettings(false);
      return;
    }

    let cancelled = false;
    const capabilitiesApi = createStudioCurrentPrincipalCapabilitiesApi(
      loadInput.config,
      { auth: loadInput.auth },
    );

    void capabilitiesApi
      .get()
      .then((response) => {
        if (!cancelled) {
          setCanReadSchema(response.capabilities.schema.read);
          setCanCreateContent(response.capabilities.content.write);
          setCanPublishContent(response.capabilities.content.publish);
          setCanUnpublishContent(response.capabilities.content.unpublish);
          setCanDeleteContent(response.capabilities.content.delete);
          setCanManageUsers(response.capabilities.users.manage);
          setCanManageSettings(response.capabilities.settings.manage);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCanReadSchema(false);
          setCanCreateContent(false);
          setCanPublishContent(false);
          setCanUnpublishContent(false);
          setCanDeleteContent(false);
          setCanManageUsers(false);
          setCanManageSettings(false);

          // In token mode, a capabilities 401/403 means the token is
          // invalid, revoked, or not allowed for this project/environment.
          // Surface a deterministic token-error instead of leaving the UI
          // in a broken empty state.
          if (context.auth.mode === "token") {
            const statusCode =
              error &&
              typeof error === "object" &&
              "statusCode" in error &&
              typeof error.statusCode === "number"
                ? error.statusCode
                : null;

            if (statusCode === 401) {
              setSessionState({
                status: "token-error",
                reason: "invalid",
                message:
                  "The bearer token is invalid, expired, or has been revoked.",
              });
            } else if (statusCode === 403) {
              setSessionState({
                status: "token-error",
                reason: "forbidden",
                message:
                  "The bearer token is not allowed for the requested project or environment.",
              });
            }
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    context.apiBaseUrl,
    context.auth.mode,
    context.auth.token,
    activeEnvironment,
    context.documentRoute?.project,
  ]);

  // Fetch session
  useEffect(() => {
    const tokenSessionState = createAdminLayoutTokenSessionState(context.auth);

    if (tokenSessionState) {
      setSessionState(tokenSessionState);
      return;
    }

    const loadInput = createAdminLayoutSessionLoadInput(context);
    let cancelled = false;

    const sessionApi = createStudioSessionApi(loadInput.config, {
      auth: loadInput.auth,
    });

    void sessionApi
      .get()
      .then((response) => {
        if (!cancelled) {
          setSessionState({
            status: "authenticated",
            session: response.session,
            csrfToken: response.csrfToken,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const isUnauthorized =
            error &&
            typeof error === "object" &&
            "statusCode" in error &&
            error.statusCode === 401;
          setSessionState(
            isUnauthorized
              ? { status: "unauthenticated" }
              : {
                  status: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Session fetch failed.",
                },
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [context.apiBaseUrl, context.auth.mode, context.auth.token]);

  // Fetch environments
  useEffect(() => {
    const project = context.documentRoute?.project;
    if (!project || !activeEnvironment) {
      setEnvironments([]);
      return;
    }

    let cancelled = false;
    const envApi = createStudioEnvironmentApi(
      {
        project,
        environment: activeEnvironment,
        serverUrl: context.apiBaseUrl,
      },
      { auth: context.auth },
    );

    void envApi
      .list()
      .then((result) => {
        if (!cancelled) {
          setEnvironments(result.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnvironments([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    context.apiBaseUrl,
    context.auth.mode,
    context.auth.token,
    activeEnvironment,
    context.documentRoute?.project,
  ]);

  const pathname = usePathname();
  const router = useRouter();

  // Auth gate: redirect only truly unauthenticated cookie-mode users to login.
  // Token-mode embeds must never redirect to the login screen — token auth
  // failures are shown inline via the "token-error" session state.
  useEffect(() => {
    if (
      sessionState.status === "unauthenticated" &&
      context.auth.mode !== "token"
    ) {
      const returnTo = encodeURIComponent(
        pathname.includes("/admin") ? pathname : "/admin",
      );
      router.replace(`/admin/login?returnTo=${returnTo}`);
    }
  }, [sessionState.status, pathname, router, context.auth.mode]);

  if (sessionState.status === "loading" && typeof window !== "undefined") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-foreground-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (sessionState.status === "unauthenticated") {
    return null;
  }

  if (sessionState.status === "token-error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 shadow-sm space-y-4">
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Token authentication failed
            </p>
            <p className="text-sm text-foreground-muted">
              Studio is configured for token-based authentication (
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                auth.mode = &quot;token&quot;
              </code>
              ) but the supplied token could not be used.
            </p>
          </div>

          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sessionState.message}
          </div>

          <div className="rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted space-y-1">
            <p>
              <span className="font-medium">Reason:</span>{" "}
              {sessionState.reason}
            </p>
            <p>
              <span className="font-medium">Auth mode:</span> token
            </p>
            {context.documentRoute?.project && (
              <p>
                <span className="font-medium">Project:</span>{" "}
                {context.documentRoute.project}
              </p>
            )}
            {activeEnvironment && (
              <p>
                <span className="font-medium">Environment:</span>{" "}
                {activeEnvironment}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (sessionState.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm font-medium text-foreground">
            Session could not be verified
          </p>
          <p className="text-sm text-foreground-muted">
            {sessionState.message}
          </p>
        </div>
      </div>
    );
  }

  const handleToggle = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

  const mountInfo = {
    project: context.documentRoute?.project ?? null,
    environment: activeEnvironment,
    setEnvironment: setActiveEnvironment,
    apiBaseUrl: context.apiBaseUrl,
    auth: context.auth,
    environments,
    hostBridge: context.hostBridge,
    supportedLocales: context.documentRoute?.supportedLocales,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="min-h-screen overflow-x-hidden bg-background">
          <AdminCapabilitiesProvider
            value={{
              canReadSchema,
              canCreateContent,
              canPublishContent,
              canUnpublishContent,
              canDeleteContent,
              canManageUsers,
              canManageSettings,
            }}
          >
            <StudioSessionProvider value={sessionState}>
              <StudioMountInfoProvider value={mountInfo}>
                <AppSidebar
                  canReadSchema={canReadSchema}
                  canManageUsers={canManageUsers}
                  canManageSettings={canManageSettings}
                  collapsed={sidebarCollapsed}
                  onToggle={handleToggle}
                />
                <main
                  className={cn(
                    "min-h-screen min-w-0 overflow-x-hidden transition-all duration-300",
                    sidebarCollapsed ? "ml-16" : "ml-60",
                  )}
                >
                  {children}
                </main>
              </StudioMountInfoProvider>
            </StudioSessionProvider>
          </AdminCapabilitiesProvider>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}
