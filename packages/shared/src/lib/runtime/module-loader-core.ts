import {
  assertMdcmsModulePackage,
  assertModuleManifestCompatibility,
  type MdcmsModulePackage,
} from "../contracts/extensibility.js";
import { RuntimeError } from "./error.js";
import { createConsoleLogger, type Logger } from "./logger.js";

export type ModuleSurface = "server" | "cli";

type ModuleWithSurface<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage,
> = Omit<TModulePackage, TSurface> & {
  [K in TSurface]-?: NonNullable<TModulePackage[K]>;
};

export type LoadedModule<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
> = {
  id: string;
  modulePackage: ModuleWithSurface<TSurface, TModulePackage>;
};

export type ModuleBootstrapViolationCode =
  | "INVALID_PACKAGE"
  | "INCOMPATIBLE_MANIFEST"
  | "DUPLICATE_MODULE_ID"
  | "MISSING_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "DUPLICATE_ACTION_ID";

export type ModuleBootstrapViolation = {
  code: ModuleBootstrapViolationCode;
  moduleId: string;
  details: string;
};

export type RuntimeModulePlan<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
> =
  | {
      ok: true;
      moduleIds: readonly string[];
      loaded: readonly LoadedModule<TSurface, TModulePackage>[];
    }
  | {
      ok: false;
      violations: readonly ModuleBootstrapViolation[];
    };

export type BuildRuntimeModulePlanOptions<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
> = {
  coreVersion: string;
  surface: TSurface;
  runtime: string;
  logger?: Logger;
  supportedApiVersion?: string;
  mapLoadedModule?: (
    modulePackage: TModulePackage,
  ) => ModuleWithSurface<TSurface, TModulePackage>;
};

export type ModuleLoadSkipReason =
  | "missing-surface"
  | "incompatible"
  | "invalid-package";

export type SkippedModule = {
  id: string;
  reason: ModuleLoadSkipReason;
  details: string;
};

export type ModuleLoadReport<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
> = {
  evaluatedModuleIds: readonly string[];
  loadedModuleIds: readonly string[];
  skippedModuleIds: readonly string[];
  loaded: readonly LoadedModule<TSurface, TModulePackage>[];
  skipped: readonly SkippedModule[];
};

export type BuildModuleLoadReportOptions<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
> = BuildRuntimeModulePlanOptions<TSurface, TModulePackage> & {
  missingSurfaceDetails?: string;
  loadedEvent?: string;
  skippedEvent?: string;
  summaryEvent?: string;
};

type SortedModuleCandidate = {
  id: string;
  index: number;
  moduleCandidate: unknown;
};

type ValidatedModuleCandidate<TModulePackage extends MdcmsModulePackage> = {
  id: string;
  modulePackage: TModulePackage;
};

function resolveModuleId(candidate: unknown, index: number): string {
  if (typeof candidate !== "object" || candidate === null) {
    return `unknown.${String(index).padStart(4, "0")}`;
  }

  const manifest = (candidate as { manifest?: { id?: unknown } }).manifest;

  if (
    manifest !== undefined &&
    typeof manifest.id === "string" &&
    manifest.id.trim().length > 0
  ) {
    return manifest.id;
  }

  return `unknown.${String(index).padStart(4, "0")}`;
}

function compareByModuleId(
  left: { id: string; index?: number },
  right: { id: string; index?: number },
): number {
  const compared = left.id.localeCompare(right.id);

  if (compared !== 0) {
    return compared;
  }

  if (left.index === undefined || right.index === undefined) {
    return 0;
  }

  return left.index - right.index;
}

function insertSortedModuleId(queue: string[], moduleId: string): void {
  const index = queue.findIndex((candidateId) => candidateId > moduleId);

  if (index === -1) {
    queue.push(moduleId);
    return;
  }

  queue.splice(index, 0, moduleId);
}

function sortViolations(
  violations: readonly ModuleBootstrapViolation[],
): ModuleBootstrapViolation[] {
  return [...violations].sort((left, right) => {
    const comparedCode = left.code.localeCompare(right.code);

    if (comparedCode !== 0) {
      return comparedCode;
    }

    const comparedModule = left.moduleId.localeCompare(right.moduleId);

    if (comparedModule !== 0) {
      return comparedModule;
    }

    return left.details.localeCompare(right.details);
  });
}

function toErrorDetails(error: unknown): string {
  if (error instanceof RuntimeError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown module bootstrap error.";
}

function findDuplicateModuleIds(
  moduleCandidates: readonly ValidatedModuleCandidate<MdcmsModulePackage>[],
): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const moduleCandidate of moduleCandidates) {
    if (seen.has(moduleCandidate.id)) {
      duplicates.add(moduleCandidate.id);
      continue;
    }

    seen.add(moduleCandidate.id);
  }

  return duplicates;
}

function toTopologicalOrder(
  modulesById: ReadonlyMap<string, MdcmsModulePackage>,
): {
  orderedModuleIds: readonly string[];
  cycleModuleIds: readonly string[];
} {
  const moduleIds = [...modulesById.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const moduleId of moduleIds) {
    indegree.set(moduleId, 0);
    dependents.set(moduleId, []);
  }

  for (const moduleId of moduleIds) {
    const modulePackage = modulesById.get(moduleId);

    if (!modulePackage) {
      continue;
    }

    for (const dependencyId of modulePackage.manifest.dependsOn ?? []) {
      if (!modulesById.has(dependencyId)) {
        continue;
      }

      indegree.set(moduleId, (indegree.get(moduleId) ?? 0) + 1);
      dependents.get(dependencyId)?.push(moduleId);
    }
  }

  for (const dependentIds of dependents.values()) {
    dependentIds.sort((left, right) => left.localeCompare(right));
  }

  const queue = moduleIds.filter(
    (moduleId) => (indegree.get(moduleId) ?? 0) === 0,
  );
  const orderedModuleIds: string[] = [];

  while (queue.length > 0) {
    const nextId = queue.shift();

    if (!nextId) {
      continue;
    }

    orderedModuleIds.push(nextId);

    for (const dependentId of dependents.get(nextId) ?? []) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextIndegree);

      if (nextIndegree === 0) {
        insertSortedModuleId(queue, dependentId);
      }
    }
  }

  if (orderedModuleIds.length === moduleIds.length) {
    return {
      orderedModuleIds,
      cycleModuleIds: [],
    };
  }

  const cycleModuleIds = moduleIds.filter((moduleId) => {
    const value = indegree.get(moduleId);
    return value !== undefined && value > 0;
  });

  return {
    orderedModuleIds,
    cycleModuleIds,
  };
}

function collectDuplicateServerActionViolations<
  TModulePackage extends MdcmsModulePackage,
>(
  loadedModules: readonly LoadedModule<"server", TModulePackage>[],
): ModuleBootstrapViolation[] {
  const ownerByActionId = new Map<string, string>();
  const violations: ModuleBootstrapViolation[] = [];

  for (const loadedModule of loadedModules) {
    const actionList = loadedModule.modulePackage.server.actions ?? [];

    for (const action of actionList) {
      const currentOwner = ownerByActionId.get(action.id);

      if (currentOwner !== undefined) {
        violations.push({
          code: "DUPLICATE_ACTION_ID",
          moduleId: loadedModule.id,
          details: `Action id "${action.id}" is already declared by module "${currentOwner}".`,
        });
        continue;
      }

      ownerByActionId.set(action.id, loadedModule.id);
    }
  }

  return violations;
}

export function buildRuntimeModulePlan<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
>(
  moduleCandidates: readonly unknown[],
  options: BuildRuntimeModulePlanOptions<TSurface, TModulePackage>,
): RuntimeModulePlan<TSurface, TModulePackage> {
  const logger =
    options.logger ??
    createConsoleLogger({
      level: "info",
      context: {
        runtime: options.runtime,
      },
    });
  const sortedCandidates: SortedModuleCandidate[] = [...moduleCandidates]
    .map((candidate, index) => ({
      id: resolveModuleId(candidate, index),
      index,
      moduleCandidate: candidate,
    }))
    .sort(compareByModuleId);
  const violations: ModuleBootstrapViolation[] = [];
  const validModules: ValidatedModuleCandidate<TModulePackage>[] = [];

  for (const candidate of sortedCandidates) {
    try {
      assertMdcmsModulePackage(
        candidate.moduleCandidate,
        `modules[${candidate.id}]`,
      );

      const modulePackage = candidate.moduleCandidate as TModulePackage;

      assertModuleManifestCompatibility(modulePackage.manifest, {
        coreVersion: options.coreVersion,
        supportedApiVersion: options.supportedApiVersion,
      });

      validModules.push({
        id: modulePackage.manifest.id,
        modulePackage,
      });
    } catch (error) {
      const code: ModuleBootstrapViolationCode =
        error instanceof RuntimeError &&
        error.code === "INCOMPATIBLE_MODULE_MANIFEST"
          ? "INCOMPATIBLE_MANIFEST"
          : "INVALID_PACKAGE";

      violations.push({
        code,
        moduleId: candidate.id,
        details: toErrorDetails(error),
      });
    }
  }

  const duplicateModuleIds = findDuplicateModuleIds(
    validModules as readonly ValidatedModuleCandidate<MdcmsModulePackage>[],
  );

  for (const moduleId of [...duplicateModuleIds].sort((left, right) =>
    left.localeCompare(right),
  )) {
    violations.push({
      code: "DUPLICATE_MODULE_ID",
      moduleId,
      details: `Duplicate module id "${moduleId}" was found in the module registry.`,
    });
  }

  const uniqueModules = validModules.filter(
    (moduleCandidate) => !duplicateModuleIds.has(moduleCandidate.id),
  );
  const modulesById = new Map<string, TModulePackage>(
    uniqueModules.map((moduleCandidate) => [
      moduleCandidate.id,
      moduleCandidate.modulePackage,
    ]),
  );
  const sortedUniqueModuleIds = [...modulesById.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const moduleId of sortedUniqueModuleIds) {
    const modulePackage = modulesById.get(moduleId);

    if (!modulePackage) {
      continue;
    }

    for (const dependencyId of modulePackage.manifest.dependsOn ?? []) {
      if (modulesById.has(dependencyId)) {
        continue;
      }

      violations.push({
        code: "MISSING_DEPENDENCY",
        moduleId,
        details: `Missing dependency "${dependencyId}" declared in manifest.dependsOn.`,
      });
    }
  }

  const { orderedModuleIds, cycleModuleIds } = toTopologicalOrder(
    modulesById as ReadonlyMap<string, MdcmsModulePackage>,
  );

  for (const moduleId of cycleModuleIds) {
    violations.push({
      code: "DEPENDENCY_CYCLE",
      moduleId,
      details: `Module "${moduleId}" is part of a dependency cycle.`,
    });
  }

  const loaded: LoadedModule<TSurface, TModulePackage>[] = [];

  for (const moduleId of orderedModuleIds) {
    const modulePackage = modulesById.get(moduleId);

    if (!modulePackage) {
      continue;
    }

    const surfaceValue = modulePackage[options.surface];

    if (!surfaceValue) {
      continue;
    }

    loaded.push({
      id: moduleId,
      modulePackage: options.mapLoadedModule
        ? options.mapLoadedModule(modulePackage)
        : ({
            ...modulePackage,
            [options.surface]: surfaceValue,
          } as unknown as ModuleWithSurface<TSurface, TModulePackage>),
    });
  }

  if (options.surface === "server") {
    violations.push(
      ...collectDuplicateServerActionViolations(
        loaded as readonly LoadedModule<"server", TModulePackage>[],
      ),
    );
  }

  const sortedViolations = sortViolations(violations);

  if (sortedViolations.length > 0) {
    logger.error(`${options.runtime}_module_plan_failed`, {
      violations: sortedViolations,
    });

    return {
      ok: false,
      violations: sortedViolations,
    };
  }

  const moduleIds = loaded.map((moduleResult) => moduleResult.id);

  logger.info(`${options.runtime}_module_plan_ready`, {
    moduleIds,
  });

  return {
    ok: true,
    moduleIds,
    loaded,
  };
}

export function buildModuleLoadReport<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
>(
  moduleCandidates: readonly unknown[],
  options: BuildModuleLoadReportOptions<TSurface, TModulePackage>,
): ModuleLoadReport<TSurface, TModulePackage> {
  const runtimePlan = buildRuntimeModulePlan(moduleCandidates, options);

  if (!runtimePlan.ok) {
    throw new RuntimeError({
      code: "INVALID_MODULE_BOOTSTRAP",
      message: "Module bootstrap failed.",
      statusCode: 500,
      details: {
        violations: runtimePlan.violations,
      },
    });
  }

  return {
    evaluatedModuleIds: runtimePlan.moduleIds,
    loadedModuleIds: runtimePlan.moduleIds,
    skippedModuleIds: [],
    loaded: runtimePlan.loaded,
    skipped: [],
  };
}
