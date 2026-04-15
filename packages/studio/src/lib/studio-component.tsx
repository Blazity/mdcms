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
export type StudioLoadingState = "initial" | "slow";

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
  loadingState?: StudioLoadingState;
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

type StudioLoadingDescription = {
  eyebrow: string;
  title: string;
  summary: string;
  note?: string;
};

const STUDIO_SLOW_START_AFTER_MS = 2_500;
const STARTUP_SEQUENCE = [
  {
    title: "Resolve bootstrap manifest",
    detail: "Ask the server which verified Studio publication should launch.",
  },
  {
    title: "Validate runtime bundle",
    detail: "Check compatibility and integrity before the runtime can execute.",
  },
  {
    title: "Mount the workspace shell",
    detail: "Hand off to the verified runtime and open the embedded Studio UI.",
  },
] as const;

// Slow-start copy is presentation only. Loader retries and startup decisions
// remain owned by the bootstrap/runtime contract.
const LOADING_DESCRIPTIONS: Record<
  StudioLoadingState,
  StudioLoadingDescription
> = {
  initial: {
    eyebrow: "Runtime bootstrap",
    title: "Loading Studio",
    summary:
      "Fetching the signed Studio runtime and preparing the workspace shell.",
  },
  slow: {
    eyebrow: "Still loading",
    title: "Studio is taking a little longer to start",
    summary:
      "The startup handshake is still in progress. Studio will open automatically as soon as the runtime finishes validation.",
    note:
      "First loads, cold starts, and fresh deploys can take a little longer than usual.",
  },
};

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
  background:
    radial-gradient(circle at top left, rgba(214, 255, 77, 0.38), transparent 28rem),
    radial-gradient(circle at top right, rgba(47, 73, 229, 0.2), transparent 30rem),
    linear-gradient(180deg, #fffdfc 0%, #fcf9f8 48%, #f5f1ef 100%);
  color: #1c1b1b;
  font-family: "Inter Variable", "Inter", "Inter Fallback", system-ui, sans-serif;
}

.mdcms-studio-shell__backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.18)),
    radial-gradient(circle at 20% 18%, rgba(47, 73, 229, 0.08), transparent 26%),
    radial-gradient(circle at 80% 6%, rgba(202, 242, 64, 0.28), transparent 18%);
  pointer-events: none;
}

.mdcms-studio-shell__backdrop::before,
.mdcms-studio-shell__backdrop::after {
  content: "";
  position: absolute;
  border-radius: 999px;
  filter: blur(0.2rem);
}

.mdcms-studio-shell__backdrop::before {
  top: 5rem;
  right: min(6vw, 5rem);
  width: min(22rem, 38vw);
  height: min(22rem, 38vw);
  border: 1px solid rgba(47, 73, 229, 0.12);
  background: radial-gradient(circle, rgba(47, 73, 229, 0.1), transparent 68%);
  animation: mdcms-studio-shell-float 14s ease-in-out infinite;
}

.mdcms-studio-shell__backdrop::after {
  bottom: 8rem;
  left: -5rem;
  width: min(20rem, 34vw);
  height: min(20rem, 34vw);
  background: radial-gradient(circle, rgba(202, 242, 64, 0.18), transparent 70%);
  animation: mdcms-studio-shell-float 18s ease-in-out infinite reverse;
}

.mdcms-studio-shell__frame {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  width: 100%;
  max-width: 78rem;
  margin: 0 auto;
  padding: 1.25rem;
}

.mdcms-studio-shell__panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-block: auto;
  border: 1px solid rgba(197, 197, 216, 0.58);
  border-radius: 1.5rem;
  background: rgba(252, 249, 248, 0.86);
  padding: 1.25rem;
  box-shadow:
    0 30px 80px rgba(28, 27, 27, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
}

.mdcms-studio-shell__header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid rgba(197, 197, 216, 0.48);
}

.mdcms-studio-shell__brand-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.mdcms-studio-shell__brand-mark {
  position: relative;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.95rem;
  background:
    linear-gradient(135deg, rgba(47, 73, 229, 0.14), rgba(202, 242, 64, 0.5)),
    #ffffff;
  border: 1px solid rgba(47, 73, 229, 0.14);
  box-shadow: 0 14px 30px rgba(47, 73, 229, 0.12);
  overflow: hidden;
}

.mdcms-studio-shell__brand-mark::before,
.mdcms-studio-shell__brand-mark::after {
  content: "";
  position: absolute;
  border-radius: 999px;
}

.mdcms-studio-shell__brand-mark::before {
  inset: 0.55rem 1.3rem 0.55rem 0.55rem;
  background: #2f49e5;
}

.mdcms-studio-shell__brand-mark::after {
  inset: 0.55rem 0.55rem 1.3rem 1.3rem;
  background: #caf240;
}

.mdcms-studio-shell__brand-copy {
  display: grid;
  gap: 0.2rem;
}

.mdcms-studio-shell__brand-label,
.mdcms-studio-shell__eyebrow,
.mdcms-studio-shell__section-label,
.mdcms-studio-shell__meta-label,
.mdcms-studio-shell__details-hint {
  margin: 0;
  color: #5d6175;
  font-family: "Geist Mono Variable", "Geist Mono", monospace;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mdcms-studio-shell__brand-name {
  margin: 0;
  color: #1c1b1b;
  font-family: "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.mdcms-studio-shell__header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mdcms-studio-shell__brand-badge,
.mdcms-studio-shell__path-chip,
.mdcms-studio-shell__category-badge,
.mdcms-studio-shell__status-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.mdcms-studio-shell__brand-badge {
  border: 1px solid rgba(47, 73, 229, 0.14);
  background: rgba(47, 73, 229, 0.08);
  color: #2f49e5;
}

.mdcms-studio-shell__path-chip {
  border: 1px solid rgba(197, 197, 216, 0.8);
  background: rgba(255, 255, 255, 0.72);
  color: #444655;
  font-family: "Geist Mono Variable", "Geist Mono", monospace;
  letter-spacing: 0.04em;
  text-transform: none;
}

.mdcms-studio-shell__status-chip {
  border: 1px solid rgba(202, 242, 64, 0.4);
  background: rgba(202, 242, 64, 0.24);
  color: #1c1b1b;
}

.mdcms-studio-shell__status-chip[data-loading-state="slow"] {
  border-color: rgba(47, 73, 229, 0.22);
  background: rgba(47, 73, 229, 0.1);
  color: #2f49e5;
}

.mdcms-studio-shell__display,
.mdcms-studio-shell__title {
  margin: 0;
  font-family: "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.05em;
  color: #1c1b1b;
}

.mdcms-studio-shell__display {
  font-size: clamp(1.95rem, 4vw, 3rem);
}

.mdcms-studio-shell__title {
  font-size: clamp(1.75rem, 3vw, 2.35rem);
}

.mdcms-studio-shell__content {
  margin-top: 1.25rem;
  display: grid;
  gap: 1rem;
}

.mdcms-studio-shell__copy,
.mdcms-studio-shell__summary,
.mdcms-studio-shell__note,
.mdcms-studio-shell__sequence-title,
.mdcms-studio-shell__sequence-detail,
.mdcms-studio-shell__support-copy,
.mdcms-studio-shell__meta-value,
.mdcms-studio-shell__details-summary {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.65;
}

.mdcms-studio-shell__copy,
.mdcms-studio-shell__summary {
  max-width: 44rem;
  color: #444655;
}

.mdcms-studio-shell__note {
  max-width: 44rem;
  color: #2f49e5;
}

.mdcms-studio-shell__surface,
.mdcms-studio-shell__rail,
.mdcms-studio-shell__meta-card,
.mdcms-studio-shell__details {
  border-radius: 1.2rem;
  border: 1px solid rgba(197, 197, 216, 0.58);
}

.mdcms-studio-shell__surface,
.mdcms-studio-shell__details {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(246, 243, 242, 0.94));
  padding: 1rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.mdcms-studio-shell__surface {
  position: relative;
  overflow: hidden;
}

.mdcms-studio-shell__surface::before {
  content: "";
  position: absolute;
  inset: auto -20% 30% 38%;
  height: 12rem;
  background: radial-gradient(circle, rgba(47, 73, 229, 0.16), transparent 72%);
  pointer-events: none;
}

.mdcms-studio-shell__surface--error::before {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.14), transparent 72%);
}

.mdcms-studio-shell__rail,
.mdcms-studio-shell__meta-card {
  background: rgba(255, 255, 255, 0.78);
  padding: 1rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.mdcms-studio-shell__hero {
  display: grid;
  gap: 0.8rem;
}

.mdcms-studio-shell__hero-copy {
  display: grid;
  gap: 0.65rem;
}

.mdcms-studio-shell__workspace-preview {
  position: relative;
  margin-top: 1.25rem;
  display: grid;
  gap: 0.85rem;
}

.mdcms-studio-shell__workspace-preview::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.56) 38%, transparent 52%);
  transform: translateX(-140%);
  animation: mdcms-studio-shell-shimmer 2.6s ease-in-out infinite;
  pointer-events: none;
}

.mdcms-studio-shell__preview-toolbar,
.mdcms-studio-shell__preview-layout,
.mdcms-studio-shell__preview-panel,
.mdcms-studio-shell__preview-sidebar {
  position: relative;
  overflow: hidden;
}

.mdcms-studio-shell__preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 3.3rem;
  padding: 0.8rem 0.9rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(197, 197, 216, 0.58);
}

.mdcms-studio-shell__preview-layout {
  display: grid;
  gap: 0.85rem;
}

.mdcms-studio-shell__preview-sidebar {
  min-height: 9.25rem;
  padding: 1rem;
  border-radius: 1rem;
  background: rgba(47, 73, 229, 0.06);
  border: 1px solid rgba(47, 73, 229, 0.12);
}

.mdcms-studio-shell__preview-panel {
  min-height: 9.25rem;
  padding: 1rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(197, 197, 216, 0.58);
}

.mdcms-studio-shell__preview-stack,
.mdcms-studio-shell__sequence-list {
  display: grid;
  gap: 0.75rem;
}

.mdcms-studio-shell__skeleton-line,
.mdcms-studio-shell__skeleton-bar,
.mdcms-studio-shell__skeleton-card,
.mdcms-studio-shell__sequence-dot {
  animation: mdcms-studio-shell-pulse 2s ease-in-out infinite;
}

.mdcms-studio-shell__skeleton-line {
  height: 0.75rem;
  width: 7rem;
  border-radius: 999px;
  background: rgba(68, 70, 85, 0.14);
}

.mdcms-studio-shell__skeleton-bar {
  height: 2.5rem;
  width: 100%;
  border-radius: 1rem;
  background: linear-gradient(90deg, rgba(47, 73, 229, 0.08), rgba(202, 242, 64, 0.2));
}

.mdcms-studio-shell__preview-card-grid {
  display: grid;
  gap: 0.75rem;
}

.mdcms-studio-shell__skeleton-card {
  height: 5.5rem;
  border-radius: 1rem;
  background: rgba(47, 73, 229, 0.08);
  border: 1px solid rgba(47, 73, 229, 0.08);
}

.mdcms-studio-shell__skeleton-card:nth-child(2) {
  background: rgba(202, 242, 64, 0.18);
}

.mdcms-studio-shell__skeleton-card:nth-child(3) {
  background: rgba(68, 70, 85, 0.08);
}

.mdcms-studio-shell__rail {
  display: grid;
  gap: 1rem;
  align-content: start;
}

.mdcms-studio-shell__sequence-item {
  display: flex;
  gap: 0.85rem;
  padding: 0.85rem 0;
  border-top: 1px solid rgba(197, 197, 216, 0.48);
}

.mdcms-studio-shell__sequence-item:first-child {
  padding-top: 0;
  border-top: 0;
}

.mdcms-studio-shell__sequence-dot {
  flex: none;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 1rem;
  margin-top: 0.3rem;
  background: linear-gradient(180deg, #2f49e5, #caf240);
  box-shadow: 0 0 0 0.25rem rgba(47, 73, 229, 0.08);
}

.mdcms-studio-shell__sequence-copy {
  display: grid;
  gap: 0.24rem;
}

.mdcms-studio-shell__sequence-title {
  color: #1c1b1b;
  font-weight: 600;
}

.mdcms-studio-shell__sequence-detail,
.mdcms-studio-shell__support-copy {
  color: #444655;
}

.mdcms-studio-shell__category-badge {
  margin-bottom: 0.75rem;
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
}

.mdcms-studio-shell__summary-stack {
  display: grid;
  gap: 0.6rem;
}

.mdcms-studio-shell__details {
  margin-top: 1rem;
}

.mdcms-studio-shell__details-summary {
  cursor: pointer;
  list-style: none;
  color: #1c1b1b;
  font-weight: 600;
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
  color: #2f49e5;
}

.mdcms-studio-shell__details-pre {
  margin: 1rem 0 0;
  padding: 1rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(197, 197, 216, 0.58);
  background: #f0edec;
  color: #1c1b1b;
  font-family: "Geist Mono Variable", "Geist Mono", monospace;
  font-size: 0.78rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.mdcms-studio-shell__meta-list {
  margin: 1rem 0 0;
  display: grid;
}

.mdcms-studio-shell__meta-row {
  display: grid;
  gap: 0.3rem;
  padding: 0.75rem 0;
  border-top: 1px solid rgba(197, 197, 216, 0.48);
}

.mdcms-studio-shell__meta-row:first-child {
  padding-top: 0;
  border-top: 0;
}

.mdcms-studio-shell__meta-value {
  font-family: "Geist Mono Variable", "Geist Mono", monospace;
  color: #1c1b1b;
  word-break: break-word;
}

@keyframes mdcms-studio-shell-pulse {
  0%, 100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

@keyframes mdcms-studio-shell-float {
  0%, 100% {
    transform: translate3d(0, 0, 0);
  }

  50% {
    transform: translate3d(0, -12px, 0);
  }
}

@keyframes mdcms-studio-shell-shimmer {
  0% {
    transform: translateX(-140%);
  }

  100% {
    transform: translateX(140%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mdcms-studio-shell__backdrop::before,
  .mdcms-studio-shell__backdrop::after,
  .mdcms-studio-shell__workspace-preview::after,
  .mdcms-studio-shell__skeleton-line,
  .mdcms-studio-shell__skeleton-bar,
  .mdcms-studio-shell__skeleton-card,
  .mdcms-studio-shell__sequence-dot {
    animation: none;
  }
}

@media (min-width: 640px) {
  .mdcms-studio-shell__frame {
    padding: 1.5rem;
  }

  .mdcms-studio-shell__panel {
    padding: 1.75rem;
  }

  .mdcms-studio-shell__header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }

  .mdcms-studio-shell__preview-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .mdcms-studio-shell__preview-layout {
    grid-template-columns: minmax(13rem, 0.72fr) minmax(0, 1.28fr);
  }
}

@media (min-width: 1024px) {
  .mdcms-studio-shell__frame {
    padding: 2rem;
  }

  .mdcms-studio-shell__panel {
    padding: 2rem;
  }

  .mdcms-studio-shell__content {
    grid-template-columns: minmax(0, 1.32fr) minmax(18rem, 0.82fr);
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
  loadingState = "initial",
  startupError,
  containerRef,
}: StudioShellFrameProps) {
  const describedError =
    startupState === "error"
      ? describeStudioStartupError(startupError)
      : undefined;
  const loadingDescription = LOADING_DESCRIPTIONS[loadingState];

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
                <div className="mdcms-studio-shell__brand-row">
                  <div
                    aria-hidden="true"
                    className="mdcms-studio-shell__brand-mark"
                  />
                  <div className="mdcms-studio-shell__brand-copy">
                    <p className="mdcms-studio-shell__brand-label">
                      MDCMS Studio
                    </p>
                    <h1 className="mdcms-studio-shell__brand-name">
                      Runtime shell
                    </h1>
                  </div>
                </div>
                <div className="mdcms-studio-shell__header-meta">
                  <span className="mdcms-studio-shell__brand-badge">
                    {config.project}
                  </span>
                  <span className="mdcms-studio-shell__path-chip">
                    {config.environment}
                  </span>
                  <span className="mdcms-studio-shell__path-chip">
                    {basePath}
                  </span>
                  {startupState === "loading" ? (
                    <span
                      className="mdcms-studio-shell__status-chip"
                      data-loading-state={loadingState}
                    >
                      {loadingState === "slow" ? "Still loading" : "Booting"}
                    </span>
                  ) : null}
                </div>
              </header>

              {startupState === "loading" ? (
                <div className="mdcms-studio-shell__content" aria-live="polite">
                  <div className="mdcms-studio-shell__hero">
                    <div className="mdcms-studio-shell__hero-copy">
                      <p className="mdcms-studio-shell__eyebrow">
                        {loadingDescription.eyebrow}
                      </p>
                      <h2 className="mdcms-studio-shell__display">
                        {loadingDescription.title}
                      </h2>
                      <p className="mdcms-studio-shell__copy">
                        {loadingDescription.summary}
                      </p>
                      {loadingDescription.note ? (
                        <p className="mdcms-studio-shell__note">
                          {loadingDescription.note}
                        </p>
                      ) : null}
                    </div>

                    <div className="mdcms-studio-shell__surface">
                      <div className="mdcms-studio-shell__workspace-preview">
                        <div className="mdcms-studio-shell__preview-toolbar">
                          <div className="mdcms-studio-shell__preview-stack">
                            <div className="mdcms-studio-shell__skeleton-line" />
                          </div>
                          <div className="mdcms-studio-shell__skeleton-line" />
                        </div>
                        <div className="mdcms-studio-shell__preview-layout">
                          <div className="mdcms-studio-shell__preview-sidebar">
                            <div className="mdcms-studio-shell__preview-stack">
                              <div className="mdcms-studio-shell__skeleton-line" />
                              <div className="mdcms-studio-shell__skeleton-bar" />
                              <div className="mdcms-studio-shell__skeleton-line" />
                            </div>
                          </div>
                          <div className="mdcms-studio-shell__preview-panel">
                            <div className="mdcms-studio-shell__preview-stack">
                              <div className="mdcms-studio-shell__skeleton-line" />
                              <div className="mdcms-studio-shell__skeleton-bar" />
                              <div className="mdcms-studio-shell__preview-card-grid">
                                <div className="mdcms-studio-shell__skeleton-card" />
                                <div className="mdcms-studio-shell__skeleton-card" />
                                <div className="mdcms-studio-shell__skeleton-card" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="mdcms-studio-shell__rail">
                    <p className="mdcms-studio-shell__section-label">
                      Startup sequence
                    </p>
                    <div className="mdcms-studio-shell__sequence-list">
                      {STARTUP_SEQUENCE.map((step) => (
                        <div
                          key={step.title}
                          className="mdcms-studio-shell__sequence-item"
                        >
                          <div className="mdcms-studio-shell__sequence-dot" />
                          <div className="mdcms-studio-shell__sequence-copy">
                            <p className="mdcms-studio-shell__sequence-title">
                              {step.title}
                            </p>
                            <p className="mdcms-studio-shell__sequence-detail">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mdcms-studio-shell__meta-card">
                      <p className="mdcms-studio-shell__section-label">
                        Startup note
                      </p>
                      <p className="mdcms-studio-shell__support-copy">
                        Studio starts automatically once the signed runtime is
                        ready. This screen is visual feedback only and does not
                        change bootstrap behavior.
                      </p>
                    </div>
                  </aside>
                </div>
              ) : describedError ? (
                <div role="alert" className="mdcms-studio-shell__content">
                  <div className="mdcms-studio-shell__hero">
                    <div className="mdcms-studio-shell__hero-copy">
                      <span className="mdcms-studio-shell__category-badge">
                        {describedError.categoryLabel}
                      </span>
                      <h2 className="mdcms-studio-shell__display">
                        {describedError.title}
                      </h2>
                      <div className="mdcms-studio-shell__summary-stack">
                        <p className="mdcms-studio-shell__summary">
                          {describedError.summary}
                        </p>
                        {describedError.note ? (
                          <p className="mdcms-studio-shell__note">
                            {describedError.note}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mdcms-studio-shell__surface mdcms-studio-shell__surface--error">
                      <p className="mdcms-studio-shell__support-copy">
                        Studio stopped before the remote runtime mounted. Review
                        the technical details below to diagnose the startup
                        boundary that failed.
                      </p>
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
                      </details>
                    </div>
                  </div>

                  <aside className="mdcms-studio-shell__rail">
                    <div className="mdcms-studio-shell__meta-card">
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
                    <div className="mdcms-studio-shell__meta-card">
                      <p className="mdcms-studio-shell__section-label">
                        Recovery
                      </p>
                      <p className="mdcms-studio-shell__support-copy">
                        Fix the startup issue on the configured backend or host
                        route, then refresh this Studio path to retry the same
                        bootstrap flow.
                      </p>
                    </div>
                  </aside>
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
  const [loadingState, setLoadingState] =
    useState<StudioLoadingState>("initial");
  const [startupError, setStartupError] = useState<unknown>();

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let isDisposed = false;
    let unmountRuntime: (() => void) | undefined;
    const slowStartTimer = window.setTimeout(() => {
      if (!isDisposed) {
        setLoadingState("slow");
      }
    }, STUDIO_SLOW_START_AFTER_MS);

    setStartupState("loading");
    setLoadingState("initial");
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
        window.clearTimeout(slowStartTimer);
        setStartupState("ready");
      })
      .catch((error: unknown) => {
        if (isDisposed) {
          return;
        }

        window.clearTimeout(slowStartTimer);
        setStartupError(error);
        setStartupState("error");
      });

    return () => {
      isDisposed = true;
      window.clearTimeout(slowStartTimer);
      unmountRuntime?.();
    };
  }, [auth, basePath, config, fetcher, hostBridge, loadRemoteModule]);

  return (
    <StudioShellFrame
      config={config}
      basePath={basePath}
      startupState={startupState}
      loadingState={loadingState}
      startupError={startupError}
      containerRef={containerRef}
    />
  );
}
