import {
  RuntimeError,
  type SchemaRegistryEntry,
  type SchemaRegistrySyncPayload,
} from "@mdcms/shared";

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
  canSync: boolean;
  entries: SchemaRegistryEntry[];
  syncPayload?: SchemaRegistrySyncPayload;
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

export type StudioSchemaState =
  | StudioSchemaLoadingState
  | StudioSchemaReadyState
  | StudioSchemaForbiddenState
  | StudioSchemaErrorState;

export type LoadStudioSchemaStateInput = {
  config: Pick<MdcmsConfig, "project" | "environment" | "serverUrl">;
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
  schemaApi?: StudioSchemaRouteApi;
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

function getSchemaHash(entries: SchemaRegistryEntry[]): string | undefined {
  const firstHash = entries[0]?.schemaHash?.trim();

  if (!firstHash) {
    return undefined;
  }

  const hasMismatch = entries.some(
    (entry) =>
      entry.schemaHash.trim().length > 0 && entry.schemaHash !== firstHash,
  );

  if (hasMismatch) {
    throw new RuntimeError({
      code: "SCHEMA_ROUTE_RESPONSE_INVALID",
      message: "Schema registry entries returned inconsistent schema hashes.",
      statusCode: 500,
      details: {
        schemaHashes: Array.from(
          new Set(entries.map((entry) => entry.schemaHash)),
        ),
      },
    });
  }

  return firstHash;
}

function createReadyState(input: {
  project: string;
  environment: string;
  localSchemaHash?: string;
  syncPayload?: SchemaRegistrySyncPayload;
  entries: SchemaRegistryEntry[];
  api: StudioSchemaRouteApi;
  reloadInput: LoadStudioSchemaStateInput;
}): StudioSchemaReadyState {
  const serverSchemaHash = getSchemaHash(input.entries);
  const isMismatch =
    input.localSchemaHash !== undefined &&
    serverSchemaHash !== undefined &&
    input.localSchemaHash !== serverSchemaHash;

  return {
    status: "ready",
    project: input.project,
    environment: input.environment,
    localSchemaHash: input.localSchemaHash,
    serverSchemaHash,
    isMismatch,
    canSync: input.syncPayload !== undefined,
    entries: input.entries,
    ...(input.syncPayload ? { syncPayload: input.syncPayload } : {}),
    reload: async () => loadStudioSchemaState(input.reloadInput),
    sync: async () => {
      if (!input.syncPayload) {
        return {
          status: "error",
          project: input.project,
          environment: input.environment,
          message: "Studio cannot sync schema without local schema data.",
        };
      }

      try {
        await input.api.sync(input.syncPayload);
        return await loadStudioSchemaState(input.reloadInput);
      } catch (error) {
        if (error instanceof RuntimeError && error.statusCode === 403) {
          return {
            status: "forbidden",
            project: input.project,
            environment: input.environment,
            message: error.message,
          };
        }

        return {
          status: "error",
          project: input.project,
          environment: input.environment,
          message:
            error instanceof Error ? error.message : "Schema sync failed.",
        };
      }
    },
  };
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
  const localDetails = await resolveStudioDocumentRouteSchemaDetails(
    input.config,
  );

  if (!localDetails.canWrite) {
    return createErrorState({
      project: input.config.project,
      environment: input.config.environment,
      message: localDetails.message,
    });
  }

  try {
    const entries = await api.list();

    return createReadyState({
      project: input.config.project,
      environment: input.config.environment,
      localSchemaHash: localDetails.syncPayload.schemaHash,
      syncPayload: localDetails.syncPayload,
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
