// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import type { StudioMountContext } from "@mdcms/shared";

import { createStudioCurrentPrincipalCapabilitiesApi } from "../../../current-principal-capabilities-api.js";
import { AdminCapabilitiesProvider } from "./capabilities-context.js";
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

export default function AdminLayout({
  children,
  context,
}: {
  children: React.ReactNode;
  context: StudioMountContext;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [canReadSchema, setCanReadSchema] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  useEffect(() => {
    const loadInput = createAdminLayoutCapabilitiesLoadInput(context);

    if (!loadInput) {
      setCanReadSchema(false);
      return;
    }

    let cancelled = false;
    const capabilitiesApi = createStudioCurrentPrincipalCapabilitiesApi(
      loadInput.config,
      {
        auth: loadInput.auth,
      },
    );

    void capabilitiesApi
      .get()
      .then((response) => {
        if (!cancelled) {
          setCanReadSchema(response.capabilities.schema.read);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanReadSchema(false);
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <AdminCapabilitiesProvider value={{ canReadSchema }}>
        <AppSidebar
          canReadSchema={canReadSchema}
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
      </AdminCapabilitiesProvider>
    </div>
  );
}
