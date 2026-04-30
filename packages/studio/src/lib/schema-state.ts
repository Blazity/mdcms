import {
  RuntimeError,
  createEmptyCurrentPrincipalCapabilities,
  type CurrentPrincipalCapabilities,
  type SchemaRegistryEntry,
  type SchemaRegistrySyncPayload,
} from "@mdcms/shared";

import {
  createStudioCurrentPrincipalCapabilitiesApi,
  type StudioCurrentPrincipalCapabilitiesApi,
} from "./current-principal-capabilities-api.js";
import { resolveStudioDocumentRouteSchemaDetails } from "./document-route-schema.js";
import {
  createStudioSchemaRouteApi,
  type StudioSchemaRouteApi,
} from "./schema-route-api.js";
import type { MdcmsConfig } from "./studio-component.js";
import type { StudioRuntimeAuth } from "./request-auth.js";

export type StudioSchemaLoadingState = {
  status: "loading";
  message: string;
};

export type StudioSchemaReadyState = {
  status: "ready";
  project: string;
  environment: string;
  localSchemaHash?: string;
  serverSchemaHash?: string;
  isMismatch: boolean;
  hasLocalSyncPayload: boolean;
  canSync: boolean;
  capabilities: CurrentPrincipalCapabilities;
  entries: SchemaRegistryEntry[];
  syncPayload?: SchemaRegistrySyncPayload;
  syncError?: string;
  reload: () => Promise<StudioSchemaState>;
  sync: () => Promise<StudioSchemaState>;
};

export type StudioSchemaForbiddenState = {
  status: "forbidden";
  project: string;
  environment: string;
  message: string;
};

export type StudioSchemaErrorState = {
  status: "error";
  project: string;
  environment: string;
  message: string;
};

export type StudioSchemaProjectMismatchState = {
  status: "project-mismatch";
  configProject: string;
  serverProject: string;
  environment: string;
};

export type StudioSchemaState =
  | StudioSchemaLoadingState
  | StudioSchemaReadyState
  | StudioSchemaForbiddenState
  | StudioSchemaErrorState
  | StudioSchemaProjectMismatchState;

export type LoadStudioSchemaStateInput = {
  config: Pick<MdcmsConfig, "project" | "environment" | "serverUrl">;
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
  schemaApi?: StudioSchemaRouteApi;
  capabilitiesApi?: StudioCurrentPrincipalCapabilitiesApi;
  // Optional host-precomputed local schema hash. The host (Next.js page,
  // bundler script, etc.) typically computes the schema hash server-side
  // where the full authored config (with Zod types) is available. The
  // browser-side load is given a stripped config and cannot recompute the
  // hash itself, so without this hint the initial schema-state load reports
  // `localSchemaHash: undefined` and a real mismatch is only surfaced after
  // a write fails server-side. Pass the host hash here to detect mismatch
  // on first paint.
  precomputedLocalSchemaHash?: string;
};

function createSchemaRouteApi(
  input: LoadStudioSchemaStateInput,
): StudioSchemaRouteApi {
  if (input.schemaApi) {
    return input.schemaApi;
  }

  return createStudioSchemaRouteApi(
    {
      project: input.config.project,
      environment: input.config.environment,
      serverUrl: input.config.serverUrl,
    },
    {
      auth: input.auth,
      fetcher: input.fetcher,
    },
  );
}

function createCapabilitiesRouteApi(
  input: LoadStudioSchemaStateInput,
): StudioCurrentPrincipalCapabilitiesApi {
  if (input.capabilitiesApi) {
    return input.capabilitiesApi;
  }

  return createStudioCurrentPrincipalCapabilitiesApi(
    {
      project: input.config.project,
      environment: input.config.environment,
      serverUrl: input.config.serverUrl,
    },
    {
      auth: input.auth,
      fetcher: input.fetcher,
    },
  );
}

function normalizeServerSchemaHash(hash: string | null): string | undefined {
  if (typeof hash !== "string") {
    return undefined;
  }
  const trimmed = hash.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createReadyState(input: {
  project: string;
  environment: string;
  localSchemaHash?: string;
  serverSchemaHash?: string;
  syncPayload?: SchemaRegistrySyncPayload;
  capabilities: CurrentPrincipalCapabilities;
  syncError?: string;
  entries: SchemaRegistryEntry[];
  api: StudioSchemaRouteApi;
  reloadInput: LoadStudioSchemaStateInput;
}): StudioSchemaReadyState {
  const serverSchemaHash = input.serverSchemaHash;
  const isMismatch =
    input.localSchemaHash !== undefined &&
    serverSchemaHash !== undefined &&
    input.localSchemaHash !== serverSchemaHash;
  const hasLocalSyncPayload = input.syncPayload !== undefined;

  const state: StudioSchemaReadyState = {
    status: "ready",
    project: input.project,
    environment: input.environment,
    localSchemaHash: input.localSchemaHash,
    serverSchemaHash,
    isMismatch,
    hasLocalSyncPayload,
    canSync: hasLocalSyncPayload && input.capabilities.schema.write,
    capabilities: input.capabilities,
    entries: input.entries,
    ...(input.syncPayload ? { syncPayload: input.syncPayload } : {}),
    ...(input.syncError ? { syncError: input.syncError } : {}),
    reload: async () => loadStudioSchemaState(input.reloadInput),
    sync: async () => {
      if (!input.syncPayload) {
        return {
          ...state,
          syncError: "Studio cannot sync schema without local schema data.",
        };
      }

      if (!input.capabilities.schema.write) {
        return {
          ...state,
          syncError: "Current user is not allowed to sync schema.",
        };
      }

      try {
        await input.api.sync(input.syncPayload);
        return await loadStudioSchemaState(input.reloadInput);
      } catch (error) {
        const syncError =
          error instanceof Error ? error.message : "Schema sync failed.";

        return {
          ...state,
          syncError,
        };
      }
    },
  };

  return state;
}

function createForbiddenState(input: {
  project: string;
  environment: string;
  message: string;
}): StudioSchemaForbiddenState {
  return {
    status: "forbidden",
    project: input.project,
    environment: input.environment,
    message: input.message,
  };
}

function createErrorState(input: {
  project: string;
  environment: string;
  message: string;
}): StudioSchemaErrorState {
  return {
    status: "error",
    project: input.project,
    environment: input.environment,
    message: input.message,
  };
}

function toStateErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof RuntimeError && error.message.trim().length > 0) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function createStudioSchemaLoadingState(
  message = "Loading schema state.",
): StudioSchemaLoadingState {
  return {
    status: "loading",
    message,
  };
}

export async function loadStudioSchemaState(
  input: LoadStudioSchemaStateInput,
): Promise<StudioSchemaState> {
  const api = createSchemaRouteApi(input);
  const capabilitiesApi = createCapabilitiesRouteApi(input);
  const localDetails = await resolveStudioDocumentRouteSchemaDetails(
    input.config,
  );

  try {
    const listResult = await api.list();

    if (listResult.project && listResult.project !== input.config.project) {
      return {
        status: "project-mismatch",
        configProject: input.config.project,
        serverProject: listResult.project,
        environment: input.config.environment,
      };
    }

    const entries = listResult.types;
    const serverSchemaHash = normalizeServerSchemaHash(listResult.schemaHash);
    let capabilities = createEmptyCurrentPrincipalCapabilities();

    try {
      const response = await capabilitiesApi.get();
      capabilities = response.capabilities;
    } catch {
      capabilities = createEmptyCurrentPrincipalCapabilities();
    }

    // Prefer the host-derived hash (full config with types is available
    // server-side / at build time) over a stripped browser-side recompute.
    // If no host value was supplied and the browser-side derivation
    // succeeded, fall back to that. The syncPayload is only ever the
    // browser-side derivation — a precomputed hash without a payload is
    // enough to *detect* mismatch but not to *resolve* it via a sync from
    // the browser, which matches reality (sync requires the full authored
    // config and is owned by the host / CLI anyway).
    const precomputedLocalSchemaHash =
      typeof input.precomputedLocalSchemaHash === "string" &&
      input.precomputedLocalSchemaHash.length > 0
        ? input.precomputedLocalSchemaHash
        : undefined;
    const browserDerivedLocalSchemaHash = localDetails.canWrite
      ? localDetails.syncPayload.schemaHash
      : undefined;
    const localSchemaHash =
      precomputedLocalSchemaHash ?? browserDerivedLocalSchemaHash;

    return createReadyState({
      project: input.config.project,
      environment: input.config.environment,
      capabilities,
      ...(localSchemaHash ? { localSchemaHash } : {}),
      ...(localDetails.canWrite
        ? { syncPayload: localDetails.syncPayload }
        : {}),
      ...(serverSchemaHash ? { serverSchemaHash } : {}),
      entries,
      api,
      reloadInput: input,
    });
  } catch (error) {
    if (error instanceof RuntimeError && error.statusCode === 403) {
      return createForbiddenState({
        project: input.config.project,
        environment: input.config.environment,
        message: error.message,
      });
    }

    return createErrorState({
      project: input.config.project,
      environment: input.config.environment,
      message: toStateErrorMessage(error, "Failed to load schema state."),
    });
  }
}
