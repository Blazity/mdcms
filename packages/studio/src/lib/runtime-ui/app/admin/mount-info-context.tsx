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
  apiBaseUrl: string;
  auth: StudioMountContext["auth"];
  environments: EnvironmentSummary[];
  hostBridge: HostBridgeV1 | null;
};

const DEFAULT_MOUNT_INFO: StudioMountInfo = {
  project: null,
  environment: null,
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
