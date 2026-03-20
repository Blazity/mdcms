import {
  HOST_BRIDGE_VERSION,
  RuntimeError,
  assertRemoteStudioModule,
  assertStudioBootstrapManifest,
  assertStudioMountContext,
  type HostBridgeV1,
  type MdcmsConfig as SharedMdcmsConfig,
  type StudioMountContext,
} from "@mdcms/shared";

import { assertStudioRuntimePublication } from "./bootstrap-verification.js";

export const STUDIO_PACKAGE_VERSION = "0.0.1";
export const STUDIO_HOST_BRIDGE_COMPATIBILITY_VERSION = "1.0.0";

export type MdcmsConfig = SharedMdcmsConfig & {
  environment: string;
};

export type StudioLoaderOptions = {
  config: MdcmsConfig;
  basePath: string;
  container: unknown;
  auth?: StudioMountContext["auth"];
  hostBridge?: HostBridgeV1;
  fetcher?: typeof fetch;
  loadRemoteModule?: (entryUrl: string) => Promise<unknown>;
};

function normalizeBaseUrl(serverUrl: string): string {
  return serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
}

function resolveUrl(pathOrUrl: string, apiBaseUrl: string): string {
  return new URL(pathOrUrl, `${apiBaseUrl}/`).href;
}

function createDefaultHostBridge(): HostBridgeV1 {
  return {
    version: HOST_BRIDGE_VERSION,
    resolveComponent: () => null,
    renderMdxPreview: () => () => {},
  };
}

async function defaultLoadRemoteModule(entryUrl: string): Promise<unknown> {
  return import(/* @vite-ignore */ entryUrl);
}

export async function loadStudioRuntime(
  options: StudioLoaderOptions,
): Promise<() => void> {
  const apiBaseUrl = normalizeBaseUrl(options.config.serverUrl);
  const fetcher = options.fetcher ?? fetch;
  const bootstrapUrl = resolveUrl("/api/v1/studio/bootstrap", apiBaseUrl);
  const bootstrapResponse = await fetcher(bootstrapUrl);

  if (!bootstrapResponse.ok) {
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

  const bootstrapPayload = (await bootstrapResponse.json()) as {
    data?: unknown;
  };
  assertStudioBootstrapManifest(bootstrapPayload.data);

  const manifest = bootstrapPayload.data;
  const runtimeUrl = resolveUrl(manifest.entryUrl, apiBaseUrl);
  const runtimeResponse = await fetcher(runtimeUrl);

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
  assertStudioRuntimePublication({
    manifest,
    runtimeBytes,
    compatibility: {
      studioPackageVersion: STUDIO_PACKAGE_VERSION,
      hostBridgeVersion: STUDIO_HOST_BRIDGE_COMPATIBILITY_VERSION,
    },
  });

  const mountContext: StudioMountContext = {
    apiBaseUrl,
    basePath: options.basePath,
    auth: options.auth ?? { mode: "cookie" },
    hostBridge: options.hostBridge ?? createDefaultHostBridge(),
  };
  assertStudioMountContext(mountContext);

  const remoteModule = await (
    options.loadRemoteModule ?? defaultLoadRemoteModule
  )(runtimeUrl);
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
