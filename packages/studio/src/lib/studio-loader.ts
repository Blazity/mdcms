import {
  HOST_BRIDGE_VERSION,
  RuntimeError,
  assertRemoteStudioModule,
  assertStudioBootstrapReadyResponse,
  assertStudioMountContext,
  isRuntimeErrorLike,
  type ErrorEnvelope,
  type HostBridgeV1,
  type StudioBootstrapReadyResponse,
  type StudioBootstrapRejectionReason,
  type StudioMountContext,
} from "@mdcms/shared";

import { assertStudioRuntimePublication } from "./bootstrap-verification.js";
import type { StudioEmbedConfig } from "./studio.js";

export const STUDIO_PACKAGE_VERSION = "0.0.1";
export const STUDIO_HOST_BRIDGE_COMPATIBILITY_VERSION = "1.0.0";

export type MdcmsConfig = StudioEmbedConfig;

export type StudioLoaderOptions = {
  config: MdcmsConfig;
  basePath: string;
  container: unknown;
  auth?: StudioMountContext["auth"];
  hostBridge?: HostBridgeV1;
  fetcher?: typeof fetch;
  loadRemoteModule?: (entryUrl: string) => Promise<unknown>;
};

type StudioBootstrapRetryContext = {
  rejectedBuildId: string;
  rejectionReason: StudioBootstrapRejectionReason;
};

function normalizeBaseUrl(serverUrl: string): string {
  return serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
}

function resolveUrl(pathOrUrl: string, apiBaseUrl: string): string {
  return new URL(pathOrUrl, `${apiBaseUrl}/`).href;
}

function resolveBootstrapUrl(
  apiBaseUrl: string,
  retry?: StudioBootstrapRetryContext,
): string {
  const url = new URL("/api/v1/studio/bootstrap", `${apiBaseUrl}/`);

  if (retry) {
    url.searchParams.set("rejectedBuildId", retry.rejectedBuildId);
    url.searchParams.set("rejectionReason", retry.rejectionReason);
  }

  return url.href;
}

function createDefaultHostBridge(): HostBridgeV1 {
  return {
    version: HOST_BRIDGE_VERSION,
    resolveComponent: () => null,
    renderMdxPreview: () => () => {},
  };
}

function readBrowserOrigin(): string | undefined {
  const origin = globalThis.location?.origin;

  return typeof origin === "string" && origin.trim().length > 0
    ? origin.trim()
    : undefined;
}

function createStudioLoadFailure(input: {
  code: string;
  phase: "bootstrap fetch" | "runtime asset fetch" | "runtime module import";
  url: string;
  error: unknown;
}): RuntimeError {
  const browserOrigin = readBrowserOrigin();
  const requestedOrigin = new URL(input.url).origin;
  const causeMessage =
    input.error instanceof Error ? input.error.message : String(input.error);
  const isCrossOrigin =
    browserOrigin !== undefined && browserOrigin !== requestedOrigin;
  const message = isCrossOrigin
    ? [
        `Failed to load Studio ${input.phase} from ${input.url}.`,
        `The browser blocked a cross-origin request from ${browserOrigin} to ${requestedOrigin}.`,
        "Check CORS or proxy the Studio backend through the host app.",
      ].join("\n")
    : [`Failed to load Studio ${input.phase} from ${input.url}.`, causeMessage]
        .filter((part) => part.length > 0)
        .join("\n");

  return new RuntimeError({
    code: input.code,
    message,
    statusCode: 500,
    details: {
      url: input.url,
      phase: input.phase,
      browserOrigin: browserOrigin ?? null,
      requestedOrigin,
      causeMessage,
      isCrossOrigin,
    },
  });
}

async function defaultLoadRemoteModule(entryUrl: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ entryUrl);
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.status === "error" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.timestamp === "string"
  );
}

async function fetchStudioBootstrapReadyResponse(input: {
  apiBaseUrl: string;
  fetcher: typeof fetch;
  retry?: StudioBootstrapRetryContext;
}): Promise<StudioBootstrapReadyResponse> {
  const bootstrapUrl = resolveBootstrapUrl(input.apiBaseUrl, input.retry);
  let bootstrapResponse: Response;

  try {
    bootstrapResponse = await input.fetcher(bootstrapUrl);
  } catch (error) {
    throw createStudioLoadFailure({
      code: "STUDIO_BOOTSTRAP_FETCH_FAILED",
      phase: "bootstrap fetch",
      url: bootstrapUrl,
      error,
    });
  }

  if (!bootstrapResponse.ok) {
    let responseBody: unknown;

    try {
      responseBody = await bootstrapResponse.json();
    } catch {
      responseBody = undefined;
    }

    if (isErrorEnvelope(responseBody)) {
      throw new RuntimeError({
        code: responseBody.code,
        message: responseBody.message,
        statusCode: bootstrapResponse.status || 500,
        details: responseBody.details,
      });
    }

    throw new RuntimeError({
      code: "STUDIO_BOOTSTRAP_FETCH_FAILED",
      message: `Failed to fetch Studio bootstrap manifest from ${bootstrapUrl}.`,
      statusCode: bootstrapResponse.status || 500,
      details: {
        url: bootstrapUrl,
        status: bootstrapResponse.status,
      },
    });
  }

  const bootstrapPayload = (await bootstrapResponse.json()) as unknown;
  assertStudioBootstrapReadyResponse(bootstrapPayload);

  return bootstrapPayload;
}

function classifyStudioBootstrapRetry(
  error: unknown,
  buildId: string,
): StudioBootstrapRetryContext | undefined {
  if (!isRuntimeErrorLike(error)) {
    return undefined;
  }

  if (error.code === "STUDIO_RUNTIME_INTEGRITY_MISMATCH") {
    return {
      rejectedBuildId: buildId,
      rejectionReason: "integrity",
    };
  }

  if (
    error.code === "INVALID_STUDIO_RUNTIME_SIGNATURE" ||
    error.code === "INVALID_STUDIO_RUNTIME_KEY_ID"
  ) {
    return {
      rejectedBuildId: buildId,
      rejectionReason: "signature",
    };
  }

  if (error.code === "INCOMPATIBLE_STUDIO_BOOTSTRAP_MANIFEST") {
    return {
      rejectedBuildId: buildId,
      rejectionReason: "compatibility",
    };
  }

  return undefined;
}

async function loadStudioRuntimeFromBootstrap(
  options: StudioLoaderOptions,
  input: {
    apiBaseUrl: string;
    fetcher: typeof fetch;
    bootstrapResponse: StudioBootstrapReadyResponse;
  },
): Promise<() => void> {
  const manifest = input.bootstrapResponse.data.manifest;
  const runtimeUrl = resolveUrl(manifest.entryUrl, input.apiBaseUrl);
  let runtimeResponse: Response;

  try {
    runtimeResponse = await input.fetcher(runtimeUrl);
  } catch (error) {
    throw createStudioLoadFailure({
      code: "STUDIO_RUNTIME_ASSET_LOAD_FAILED",
      phase: "runtime asset fetch",
      url: runtimeUrl,
      error,
    });
  }

  if (!runtimeResponse.ok) {
    throw new RuntimeError({
      code: "STUDIO_RUNTIME_ASSET_LOAD_FAILED",
      message: `Failed to fetch Studio runtime asset from ${runtimeUrl}.`,
      statusCode: runtimeResponse.status || 500,
      details: {
        url: runtimeUrl,
        status: runtimeResponse.status,
      },
    });
  }

  const runtimeBytes = new Uint8Array(await runtimeResponse.arrayBuffer());
  await assertStudioRuntimePublication({
    manifest,
    runtimeBytes,
    compatibility: {
      studioPackageVersion: STUDIO_PACKAGE_VERSION,
      hostBridgeVersion: STUDIO_HOST_BRIDGE_COMPATIBILITY_VERSION,
    },
  });

  const mountContext: StudioMountContext = {
    apiBaseUrl: input.apiBaseUrl,
    basePath: options.basePath,
    auth: options.auth ?? { mode: "cookie" },
    hostBridge: options.hostBridge ?? createDefaultHostBridge(),
  };
  assertStudioMountContext(mountContext);

  let remoteModule: unknown;

  try {
    remoteModule = await (options.loadRemoteModule ?? defaultLoadRemoteModule)(
      runtimeUrl,
    );
  } catch (error) {
    throw createStudioLoadFailure({
      code: "STUDIO_RUNTIME_ASSET_LOAD_FAILED",
      phase: "runtime module import",
      url: runtimeUrl,
      error,
    });
  }

  assertRemoteStudioModule(remoteModule);

  const unmount = remoteModule.mount(options.container, mountContext);

  if (typeof unmount !== "function") {
    throw new RuntimeError({
      code: "INVALID_STUDIO_RUNTIME_CONTRACT",
      message: "remoteStudioModule.mount must return an unmount function.",
      statusCode: 500,
    });
  }

  return unmount;
}

export async function loadStudioRuntime(
  options: StudioLoaderOptions,
): Promise<() => void> {
  const apiBaseUrl = normalizeBaseUrl(options.config.serverUrl);
  const fetcher = options.fetcher ?? fetch;
  const bootstrapResponse = await fetchStudioBootstrapReadyResponse({
    apiBaseUrl,
    fetcher,
  });

  try {
    return await loadStudioRuntimeFromBootstrap(options, {
      apiBaseUrl,
      fetcher,
      bootstrapResponse,
    });
  } catch (error) {
    const retry = classifyStudioBootstrapRetry(
      error,
      bootstrapResponse.data.manifest.buildId,
    );

    if (!retry) {
      throw error;
    }

    const fallbackBootstrapResponse = await fetchStudioBootstrapReadyResponse({
      apiBaseUrl,
      fetcher,
      retry,
    });

    return loadStudioRuntimeFromBootstrap(options, {
      apiBaseUrl,
      fetcher,
      bootstrapResponse: fallbackBootstrapResponse,
    });
  }
}
