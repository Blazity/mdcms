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
import {
  readStoredThemePreference,
  resolveAppliedTheme,
} from "./runtime-ui/adapters/next-themes.js";

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

export type ShellAppliedTheme = "light" | "dark";

export type StudioShellFrameProps = {
  config: MdcmsConfig;
  basePath: string;
  startupState: StudioStartupState;
  startupError?: unknown;
  containerRef?: RefObject<HTMLDivElement | null>;
  shellTheme?: ShellAppliedTheme;
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

const LOADING_TITLE = "Loading Studio";
const LOADING_SUMMARY = "Fetching and validating the runtime bundle.";
const READY_CONTAINER_STYLE = {
  minHeight: "20rem",
} as const;

const STUDIO_SHELL_STYLES = `
.mdcms-studio-shell,
.mdcms-studio-shell * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.mdcms-studio-shell {
  --s-bg: #FCF9F8;
  --s-surface: #FFFFFF;
  --s-fg: #1C1B1B;
  --s-fg-muted: #444655;
  --s-primary: #2F49E5;
  --s-border: rgba(197, 197, 216, 0.25);
  --s-border-subtle: rgba(197, 197, 216, 0.15);
  --s-surface-inner: rgba(246, 243, 242, 0.6);
  --s-surface-inner-subtle: rgba(246, 243, 242, 0.4);
  --s-skeleton-strong: rgba(197, 197, 216, 0.3);
  --s-skeleton-mid: rgba(197, 197, 216, 0.2);
  --s-skeleton-soft: rgba(197, 197, 216, 0.14);
  --s-check-bg: rgba(47, 73, 229, 0.04);
  --s-destructive: #ef4444;
  --s-destructive-border: rgba(239, 68, 68, 0.2);
  --s-destructive-bg: rgba(239, 68, 68, 0.08);
  --s-warning: #f59e0b;
  --s-code-bg: #F0EDEC;
  --s-glow: rgba(47, 73, 229, 0.04);
  --s-path-bg: rgba(197, 197, 216, 0.1);
  --s-path-border: rgba(197, 197, 216, 0.18);
  color-scheme: light;

  position: fixed;
  inset: 0;
  z-index: 2147483000;
  isolation: isolate;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--s-bg);
  color: var(--s-fg);
  font-family: "Inter Variable", "Inter", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.mdcms-studio-shell[data-mdcms-theme="dark"] {
  --s-bg: #0C0C0E;
  --s-surface: #151518;
  --s-fg: #F5F4F4;
  --s-fg-muted: #A0A2B5;
  --s-primary: #5B72F5;
  --s-border: rgba(197, 197, 216, 0.15);
  --s-border-subtle: rgba(197, 197, 216, 0.08);
  --s-surface-inner: rgba(40, 40, 48, 0.6);
  --s-surface-inner-subtle: rgba(40, 40, 48, 0.4);
  --s-skeleton-strong: rgba(197, 197, 216, 0.14);
  --s-skeleton-mid: rgba(197, 197, 216, 0.09);
  --s-skeleton-soft: rgba(197, 197, 216, 0.06);
  --s-check-bg: rgba(91, 114, 245, 0.1);
  --s-destructive: #f87171;
  --s-destructive-border: rgba(248, 113, 113, 0.25);
  --s-destructive-bg: rgba(248, 113, 113, 0.1);
  --s-warning: #fbbf24;
  --s-code-bg: #1A1A1E;
  --s-glow: rgba(91, 114, 245, 0.08);
  --s-path-bg: rgba(197, 197, 216, 0.06);
  --s-path-border: rgba(197, 197, 216, 0.12);
  color-scheme: dark;
}

.mdcms-studio-shell__backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 60% 50% at 50% 0%, var(--s-glow), transparent);
}

.mdcms-studio-shell__frame {
  position: relative;
  display: flex;
  min-height: 100%;
  align-items: stretch;
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.25rem;
}

.mdcms-studio-shell__panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--s-border);
  border-radius: 0.75rem;
  background: var(--s-surface);
  padding: 1.5rem;
}

.mdcms-studio-shell__header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--s-border);
}

.mdcms-studio-shell__brand-group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.mdcms-studio-shell__brand-logo {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
}

.mdcms-studio-shell__brand-name {
  font-family: "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--s-fg);
}

.mdcms-studio-shell__path-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-family: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
  font-weight: 400;
  color: var(--s-fg-muted);
  background: var(--s-path-bg);
  border: 1px solid var(--s-path-border);
}

.mdcms-studio-shell__title {
  font-family: "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif;
  font-weight: 600;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
  color: var(--s-fg);
  margin-bottom: 0.375rem;
}

.mdcms-studio-shell__content {
  margin-top: 1.5rem;
  display: grid;
  gap: 1.25rem;
}

.mdcms-studio-shell__eyebrow,
.mdcms-studio-shell__section-label,
.mdcms-studio-shell__meta-label,
.mdcms-studio-shell__details-hint {
  font-family: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-fg-muted);
}

.mdcms-studio-shell__eyebrow {
  margin-bottom: 0.5rem;
}

.mdcms-studio-shell__copy,
.mdcms-studio-shell__summary {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--s-fg-muted);
  max-width: 36rem;
  margin-bottom: 1.25rem;
}

.mdcms-studio-shell__note {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--s-warning);
  max-width: 36rem;
  margin-bottom: 1rem;
}

.mdcms-studio-shell__check-text,
.mdcms-studio-shell__details-summary {
  font-size: 0.875rem;
  line-height: 1.5;
}

.mdcms-studio-shell__meta-value {
  font-family: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--s-fg);
  word-break: break-word;
}

.mdcms-studio-shell__surface,
.mdcms-studio-shell__aside,
.mdcms-studio-shell__details {
  border-radius: 0.5rem;
  border: 1px solid var(--s-border-subtle);
}

.mdcms-studio-shell__surface,
.mdcms-studio-shell__details {
  background: var(--s-surface-inner);
  padding: 1rem;
}

.mdcms-studio-shell__aside {
  background: var(--s-surface-inner-subtle);
  padding: 1rem;
}

.mdcms-studio-shell__skeleton-stack {
  display: grid;
  gap: 0.625rem;
}

.mdcms-studio-shell__skeleton-line,
.mdcms-studio-shell__skeleton-bar,
.mdcms-studio-shell__skeleton-card {
  animation: mdcms-shell-pulse 2s ease-in-out infinite;
}

.mdcms-studio-shell__skeleton-line {
  height: 0.625rem;
  width: 6rem;
  border-radius: 0.25rem;
  background: var(--s-skeleton-strong);
}

.mdcms-studio-shell__skeleton-bar {
  height: 2rem;
  width: 100%;
  border-radius: 0.375rem;
  background: var(--s-skeleton-mid);
}

.mdcms-studio-shell__skeleton-grid {
  display: grid;
  gap: 0.625rem;
}

.mdcms-studio-shell__skeleton-card {
  height: 5rem;
  border-radius: 0.375rem;
  background: var(--s-skeleton-soft);
}

.mdcms-studio-shell__skeleton-card:nth-child(2) {
  animation-delay: 0.15s;
}

.mdcms-studio-shell__skeleton-card:nth-child(3) {
  animation-delay: 0.3s;
}

.mdcms-studio-shell__check-list {
  display: grid;
  gap: 0.5rem;
}

.mdcms-studio-shell__check-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.375rem;
  background: var(--s-check-bg);
}

.mdcms-studio-shell__check-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--s-primary);
  animation: mdcms-shell-pulse 2s ease-in-out infinite;
}

.mdcms-studio-shell__check-item:nth-child(2) .mdcms-studio-shell__check-dot {
  animation-delay: 0.3s;
}

.mdcms-studio-shell__check-item:nth-child(3) .mdcms-studio-shell__check-dot {
  animation-delay: 0.6s;
}

.mdcms-studio-shell__check-text {
  color: var(--s-fg-muted);
}

.mdcms-studio-shell__category-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-family: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
  border: 1px solid var(--s-destructive-border);
  background: var(--s-destructive-bg);
  color: var(--s-destructive);
}

.mdcms-studio-shell__details {
  margin-top: 1.25rem;
}

.mdcms-studio-shell__details-summary {
  cursor: pointer;
  list-style: none;
  color: var(--s-fg);
  font-weight: 500;
}

.mdcms-studio-shell__details-summary::-webkit-details-marker {
  display: none;
}

.mdcms-studio-shell__details-summary-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.mdcms-studio-shell__details[open] .mdcms-studio-shell__details-hint {
  color: var(--s-primary);
}

.mdcms-studio-shell__details-pre {
  margin: 0.75rem 0 0;
  padding: 0.875rem;
  border-radius: 0.375rem;
  border: 1px solid var(--s-border-subtle);
  background: var(--s-code-bg);
  color: var(--s-fg-muted);
  font-family: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.mdcms-studio-shell__meta-list {
  margin: 0.75rem 0 0;
  display: grid;
}

.mdcms-studio-shell__meta-group {
  margin-top: 1rem;
}

.mdcms-studio-shell__meta-row {
  display: grid;
  gap: 0.25rem;
  padding: 0.625rem 0;
  border-top: 1px solid var(--s-border-subtle);
}

.mdcms-studio-shell__meta-row:first-child {
  padding-top: 0;
  border-top: 0;
}

@keyframes mdcms-shell-pulse {
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
    padding: 2rem;
  }

  .mdcms-studio-shell__header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .mdcms-studio-shell__skeleton-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .mdcms-studio-shell__frame {
    padding: 2.5rem;
  }

  .mdcms-studio-shell__panel {
    padding: 2.5rem;
  }

  .mdcms-studio-shell__content {
    grid-template-columns: 1.3fr 0.7fr;
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

export function resolveShellAppliedTheme(input: {
  storedThemeRaw: string | null;
  systemPrefersDark: boolean;
}): ShellAppliedTheme {
  const stored =
    input.storedThemeRaw === "light" ||
    input.storedThemeRaw === "dark" ||
    input.storedThemeRaw === "system"
      ? input.storedThemeRaw
      : null;

  return resolveAppliedTheme(stored ?? "system", input.systemPrefersDark);
}

function useResolvedShellTheme(): ShellAppliedTheme {
  const [applied, setApplied] = useState<ShellAppliedTheme>("light");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const storage = window.localStorage ?? null;

    const recompute = () => {
      const stored = readStoredThemePreference(storage);
      setApplied(resolveAppliedTheme(stored ?? "system", mediaQuery.matches));
    };

    recompute();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", recompute);
      return () => {
        mediaQuery.removeEventListener("change", recompute);
      };
    }

    mediaQuery.addListener(recompute);
    return () => {
      mediaQuery.removeListener(recompute);
    };
  }, []);

  return applied;
}

export function StudioShellFrame({
  config,
  basePath,
  startupState,
  startupError,
  containerRef,
  shellTheme = "light",
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
      data-mdcms-theme={shellTheme}
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
                  <svg
                    className="mdcms-studio-shell__brand-logo"
                    viewBox="0 4 35 35"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <mask
                      id="mdcms-shell-logo-m"
                      style={{ maskType: "luminance" }}
                      maskUnits="userSpaceOnUse"
                      x="0"
                      y="4"
                      width="35"
                      height="35"
                    >
                      <path
                        d="M0 4.01196H34.3316V38.1987H0V4.01196Z"
                        fill="white"
                      />
                    </mask>
                    <g mask="url(#mdcms-shell-logo-m)">
                      <path
                        d="M17.4954 19.8468C16.8523 19.7988 16.5695 19.8252 16.0137 20.1448C13.9577 21.3269 11.8896 22.4902 9.84301 23.6884C8.71035 24.3515 8.86327 25.4939 8.86856 26.6135L8.87323 29.049L8.86754 31.4129C8.86208 33.6365 8.87086 33.7353 10.8305 34.8569L12.7272 35.9412C13.5772 36.4271 16.0648 37.9743 16.7961 38.1227C17.4032 38.1839 17.7316 38.1169 18.2555 37.8171C20.2878 36.6538 22.3256 35.499 24.3513 34.3245C25.5248 33.644 25.3944 32.6758 25.3941 31.522L25.3915 28.8691L25.396 26.5205C25.4007 24.3233 25.3797 24.2285 23.4707 23.1348L21.5627 22.0412L19.3001 20.7437C18.7928 20.4531 18.047 19.9646 17.4954 19.8468Z"
                        fill="currentColor"
                      />
                      <path
                        d="M26.4326 4.08956C25.8135 4.03531 25.4981 4.07102 24.9624 4.38156C23.0193 5.50784 21.084 6.64735 19.1433 7.77787C18.6139 8.08624 18.1508 8.4779 18.0124 9.10786C17.8664 9.77215 17.9212 10.5397 17.9239 11.2234L17.9247 13.6338L17.921 15.6797C17.9197 16.4984 17.8187 17.4363 18.3987 18.0931C18.766 18.509 19.2648 18.7439 19.7366 19.0229C20.2456 19.3238 20.7602 19.6176 21.2709 19.9157L23.6489 21.307C24.1935 21.6256 25.092 22.2074 25.6525 22.359C26.5274 22.4342 26.7078 22.3363 27.436 21.9116L31.5337 19.5176C31.9048 19.301 33.2517 18.5452 33.5247 18.301C33.809 18.0485 34.0095 17.7153 34.0996 17.3458C34.2306 16.8302 34.1905 15.8811 34.1881 15.3182L34.1869 12.9892L34.1909 10.8318C34.1941 8.63869 34.2067 8.49732 32.3014 7.38407L30.5377 6.35429L28.3471 5.07312C27.8022 4.75331 27.0227 4.23424 26.4326 4.08956Z"
                        fill="#CAF240"
                      />
                      <path
                        d="M8.58217 4.09055C7.9301 4.03424 7.61858 4.07788 7.05481 4.40779C5.09063 5.5562 3.12254 6.6993 1.1626 7.85475C0.628794 8.16937 0.310829 8.51792 0.146414 9.13369C0.101146 9.30918 0.0754332 9.48911 0.0692766 9.67022C0.0174895 10.8607 0.0739828 12.4295 0.0721723 13.6712L0.0681892 15.7221C0.062757 17.8453 0.0895542 17.9803 1.90428 19.0366L3.63425 20.0439L5.9733 21.413C6.50528 21.7242 7.23024 22.2109 7.80661 22.3603C8.5945 22.4512 8.87405 22.3186 9.52562 21.9424L13.5603 19.5843C14.0662 19.2898 14.6172 18.9422 15.1248 18.67C16.5527 17.9041 16.3376 16.7588 16.3309 15.3383L16.3291 13.0458L16.3337 10.8074C16.3349 10.0947 16.4178 9.24654 16.0423 8.6199C15.9028 8.38554 15.7166 8.18226 15.4955 8.02259C15.2008 7.8081 14.7526 7.56378 14.4259 7.37299L12.6291 6.32531C11.4588 5.64323 10.2823 4.93464 9.099 4.27731C8.93579 4.18663 8.763 4.13495 8.58217 4.09055Z"
                        fill="#2F49E5"
                      />
                    </g>
                  </svg>
                  <h1 className="mdcms-studio-shell__brand-name">
                    MDCMS Studio
                  </h1>
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
                        "Resolving runtime bundle",
                        "Verifying bundle integrity",
                        "Initializing runtime",
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
  const shellTheme = useResolvedShellTheme();

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
      shellTheme={shellTheme}
    />
  );
}
