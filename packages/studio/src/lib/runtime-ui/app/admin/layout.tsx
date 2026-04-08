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
      .catch(() => {
        if (!cancelled) {
          setCanReadSchema(false);
          setCanCreateContent(false);
          setCanPublishContent(false);
          setCanUnpublishContent(false);
          setCanDeleteContent(false);
          setCanManageUsers(false);
          setCanManageSettings(false);
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
      .then((list) => {
        if (!cancelled) {
          setEnvironments(list);
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

  // Auth gate: redirect only truly unauthenticated users to login.
  // Transient errors (e.g. network blip) should not kick an
  // authenticated user out — show an inline error instead.
  useEffect(() => {
    if (sessionState.status === "unauthenticated") {
      const returnTo = encodeURIComponent(
        pathname.includes("/admin") ? pathname : "/admin",
      );
      router.replace(`/admin/login?returnTo=${returnTo}`);
    }
  }, [sessionState.status, pathname, router]);

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
