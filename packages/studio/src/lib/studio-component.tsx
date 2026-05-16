"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

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
  STUDIO_THEME_STORAGE_KEY,
} from "./runtime-ui/adapters/next-themes.js";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const SHELL_THEME_INLINE_SCRIPT = `(function(){try{var el=document.currentScript&&document.currentScript.parentElement;if(!el)return;var s=null;try{s=window.localStorage&&window.localStorage.getItem(${JSON.stringify(STUDIO_THEME_STORAGE_KEY)});}catch(_){}var p=s==="light"||s==="dark"||s==="system"?s:"system";var r=p==="light"||p==="dark"?p:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(el.getAttribute("data-mdcms-theme")!==r){el.setAttribute("data-mdcms-theme",r);}}catch(_){}})();`;

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

  useIsomorphicLayoutEffect(() => {
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
      setApplied((prev) => {
        const next = resolveAppliedTheme(
          stored ?? "system",
          mediaQuery.matches,
        );
        return prev === next ? prev : next;
      });
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
      suppressHydrationWarning
    >
      {/* SHELL_THEME_INLINE_SCRIPT is a hardcoded module constant: it reads
       * the dark/light preference cookie and applies the theme class before
       * the runtime hydrates, preventing a flash of incorrect theme. The
       * payload contains no user input and never touches network data. */}
      <script dangerouslySetInnerHTML={{ __html: SHELL_THEME_INLINE_SCRIPT }} />
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
                      <path d="M0 4.01H34.33V38.2H0V4.01Z" fill="white" />
                    </mask>
                    <g mask="url(#mdcms-shell-logo-m)">
                      <path
                        d="M17.5 19.85C16.85 19.8 16.57 19.83 16.01 20.14C13.96 21.33 11.89 22.49 9.84 23.69C8.71 24.35 8.86 25.49 8.87 26.61L8.87 29.05L8.87 31.41C8.86 33.64 8.87 33.74 10.83 34.86L12.73 35.94C13.58 36.43 16.06 37.97 16.8 38.12C17.4 38.18 17.73 38.12 18.26 37.82C20.29 36.65 22.33 35.5 24.35 34.32C25.52 33.64 25.39 32.68 25.39 31.52L25.39 28.87L25.4 26.52C25.4 24.32 25.38 24.23 23.47 23.13L21.56 22.04L19.3 20.74C18.79 20.45 18.05 19.96 17.5 19.85Z"
                        fill="currentColor"
                      />
                      <path
                        d="M26.43 4.09C25.81 4.04 25.5 4.07 24.96 4.38C23.02 5.51 21.08 6.65 19.14 7.78C18.61 8.09 18.15 8.48 18.01 9.11C17.87 9.77 17.92 10.54 17.92 11.22L17.92 13.63L17.92 15.68C17.92 16.5 17.82 17.44 18.4 18.09C18.77 18.51 19.26 18.74 19.74 19.02C20.25 19.32 20.76 19.62 21.27 19.92L23.65 21.31C24.19 21.63 25.09 22.21 25.65 22.36C26.53 22.43 26.71 22.34 27.44 21.91L31.53 19.52C31.9 19.3 33.25 18.55 33.52 18.3C33.81 18.05 34.01 17.72 34.1 17.35C34.23 16.83 34.19 15.88 34.19 15.32L34.19 12.99L34.19 10.83C34.19 8.64 34.21 8.5 32.3 7.38L30.54 6.35L28.35 5.07C27.8 4.75 27.02 4.23 26.43 4.09Z"
                        fill="#CAF240"
                      />
                      <path
                        d="M8.58 4.09C7.93 4.03 7.62 4.08 7.05 4.41C5.09 5.56 3.12 6.7 1.16 7.85C0.63 8.17 0.31 8.52 0.15 9.13C0.1 9.31 0.08 9.49 0.07 9.67C0.02 10.86 0.07 12.43 0.07 13.67L0.07 15.72C0.06 17.85 0.09 17.98 1.9 19.04L3.63 20.04L5.97 21.41C6.51 21.72 7.23 22.21 7.81 22.36C8.59 22.45 8.87 22.32 9.53 21.94L13.56 19.58C14.07 19.29 14.62 18.94 15.12 18.67C16.55 17.9 16.34 16.76 16.33 15.34L16.33 13.05L16.33 10.81C16.33 10.09 16.42 9.25 16.04 8.62C15.9 8.39 15.72 8.18 15.5 8.02C15.2 7.81 14.75 7.56 14.43 7.37L12.63 6.33C11.46 5.64 10.28 4.93 9.1 4.28C8.94 4.19 8.76 4.13 8.58 4.09Z"
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
