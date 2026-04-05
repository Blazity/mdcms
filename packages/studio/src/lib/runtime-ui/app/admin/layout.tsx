// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import type { StudioMountContext, EnvironmentSummary } from "@mdcms/shared";

import { createStudioCurrentPrincipalCapabilitiesApi } from "../../../current-principal-capabilities-api.js";
import { createStudioSessionApi } from "../../../session-api.js";
import { createStudioEnvironmentApi } from "../../../environment-api.js";
import { AdminCapabilitiesProvider } from "./capabilities-context.js";
import {
  StudioSessionProvider,
  type StudioSessionState,
} from "./session-context.js";
import { StudioMountInfoProvider } from "./mount-info-context.js";
import { AppSidebar } from "../../components/layout/app-sidebar";
import { cn } from "../../lib/utils";

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
      environment: route.environment,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [canReadSchema, setCanReadSchema] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canManageSettings, setCanManageSettings] = useState(false);
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
    const loadInput = createAdminLayoutCapabilitiesLoadInput(context);

    if (!loadInput) {
      setCanReadSchema(false);
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
          setCanManageUsers(response.capabilities.users.manage);
          setCanManageSettings(response.capabilities.settings.manage);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanReadSchema(false);
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
    context.documentRoute?.environment,
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
    const capLoadInput = createAdminLayoutCapabilitiesLoadInput(context);

    if (!capLoadInput) {
      setEnvironments([]);
      return;
    }

    let cancelled = false;
    const envApi = createStudioEnvironmentApi(capLoadInput.config, {
      auth: capLoadInput.auth,
    });

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
    context.documentRoute?.environment,
    context.documentRoute?.project,
  ]);

  const handleToggle = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

  const mountInfo = {
    project: context.documentRoute?.project ?? null,
    environment: context.documentRoute?.environment ?? null,
    apiBaseUrl: context.apiBaseUrl,
    auth: context.auth,
    environments,
    hostBridge: context.hostBridge,
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <AdminCapabilitiesProvider
        value={{ canReadSchema, canManageUsers, canManageSettings }}
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
  );
}
