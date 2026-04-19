"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { StudioMountContext } from "@mdcms/shared";

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

type AdminLayoutTokenErrorState = Extract<
  StudioSessionState,
  { status: "token-error" }
>;

export function createAdminLayoutCapabilitiesLoadInput(
  context: StudioMountContext,
): AdminLayoutCapabilitiesLoadInput | null {
  const route = context.documentRoute;

  if (!route || (context.auth.mode === "token" && !context.auth.token)) {
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
        'No bearer token was provided. The host application must supply a token when using auth.mode = "token".',
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

export function createAdminLayoutTokenErrorState(
  statusCode: number | null,
): AdminLayoutTokenErrorState | null {
  if (statusCode === 401) {
    return {
      status: "token-error",
      reason: "invalid",
      message: "The bearer token is invalid, expired, or has been revoked.",
    };
  }

  if (statusCode === 403) {
    return {
      status: "token-error",
      reason: "forbidden",
      message:
        "The bearer token is not allowed for the requested project or environment.",
    };
  }

  return null;
}

export function AdminTokenErrorStateView({
  state,
  context,
  activeEnvironment,
}: {
  state: AdminLayoutTokenErrorState;
  context: StudioMountContext;
  activeEnvironment: string | null;
}) {
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
          {state.message}
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted space-y-1">
          <p>
            <span className="font-medium">Reason:</span> {state.reason}
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

function extractStatusCode(error: unknown): number | null {
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

export default function AdminLayout({
  children,
  context,
}: {
  children: React.ReactNode;
  context: StudioMountContext;
}) {
  const [queryClient] = useState(() => createStudioQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayoutInner context={context}>{children}</AdminLayoutInner>
    </QueryClientProvider>
  );
}

function AdminLayoutInner({
  children,
  context,
}: {
  children: React.ReactNode;
  context: StudioMountContext;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  // Persist sidebar state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  // Capabilities
  const capabilitiesLoadInput = useMemo(() => {
    const baseLoadInput = createAdminLayoutCapabilitiesLoadInput(context);
    if (!baseLoadInput || !activeEnvironment) return null;
    return {
      ...baseLoadInput,
      config: {
        ...baseLoadInput.config,
        environment: activeEnvironment,
      },
    };
  }, [
    context.apiBaseUrl,
    context.auth.mode,
    context.auth.token,
    context.documentRoute?.project,
    context.documentRoute?.initialEnvironment,
    activeEnvironment,
    // createAdminLayoutCapabilitiesLoadInput only reads the fields above
    // from context, so the stable primitive deps above are sufficient.
    context,
  ]);

  const capabilitiesQuery = useQuery({
    queryKey: [
      "studio",
      "capabilities",
      capabilitiesLoadInput?.config.project,
      capabilitiesLoadInput?.config.environment,
      capabilitiesLoadInput?.config.serverUrl,
      capabilitiesLoadInput?.auth.mode,
      capabilitiesLoadInput?.auth.mode === "token"
        ? capabilitiesLoadInput.auth.token
        : null,
    ],
    queryFn: () => {
      const api = createStudioCurrentPrincipalCapabilitiesApi(
        capabilitiesLoadInput!.config,
        { auth: capabilitiesLoadInput!.auth },
      );
      return api.get();
    },
    enabled: capabilitiesLoadInput !== null,
  });

  // Session
  const tokenSessionState = useMemo(
    () => createAdminLayoutTokenSessionState(context.auth),
    [context.auth],
  );
  const isTokenMode = context.auth.mode === "token";
  const sessionLoadInput = useMemo(
    () => createAdminLayoutSessionLoadInput(context),
    [context.apiBaseUrl, context.auth.mode, context.auth.token, context],
  );

  const sessionQuery = useQuery({
    queryKey: [
      "studio",
      "session",
      sessionLoadInput.config.serverUrl,
      sessionLoadInput.auth.mode,
      sessionLoadInput.auth.mode === "token"
        ? sessionLoadInput.auth.token
        : null,
    ],
    queryFn: () => {
      const api = createStudioSessionApi(sessionLoadInput.config, {
        auth: sessionLoadInput.auth,
      });
      return api.get();
    },
    enabled: !isTokenMode,
  });

  const sessionState: StudioSessionState = useMemo(() => {
    if (isTokenMode) {
      if (tokenSessionState?.status === "token-error") {
        return tokenSessionState;
      }
      const tokenErrorFromCapabilities = capabilitiesQuery.error
        ? createAdminLayoutTokenErrorState(
            extractStatusCode(capabilitiesQuery.error),
          )
        : null;
      if (tokenErrorFromCapabilities) {
        return tokenErrorFromCapabilities;
      }
      return tokenSessionState ?? { status: "loading" };
    }

    if (sessionQuery.isPending) {
      return { status: "loading" };
    }
    if (sessionQuery.error) {
      const statusCode = extractStatusCode(sessionQuery.error);
      if (statusCode === 401) {
        return { status: "unauthenticated" };
      }
      return {
        status: "error",
        message:
          sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : "Session fetch failed.",
      };
    }
    const data = sessionQuery.data!;
    return {
      status: "authenticated",
      session: data.session,
      csrfToken: data.csrfToken,
    };
  }, [
    isTokenMode,
    tokenSessionState,
    capabilitiesQuery.error,
    sessionQuery.isPending,
    sessionQuery.error,
    sessionQuery.data,
  ]);

  // Environments
  const environmentsEnabled = Boolean(
    context.documentRoute?.project && activeEnvironment,
  );
  const environmentsQuery = useQuery({
    queryKey: [
      "studio",
      "environments",
      context.documentRoute?.project,
      activeEnvironment,
      context.apiBaseUrl,
      context.auth.mode,
      context.auth.mode === "token" ? context.auth.token : null,
    ],
    queryFn: () => {
      const api = createStudioEnvironmentApi(
        {
          project: context.documentRoute!.project,
          environment: activeEnvironment!,
          serverUrl: context.apiBaseUrl,
        },
        { auth: context.auth },
      );
      return api.list();
    },
    enabled: environmentsEnabled,
  });

  const capabilities = capabilitiesQuery.data?.capabilities;
  const canReadSchema = capabilities?.schema.read ?? false;
  const canCreateContent = capabilities?.content.write ?? false;
  const canPublishContent = capabilities?.content.publish ?? false;
  const canUnpublishContent = capabilities?.content.unpublish ?? false;
  const canDeleteContent = capabilities?.content.delete ?? false;
  const canManageUsers = capabilities?.users.manage ?? false;
  const canManageSettings = capabilities?.settings.manage ?? false;

  const environments = environmentsQuery.data?.data ?? [];

  const pathname = usePathname();
  const router = useRouter();

  // Auth gate: redirect only truly unauthenticated cookie-mode users to login.
  // Token-mode embeds must never redirect to the login screen — token auth
  // failures are shown inline via the "token-error" session state.
  useEffect(() => {
    if (sessionState.status === "unauthenticated" && !isTokenMode) {
      const returnTo = encodeURIComponent(
        pathname.includes("/admin") ? pathname : "/admin",
      );
      router.replace(`/admin/login?returnTo=${returnTo}`);
    }
  }, [sessionState.status, pathname, router, isTokenMode]);

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
      <AdminTokenErrorStateView
        state={sessionState}
        context={context}
        activeEnvironment={activeEnvironment}
      />
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
  );
}
