"use client";

import { createContext, useContext, type PropsWithChildren } from "react";

import type {
  EnvironmentSummary,
  HostBridgeV1,
  StudioMountContext,
} from "@mdcms/shared";

export type StudioMountInfo = {
  project: string | null;
  environment: string | null;
  setEnvironment: (environment: string) => void;
  apiBaseUrl: string;
  auth: StudioMountContext["auth"];
  environments: EnvironmentSummary[];
  hostBridge: HostBridgeV1 | null;
  supportedLocales?: string[];
};

const DEFAULT_MOUNT_INFO: StudioMountInfo = {
  project: null,
  environment: null,
  setEnvironment: () => {},
  apiBaseUrl: "",
  auth: { mode: "cookie" },
  environments: [],
  hostBridge: null,
};

const StudioMountInfoContext =
  createContext<StudioMountInfo>(DEFAULT_MOUNT_INFO);

export function StudioMountInfoProvider({
  value,
  children,
}: PropsWithChildren<{ value: StudioMountInfo }>) {
  return (
    <StudioMountInfoContext.Provider value={value}>
      {children}
    </StudioMountInfoContext.Provider>
  );
}

export function useStudioMountInfo(): StudioMountInfo {
  return useContext(StudioMountInfoContext);
}

export type StudioApiConfig = {
  config: { project: string; environment: string; serverUrl: string };
  authOptions: { auth: StudioMountContext["auth"] };
};

/** Centralized API config derived from the active environment. All
 *  environment-scoped API calls should use this instead of constructing
 *  config objects manually, so the active environment is never stale. */
export function useStudioApiConfig(): StudioApiConfig | null {
  const { project, environment, apiBaseUrl, auth } = useStudioMountInfo();
  if (!project || !environment) return null;
  return {
    config: { project, environment, serverUrl: apiBaseUrl },
    authOptions: { auth },
  };
}
