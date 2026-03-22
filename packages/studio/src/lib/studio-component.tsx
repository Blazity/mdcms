"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { HostBridgeV1, StudioMountContext } from "@mdcms/shared";

import {
  loadStudioRuntime,
  type MdcmsConfig,
  type StudioLoaderOptions,
} from "./studio-loader.js";

export type { MdcmsConfig } from "./studio-loader.js";

export type StudioStartupState = "loading" | "ready" | "error";

export type StudioProps = {
  config: MdcmsConfig;
  basePath: string;
  auth?: StudioMountContext["auth"];
  hostBridge?: HostBridgeV1;
  fetcher?: StudioLoaderOptions["fetcher"];
  loadRemoteModule?: StudioLoaderOptions["loadRemoteModule"];
};

export type StudioShellFrameProps = {
  config: MdcmsConfig;
  basePath: string;
  startupState: StudioStartupState;
  errorMessage?: string;
  containerRef?: RefObject<HTMLDivElement | null>;
};

function getStartupMessage(
  startupState: StudioStartupState,
  errorMessage?: string,
): string {
  if (startupState === "loading") {
    return "Loading Studio...";
  }

  if (startupState === "error") {
    return errorMessage?.trim() || "Failed to initialize Studio.";
  }

  return "Studio runtime ready.";
}

export function StudioShellFrame({
  config,
  basePath,
  startupState,
  errorMessage,
  containerRef,
}: StudioShellFrameProps) {
  const statusMessage = getStartupMessage(startupState, errorMessage);

  return (
    <section
      data-testid="mdcms-studio-root"
      data-mdcms-project={config.project}
      data-mdcms-server-url={config.serverUrl}
      data-mdcms-base-path={basePath}
      data-mdcms-state={startupState}
      data-mdcms-brand="MDCMS"
      className="mx-auto w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            MDCMS
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Studio</h1>
          {startupState !== "error" ? (
            <p className="text-sm text-slate-600">{statusMessage}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {basePath}
        </span>
      </header>

      {startupState === "loading" ? (
        <div className="space-y-3" aria-live="polite">
          <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
          <div className="h-20 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ) : startupState === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-semibold">Studio startup failed</p>
          <p className="mt-2 whitespace-pre-line">{statusMessage}</p>
        </div>
      ) : null}

      <div
        ref={containerRef}
        data-mdcms-runtime-container="true"
        hidden={startupState !== "ready"}
        className={startupState === "ready" ? "min-h-[20rem]" : "hidden"}
      />
    </section>
  );
}

/**
 * Studio is the host-embedded entrypoint for MDCMS Studio.
 * It owns only bootstrap-time loading and fatal startup failures; once the
 * remote runtime mounts successfully, the remote app owns all Studio UI.
 */
export function Studio({
  config,
  basePath,
  auth,
  hostBridge,
  fetcher,
  loadRemoteModule,
}: StudioProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [startupState, setStartupState] =
    useState<StudioStartupState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let isDisposed = false;
    let unmountRuntime: (() => void) | undefined;

    setStartupState("loading");
    setErrorMessage(undefined);

    void loadStudioRuntime({
      config,
      basePath,
      container,
      auth,
      hostBridge,
      fetcher,
      loadRemoteModule,
    })
      .then((dispose) => {
        if (isDisposed) {
          dispose();
          return;
        }

        unmountRuntime = dispose;
        setStartupState("ready");
      })
      .catch((error: unknown) => {
        if (isDisposed) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to initialize Studio.",
        );
        setStartupState("error");
      });

    return () => {
      isDisposed = true;
      unmountRuntime?.();
    };
  }, [auth, basePath, config, fetcher, hostBridge, loadRemoteModule]);

  return (
    <StudioShellFrame
      config={config}
      basePath={basePath}
      startupState={startupState}
      errorMessage={errorMessage}
      containerRef={containerRef}
    />
  );
}
