"use client";

import { createContext, useContext, type PropsWithChildren } from "react";

import type { StudioSessionInfo } from "../../../session-api.js";

export type StudioSessionState =
  | { status: "loading" }
  | { status: "authenticated"; session: StudioSessionInfo; csrfToken: string }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

const DEFAULT_SESSION_STATE: StudioSessionState = { status: "loading" };

const StudioSessionContext = createContext<StudioSessionState>(
  DEFAULT_SESSION_STATE,
);

export function StudioSessionProvider({
  value,
  children,
}: PropsWithChildren<{ value: StudioSessionState }>) {
  return (
    <StudioSessionContext.Provider value={value}>
      {children}
    </StudioSessionContext.Provider>
  );
}

export function useStudioSession(): StudioSessionState {
  return useContext(StudioSessionContext);
}
