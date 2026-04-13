import {
  RuntimeError,
  type EnvironmentListResponse,
  type EnvironmentSummary,
} from "@mdcms/shared";

import { getReviewScenario } from "./scenarios";

type ReviewEnvironmentStore = Map<string, EnvironmentSummary[]>;

const reviewEnvironmentSeeds: readonly EnvironmentSummary[] = [
  {
    id: "env-production",
    project: "marketing-site",
    name: "production",
    extends: null,
    isDefault: true,
    createdAt: "2026-03-19T10:00:00.000Z",
  },
  {
    id: "env-staging",
    project: "marketing-site",
    name: "staging",
    extends: "production",
    isDefault: false,
    createdAt: "2026-03-20T10:00:00.000Z",
  },
] as const;

const store: ReviewEnvironmentStore = new Map();

function cloneSeedData(): EnvironmentSummary[] {
  return reviewEnvironmentSeeds.map((environment) => ({ ...environment }));
}

function readScenarioStore(scenarioId: string): EnvironmentSummary[] {
  const existing = store.get(scenarioId);

  if (existing) {
    return existing;
  }

  const seeded = cloneSeedData();
  store.set(scenarioId, seeded);
  return seeded;
}

function canManageReviewEnvironments(scenarioId: string): boolean {
  const scenario = getReviewScenario(scenarioId);

  return (
    scenario.capabilities.users.manage || scenario.capabilities.settings.manage
  );
}

function createForbiddenError(): RuntimeError {
  return new RuntimeError({
    code: "FORBIDDEN",
    message: "Environment management is limited to admin review scenarios.",
    statusCode: 403,
  });
}

function createConflictError(message: string): RuntimeError {
  return new RuntimeError({
    code: "CONFLICT",
    message,
    statusCode: 409,
  });
}

function createNotFoundError(): RuntimeError {
  return new RuntimeError({
    code: "NOT_FOUND",
    message: "Environment not found.",
    statusCode: 404,
  });
}

function createInvalidInputError(): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message: 'Field "name" is required.',
    statusCode: 400,
  });
}

export function resetReviewEnvironmentStore(): void {
  store.clear();
}

export function listReviewEnvironments(
  scenarioId: string,
): EnvironmentListResponse {
  if (!canManageReviewEnvironments(scenarioId)) {
    throw createForbiddenError();
  }

  return {
    data: readScenarioStore(scenarioId).map((environment) => ({
      ...environment,
    })),
    meta: {
      definitionsStatus: "ready",
      configSnapshotHash: "sha256:review-scenario",
      syncedAt: "2026-03-19T10:00:00.000Z",
    },
  };
}

export function createReviewEnvironment(
  scenarioId: string,
  input: { name?: string },
): EnvironmentSummary {
  if (!canManageReviewEnvironments(scenarioId)) {
    throw createForbiddenError();
  }

  const name = input.name?.trim();

  if (!name) {
    throw createInvalidInputError();
  }

  const environments = readScenarioStore(scenarioId);

  if (environments.some((environment) => environment.name === name)) {
    throw createConflictError(`Environment "${name}" already exists.`);
  }

  const created: EnvironmentSummary = {
    id: `env-${name}`,
    project: "marketing-site",
    name,
    extends: name === "production" ? null : "production",
    isDefault: name === "production",
    createdAt: "2026-04-10T10:00:00.000Z",
  };

  environments.push(created);

  return { ...created };
}

export function deleteReviewEnvironment(
  scenarioId: string,
  environmentId: string,
): { deleted: true; id: string } {
  if (!canManageReviewEnvironments(scenarioId)) {
    throw createForbiddenError();
  }

  const environments = readScenarioStore(scenarioId);
  const index = environments.findIndex(
    (environment) => environment.id === environmentId,
  );

  if (index === -1) {
    throw createNotFoundError();
  }

  const environment = environments[index];

  if (!environment) {
    throw createNotFoundError();
  }

  if (environment.isDefault) {
    throw createConflictError(
      'The default "production" environment cannot be deleted.',
    );
  }

  environments.splice(index, 1);

  return {
    deleted: true,
    id: environmentId,
  };
}
