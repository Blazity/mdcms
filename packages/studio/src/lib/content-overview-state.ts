import { RuntimeError, type CurrentPrincipalCapabilities } from "@mdcms/shared";

import {
  createStudioContentListApi,
  type StudioContentListApi,
} from "./content-list-api.js";
import {
  createStudioContentOverviewApi,
  type StudioContentOverviewApi,
} from "./content-overview-api.js";
import {
  createStudioCurrentPrincipalCapabilitiesApi,
  type StudioCurrentPrincipalCapabilitiesApi,
} from "./current-principal-capabilities-api.js";
import {
  createStudioSchemaRouteApi,
  type StudioSchemaRouteApi,
} from "./schema-route-api.js";
import type { StudioRuntimeAuth } from "./request-auth.js";
import type { MdcmsConfig } from "./studio-component.js";

export type StudioContentOverviewMetricId =
  | "documents"
  | "published"
  | "withDrafts";

export type StudioContentOverviewMetric = {
  id: StudioContentOverviewMetricId;
  label: string;
  value: number;
};

export type StudioContentOverviewEntry = {
  type: string;
  directory: string;
  localized: boolean;
  locales?: string[];
  canNavigate: boolean;
  metrics: StudioContentOverviewMetric[];
};

export type StudioContentOverviewLoadingState = {
  status: "loading";
  message: string;
};

export type StudioContentOverviewReadyState = {
  status: "ready";
  project: string;
  environment: string;
  entries: StudioContentOverviewEntry[];
};

export type StudioContentOverviewPermissionConstrainedState = {
  status: "permission-constrained";
  project: string;
  environment: string;
  message: string;
  entries: StudioContentOverviewEntry[];
};

export type StudioContentOverviewForbiddenState = {
  status: "forbidden";
  project: string;
  environment: string;
  message: string;
};

export type StudioContentOverviewErrorState = {
  status: "error";
  project: string;
  environment: string;
  message: string;
};

export type StudioContentOverviewState =
  | StudioContentOverviewLoadingState
  | StudioContentOverviewReadyState
  | StudioContentOverviewPermissionConstrainedState
  | StudioContentOverviewForbiddenState
  | StudioContentOverviewErrorState;

export type LoadStudioContentOverviewStateInput = {
  config: Pick<MdcmsConfig, "project" | "environment" | "serverUrl"> & {
    supportedLocales?: string[];
  };
  auth?: StudioRuntimeAuth;
  fetcher?: typeof fetch;
  schemaApi?: StudioSchemaRouteApi;
  capabilitiesApi?: StudioCurrentPrincipalCapabilitiesApi;
  contentOverviewApi?: StudioContentOverviewApi;
  contentApi?: StudioContentListApi;
};

function createSchemaApi(
  input: LoadStudioContentOverviewStateInput,
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

function createCapabilitiesApi(
  input: LoadStudioContentOverviewStateInput,
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

function createContentApi(
  input: LoadStudioContentOverviewStateInput,
): StudioContentListApi {
  if (input.contentApi) {
    return input.contentApi;
  }

  return createStudioContentListApi(
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

function createContentOverviewApi(
  input: LoadStudioContentOverviewStateInput,
): StudioContentOverviewApi {
  if (input.contentOverviewApi) {
    return input.contentOverviewApi;
  }

  return createStudioContentOverviewApi(
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

function canReadAnyContent(
  capabilities: CurrentPrincipalCapabilities,
): boolean {
  return capabilities.content.read || capabilities.content.readDraft;
}

function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof RuntimeError &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
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

function createOverviewEntry(input: {
  type: string;
  directory: string;
  localized: boolean;
  locales?: string[];
  canNavigate: boolean;
  metrics?: StudioContentOverviewMetric[];
}): StudioContentOverviewEntry {
  return {
    type: input.type,
    directory: input.directory,
    localized: input.localized,
    ...(input.locales && input.locales.length > 0
      ? { locales: input.locales }
      : {}),
    canNavigate: input.canNavigate,
    metrics: input.metrics ?? [],
  };
}

function createReadyState(input: {
  project: string;
  environment: string;
  entries: StudioContentOverviewEntry[];
}): StudioContentOverviewReadyState {
  return {
    status: "ready",
    project: input.project,
    environment: input.environment,
    entries: input.entries,
  };
}

function createPermissionConstrainedState(input: {
  project: string;
  environment: string;
  entries: StudioContentOverviewEntry[];
}): StudioContentOverviewPermissionConstrainedState {
  return {
    status: "permission-constrained",
    project: input.project,
    environment: input.environment,
    message:
      "You can inspect schema types here, but you do not have permission to read content counts.",
    entries: input.entries,
  };
}

function createForbiddenState(input: {
  project: string;
  environment: string;
  message: string;
}): StudioContentOverviewForbiddenState {
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
}): StudioContentOverviewErrorState {
  return {
    status: "error",
    project: input.project,
    environment: input.environment,
    message: input.message,
  };
}

function sortEntries(entries: StudioContentOverviewEntry[]) {
  return [...entries].sort((left, right) =>
    left.type.localeCompare(right.type),
  );
}

async function loadEntryMetrics(input: {
  type: string;
  capabilities: CurrentPrincipalCapabilities;
  contentApi: StudioContentListApi;
}): Promise<StudioContentOverviewMetric[]> {
  if (!input.capabilities.content.readDraft) {
    return [];
  }

  const [documents, published, drafts] = await Promise.all([
    input.contentApi.list({
      type: input.type,
      draft: true,
      limit: 1,
    }),
    input.contentApi.list({
      type: input.type,
      draft: true,
      published: true,
      limit: 1,
    }),
    input.contentApi.list({
      type: input.type,
      draft: true,
      published: false,
      limit: 1,
    }),
  ]);

  return [
    {
      id: "documents",
      label: "Documents",
      value: documents.pagination.total,
    },
    {
      id: "published",
      label: "Published",
      value: published.pagination.total,
    },
    {
      id: "withDrafts",
      label: "Drafts",
      value: drafts.pagination.total,
    },
  ];
}

function createMetricsFromOverviewCounts(input: {
  total: number;
  published: number;
  drafts: number;
}): StudioContentOverviewMetric[] {
  return [
    {
      id: "documents",
      label: "Documents",
      value: input.total,
    },
    {
      id: "published",
      label: "Published",
      value: input.published,
    },
    {
      id: "withDrafts",
      label: "Drafts",
      value: input.drafts,
    },
  ];
}

export function createStudioContentOverviewLoadingState(
  message = "Loading content overview.",
): StudioContentOverviewLoadingState {
  return {
    status: "loading",
    message,
  };
}

export async function loadStudioContentOverviewState(
  input: LoadStudioContentOverviewStateInput,
): Promise<StudioContentOverviewState> {
  const capabilitiesApi = createCapabilitiesApi(input);
  const schemaApi = createSchemaApi(input);
  const contentApi = createContentApi(input);
  const contentOverviewApi = createContentOverviewApi(input);

  try {
    const capabilitiesResponse = await capabilitiesApi.get();
    const capabilities = capabilitiesResponse.capabilities;
    const project = capabilitiesResponse.project;
    const environment = capabilitiesResponse.environment;

    if (!capabilities.schema.read) {
      return createForbiddenState({
        project,
        environment,
        message:
          "You do not have permission to view schema types for this target.",
      });
    }

    const schemaEntries = await schemaApi.list();
    const baseEntries = sortEntries(
      schemaEntries.map((entry) =>
        createOverviewEntry({
          type: entry.type,
          directory: entry.directory,
          localized: entry.localized,
          locales: entry.localized ? input.config.supportedLocales : undefined,
          canNavigate: canReadAnyContent(capabilities),
        }),
      ),
    );

    if (baseEntries.length === 0) {
      return createReadyState({
        project,
        environment,
        entries: [],
      });
    }

    if (!canReadAnyContent(capabilities)) {
      return createPermissionConstrainedState({
        project,
        environment,
        entries: baseEntries,
      });
    }

    const entries = await (capabilities.content.read
      ? (() => {
          const requestedTypes = baseEntries.map((entry) => entry.type);

          return contentOverviewApi
            .get({ types: requestedTypes })
            .then((counts) => {
              const countsByType = new Map(
                counts.map((count) => [count.type, count]),
              );

              return baseEntries.map((entry) => {
                const count = countsByType.get(entry.type);

                return createOverviewEntry({
                  ...entry,
                  metrics: createMetricsFromOverviewCounts({
                    total: count?.total ?? 0,
                    published: count?.published ?? 0,
                    drafts: count?.drafts ?? 0,
                  }),
                });
              });
            });
        })()
      : Promise.all(
          baseEntries.map(async (entry) =>
            createOverviewEntry({
              ...entry,
              metrics: await loadEntryMetrics({
                type: entry.type,
                capabilities,
                contentApi,
              }),
            }),
          ),
        ));

    return createReadyState({
      project,
      environment,
      entries,
    });
  } catch (error: unknown) {
    if (isAuthFailure(error)) {
      return createForbiddenState({
        project: input.config.project,
        environment: input.config.environment,
        message: toStateErrorMessage(error, "Forbidden."),
      });
    }

    return createErrorState({
      project: input.config.project,
      environment: input.config.environment,
      message: toStateErrorMessage(error, "Failed to load content overview."),
    });
  }
}
