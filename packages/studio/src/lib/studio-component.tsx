"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import {
  isRuntimeErrorLike,
  type HostBridgeV1,
  type StudioMountContext,
} from "@mdcms/shared";

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
  startupError?: unknown;
  containerRef?: RefObject<HTMLDivElement | null>;
};

export type StudioStartupErrorMetadataRow = {
  label: string;
  value: string;
};

export type StudioStartupErrorDescription = {
  categoryLabel: string;
  title: string;
  summary: string;
  note?: string;
  technicalDetails: string;
  metadata: StudioStartupErrorMetadataRow[];
};

const LOADING_TITLE = "Preparing Studio runtime";
const LOADING_SUMMARY =
  "Fetching the configured Studio bundle and validating it before launch.";
const READY_CONTAINER_STYLE = {
  minHeight: "20rem",
} as const;

const STUDIO_SHELL_STYLES = `
.mdcms-studio-shell,
.mdcms-studio-shell * {
  box-sizing: border-box;
}

.mdcms-studio-shell {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  isolation: isolate;
  overflow-x: hidden;
  overflow-y: auto;
  background: #FCF9F8;
  color: #1C1B1B;
  font-family: Inter, -apple-system, system-ui, sans-serif;
}

.mdcms-studio-shell__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(47, 73, 229, 0.08), transparent 24rem),
    linear-gradient(180deg, #FCF9F8 0%, #F6F3F2 100%);
}

.mdcms-studio-shell__frame {
  position: relative;
  display: flex;
  min-height: 100%;
  align-items: stretch;
  width: 100%;
  max-width: 70rem;
  margin: 0 auto;
  padding: 1.25rem;
}

.mdcms-studio-shell__panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(197, 197, 216, 0.2);
  border-radius: 1.125rem;
  background: #FFFFFF;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.mdcms-studio-shell__header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(197, 197, 216, 0.3);
}

.mdcms-studio-shell__brand-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mdcms-studio-shell__brand-badge,
.mdcms-studio-shell__path-chip,
.mdcms-studio-shell__category-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.mdcms-studio-shell__brand-badge {
  border: 1px solid rgba(197, 197, 216, 0.3);
  background: rgba(47, 73, 229, 0.08);
  color: #2F49E5;
}

.mdcms-studio-shell__path-chip {
  border: 1px solid rgba(197, 197, 216, 0.3);
  background: #F6F3F2;
  color: #444655;
  font-family: "Geist Mono", ui-monospace, monospace;
  letter-spacing: 0.04em;
  text-transform: none;
}

.mdcms-studio-shell__display,
.mdcms-studio-shell__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #1C1B1B;
}

.mdcms-studio-shell__display {
  font-size: clamp(1.875rem, 3vw, 2.4rem);
}

.mdcms-studio-shell__title {
  font-size: clamp(1.6rem, 2.6vw, 2.25rem);
}

.mdcms-studio-shell__content {
  margin-top: 1rem;
  display: grid;
  gap: 1rem;
}

.mdcms-studio-shell__eyebrow,
.mdcms-studio-shell__section-label,
.mdcms-studio-shell__meta-label,
.mdcms-studio-shell__details-hint {
  margin: 0;
  color: #444655;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.mdcms-studio-shell__copy,
.mdcms-studio-shell__summary,
.mdcms-studio-shell__note,
.mdcms-studio-shell__check-text,
.mdcms-studio-shell__meta-value,
.mdcms-studio-shell__details-summary {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.7;
}

.mdcms-studio-shell__copy,
.mdcms-studio-shell__summary {
  max-width: 42rem;
  color: #444655;
}

.mdcms-studio-shell__note {
  max-width: 42rem;
  color: #92400e;
}

.mdcms-studio-shell__surface,
.mdcms-studio-shell__aside,
.mdcms-studio-shell__details {
  border-radius: 0.95rem;
  border: 1px solid rgba(197, 197, 216, 0.3);
}

.mdcms-studio-shell__surface,
.mdcms-studio-shell__details {
  background: #F6F3F2;
  padding: 1rem;
}

.mdcms-studio-shell__aside {
  background: #F6F3F2;
  padding: 1rem;
}

.mdcms-studio-shell__skeleton-stack {
  display: grid;
  gap: 0.75rem;
}

.mdcms-studio-shell__skeleton-line,
.mdcms-studio-shell__skeleton-bar,
.mdcms-studio-shell__skeleton-card,
.mdcms-studio-shell__check-dot {
  animation: mdcms-studio-shell-pulse 1.8s ease-in-out infinite;
}

.mdcms-studio-shell__skeleton-line {
  height: 0.75rem;
  width: 7rem;
  border-radius: 999px;
  background: rgba(197, 197, 216, 0.5);
}

.mdcms-studio-shell__skeleton-bar {
  height: 2.25rem;
  width: 100%;
  border-radius: 0.5rem;
  background: rgba(197, 197, 216, 0.25);
}

.mdcms-studio-shell__skeleton-grid {
  display: grid;
  gap: 0.75rem;
}

.mdcms-studio-shell__skeleton-card {
  height: 6rem;
  border-radius: 0.5rem;
  background: rgba(197, 197, 216, 0.2);
}

.mdcms-studio-shell__skeleton-card:nth-child(2) {
  background: rgba(197, 197, 216, 0.15);
}

.mdcms-studio-shell__skeleton-card:nth-child(3) {
  background: rgba(197, 197, 216, 0.1);
}

.mdcms-studio-shell__check-list {
  margin-top: 1rem;
  display: grid;
  gap: 0.75rem;
}

.mdcms-studio-shell__check-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(197, 197, 216, 0.2);
  background: #FFFFFF;
}

.mdcms-studio-shell__check-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #2F49E5;
}

.mdcms-studio-shell__category-badge {
  margin-bottom: 0.75rem;
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.06);
  color: #ef4444;
}

.mdcms-studio-shell__details {
  margin-top: 1rem;
}

.mdcms-studio-shell__details-summary {
  cursor: pointer;
  list-style: none;
  color: #1C1B1B;
  font-weight: 500;
}

.mdcms-studio-shell__details-summary::-webkit-details-marker {
  display: none;
}

.mdcms-studio-shell__details-summary-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}

.mdcms-studio-shell__details[open] .mdcms-studio-shell__details-hint {
  color: #444655;
}

.mdcms-studio-shell__details-pre {
  margin: 1rem 0 0;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(197, 197, 216, 0.3);
  background: #F0EDEC;
  color: #1C1B1B;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 0.78rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.mdcms-studio-shell__meta-list {
  margin: 1rem 0 0;
  display: grid;
}

.mdcms-studio-shell__meta-group {
  margin-top: 1rem;
}

.mdcms-studio-shell__meta-row {
  display: grid;
  gap: 0.3rem;
  padding: 0.75rem 0;
  border-top: 1px solid rgba(197, 197, 216, 0.3);
}

.mdcms-studio-shell__meta-row:first-child {
  padding-top: 0;
  border-top: 0;
}

.mdcms-studio-shell__meta-value {
  font-family: "Geist Mono", ui-monospace, monospace;
  color: #1C1B1B;
  word-break: break-word;
}

@keyframes mdcms-studio-shell-pulse {
  0%, 100% {
    opacity: 0.4;
  }

  50% {
    opacity: 1;
  }
}

@media (min-width: 640px) {
  .mdcms-studio-shell__frame {
    padding: 1.5rem;
  }

  .mdcms-studio-shell__panel {
    padding: 1.5rem;
  }

  .mdcms-studio-shell__header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }

  .mdcms-studio-shell__skeleton-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .mdcms-studio-shell__frame {
    padding: 2rem;
  }

  .mdcms-studio-shell__panel {
    padding: 1.75rem;
  }

  .mdcms-studio-shell__content {
    grid-template-columns: minmax(0, 1.3fr) minmax(18rem, 0.75fr);
  }

}
`;

const LOAD_ERROR_CODES = new Set([
  "STUDIO_BOOTSTRAP_FETCH_FAILED",
  "STUDIO_RUNTIME_ASSET_LOAD_FAILED",
]);

const REJECTED_ERROR_CODES = new Set([
  "INVALID_STUDIO_BOOTSTRAP_MANIFEST",
  "INVALID_STUDIO_BOOTSTRAP_RESPONSE",
  "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST",
  "STUDIO_RUNTIME_INTEGRITY_UNAVAILABLE",
  "STUDIO_RUNTIME_INTEGRITY_MISMATCH",
  "INVALID_STUDIO_RUNTIME_SIGNATURE",
  "INVALID_STUDIO_RUNTIME_KEY_ID",
]);

const STARTUP_BLOCKED_ERROR_CODES = new Set([
  "STUDIO_RUNTIME_DISABLED",
  "STUDIO_RUNTIME_UNAVAILABLE",
]);

function readDetailString(
  details: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = details?.[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readDetailBoolean(
  details: Record<string, unknown> | undefined,
  key: string,
): boolean {
  return details?.[key] === true;
}

export function describeStudioStartupError(
  error: unknown,
): StudioStartupErrorDescription {
  const fallbackMessage =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : "Failed to initialize Studio.";

  if (!isRuntimeErrorLike(error)) {
    return {
      categoryLabel: "Startup crash",
      title: "Studio bundle crashed during startup",
      summary:
        "The Studio runtime loaded, but failed while initializing inside the shell.",
      technicalDetails: fallbackMessage,
      metadata: [{ label: "Error code", value: "INTERNAL_ERROR" }],
    };
  }

  const metadata: StudioStartupErrorMetadataRow[] = [
    { label: "Error code", value: error.code },
  ];
  const browserOrigin = readDetailString(error.details, "browserOrigin");
  const requestedOrigin = readDetailString(error.details, "requestedOrigin");
  const requestUrl = readDetailString(error.details, "url");

  if (browserOrigin) {
    metadata.push({ label: "Host origin", value: browserOrigin });
  }

  if (requestedOrigin) {
    metadata.push({ label: "Target origin", value: requestedOrigin });
  }

  if (requestUrl) {
    metadata.push({ label: "Request URL", value: requestUrl });
  }

  if (LOAD_ERROR_CODES.has(error.code)) {
    const isCrossOrigin = readDetailBoolean(error.details, "isCrossOrigin");
    const isOriginPolicyFailure = readDetailBoolean(
      error.details,
      "isOriginPolicyFailure",
    );

    return {
      categoryLabel: "Bundle load",
      title: "Studio bundle could not be loaded",
      summary:
        "The shell could not retrieve the Studio runtime from the configured backend.",
      note: isOriginPolicyFailure
        ? "The browser blocked the request before Studio could start."
        : isCrossOrigin
          ? "Studio could not reach the configured backend before startup completed."
          : undefined,
      technicalDetails: error.message,
      metadata,
    };
  }

  if (REJECTED_ERROR_CODES.has(error.code)) {
    return {
      categoryLabel: "Bundle rejected",
      title: "Studio bundle was rejected",
      summary:
        "The downloaded Studio runtime did not pass host validation, so startup was stopped.",
      technicalDetails: error.message,
      metadata,
    };
  }

  if (STARTUP_BLOCKED_ERROR_CODES.has(error.code)) {
    if (error.code === "STUDIO_RUNTIME_DISABLED") {
      return {
        categoryLabel: "Startup disabled",
        title: "Studio startup is disabled",
        summary:
          "An operator has disabled Studio startup for this server, so the shell will not load a runtime bundle.",
        note: "Update the server-side Studio runtime configuration and reload this route after the operator re-enables startup.",
        technicalDetails: error.message,
        metadata,
      };
    }

    return {
      categoryLabel: "Runtime unavailable",
      title: "No safe Studio runtime is available",
      summary:
        "The server could not provide a safe runtime from either the active or last-known-good publication, so startup was stopped before the bundle loaded.",
      note: "Publish or restore a verified Studio runtime on the server before retrying this route.",
      technicalDetails: error.message,
      metadata,
    };
  }

  return {
    categoryLabel: "Startup crash",
    title: "Studio bundle crashed during startup",
    summary:
      "The Studio runtime loaded, but failed while initializing inside the shell.",
    technicalDetails: error.message,
    metadata,
  };
}

export function StudioShellFrame({
  config,
  basePath,
  startupState,
  startupError,
  containerRef,
}: StudioShellFrameProps) {
  const describedError =
    startupState === "error"
      ? describeStudioStartupError(startupError)
      : undefined;

  return (
    <div
      data-testid="mdcms-studio-root"
      data-mdcms-project={config.project}
      data-mdcms-server-url={config.serverUrl}
      data-mdcms-base-path={basePath}
      data-mdcms-state={startupState}
      data-mdcms-brand="MDCMS"
      className={startupState === "ready" ? undefined : "mdcms-studio-shell"}
    >
      <div
        ref={containerRef}
        data-mdcms-runtime-container="true"
        hidden={startupState !== "ready"}
        style={startupState === "ready" ? READY_CONTAINER_STYLE : undefined}
      />

      {startupState !== "ready" ? (
        <>
          <style>{STUDIO_SHELL_STYLES}</style>
          <div aria-hidden="true" className="mdcms-studio-shell__backdrop" />
          <section className="mdcms-studio-shell__frame">
            <div className="mdcms-studio-shell__panel">
              <header className="mdcms-studio-shell__header">
                <div className="mdcms-studio-shell__brand-group">
                  <div className="mdcms-studio-shell__brand-badge">MDCMS</div>
                  <h1 className="mdcms-studio-shell__display">Studio</h1>
                </div>
                <span className="mdcms-studio-shell__path-chip">
                  {basePath}
                </span>
              </header>

              {startupState === "loading" ? (
                <div className="mdcms-studio-shell__content" aria-live="polite">
                  <div>
                    <div>
                      <p className="mdcms-studio-shell__eyebrow">Startup</p>
                      <h2 className="mdcms-studio-shell__title">
                        {LOADING_TITLE}
                      </h2>
                      <p className="mdcms-studio-shell__copy">
                        {LOADING_SUMMARY}
                      </p>
                    </div>

                    <div className="mdcms-studio-shell__surface">
                      <div className="mdcms-studio-shell__skeleton-stack">
                        <div className="mdcms-studio-shell__skeleton-line" />
                        <div className="mdcms-studio-shell__skeleton-bar" />
                        <div className="mdcms-studio-shell__skeleton-grid">
                          <div className="mdcms-studio-shell__skeleton-card" />
                          <div className="mdcms-studio-shell__skeleton-card" />
                          <div className="mdcms-studio-shell__skeleton-card" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="mdcms-studio-shell__aside">
                    <p className="mdcms-studio-shell__section-label">
                      Startup checks
                    </p>
                    <div className="mdcms-studio-shell__check-list">
                      {[
                        "Fetching bootstrap manifest",
                        "Verifying runtime integrity",
                        "Preparing host bridge handoff",
                      ].map((step) => (
                        <div
                          key={step}
                          className="mdcms-studio-shell__check-item"
                        >
                          <div className="mdcms-studio-shell__check-dot" />
                          <span className="mdcms-studio-shell__check-text">
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              ) : describedError ? (
                <div role="alert" className="mdcms-studio-shell__content">
                  <div>
                    <div>
                      <span className="mdcms-studio-shell__category-badge">
                        {describedError.categoryLabel}
                      </span>
                      <h2 className="mdcms-studio-shell__title">
                        {describedError.title}
                      </h2>
                      <p className="mdcms-studio-shell__summary">
                        {describedError.summary}
                      </p>
                      {describedError.note ? (
                        <p className="mdcms-studio-shell__note">
                          {describedError.note}
                        </p>
                      ) : null}
                    </div>

                    <details className="mdcms-studio-shell__details">
                      <summary className="mdcms-studio-shell__details-summary">
                        <span className="mdcms-studio-shell__details-summary-inner">
                          <span>Technical details</span>
                          <span className="mdcms-studio-shell__details-hint">
                            Expand
                          </span>
                        </span>
                      </summary>
                      <pre className="mdcms-studio-shell__details-pre">
                        {describedError.technicalDetails}
                      </pre>
                      <div className="mdcms-studio-shell__meta-group">
                        <p className="mdcms-studio-shell__section-label">
                          Failure metadata
                        </p>
                        <dl className="mdcms-studio-shell__meta-list">
                          {describedError.metadata.map((row) => (
                            <div
                              key={row.label}
                              className="mdcms-studio-shell__meta-row"
                            >
                              <dt className="mdcms-studio-shell__meta-label">
                                {row.label}
                              </dt>
                              <dd className="mdcms-studio-shell__meta-value">
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </details>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
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
  const [startupError, setStartupError] = useState<unknown>();

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let isDisposed = false;
    let unmountRuntime: (() => void) | undefined;

    setStartupState("loading");
    setStartupError(undefined);

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

        setStartupError(error);
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
      startupError={startupError}
      containerRef={containerRef}
    />
  );
}
