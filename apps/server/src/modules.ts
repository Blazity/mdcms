import { installedModules } from "@mdcms/modules";
import {
  RuntimeError,
  assertMdcmsModulePackage,
  assertModuleManifestCompatibility,
  createConsoleLogger,
  type ActionCatalogItem,
  type Logger,
  type MdcmsModulePackage,
} from "@mdcms/shared";

export type ServerModuleAppDeps = Record<string, unknown>;

type ServerModulePackage = MdcmsModulePackage<unknown, ServerModuleAppDeps>;

type LoadedServerModule = {
  id: string;
  modulePackage: ServerModulePackage & {
    server: NonNullable<ServerModulePackage["server"]>;
  };
};

export type ServerModuleSkipReason =
  | "missing-surface"
  | "incompatible"
  | "invalid-package";

export type SkippedServerModule = {
  id: string;
  reason: ServerModuleSkipReason;
  details: string;
};

export type ServerModuleLoadReport = {
  evaluatedModuleIds: readonly string[];
  loadedModuleIds: readonly string[];
  skippedModuleIds: readonly string[];
  loaded: readonly LoadedServerModule[];
  skipped: readonly SkippedServerModule[];
};

export type BuildServerModuleLoadReportOptions = {
  coreVersion: string;
  logger?: Logger;
  supportedApiVersion?: string;
};

function resolveModuleId(moduleCandidate: unknown, index: number): string {
  if (typeof moduleCandidate !== "object" || moduleCandidate === null) {
    return `unknown.${String(index).padStart(4, "0")}`;
  }

  const manifest = (moduleCandidate as { manifest?: { id?: unknown } })
    .manifest;

  if (
    manifest !== undefined &&
    typeof manifest.id === "string" &&
    manifest.id.trim().length > 0
  ) {
    return manifest.id;
  }

  return `unknown.${String(index).padStart(4, "0")}`;
}

function toErrorDetails(error: unknown): string {
  if (error instanceof RuntimeError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown module loader error.";
}

export function buildServerModuleLoadReport(
  moduleCandidates: readonly unknown[],
  options: BuildServerModuleLoadReportOptions,
): ServerModuleLoadReport {
  const logger =
    options.logger ??
    createConsoleLogger({
      level: "info",
      context: {
        runtime: "app-server",
      },
    });

  const sortedCandidates = [...moduleCandidates]
    .map((moduleCandidate, index) => ({
      id: resolveModuleId(moduleCandidate, index),
      index,
      moduleCandidate,
    }))
    .sort((left, right) => {
      const compared = left.id.localeCompare(right.id);

      if (compared !== 0) {
        return compared;
      }

      return left.index - right.index;
    });

  const loaded: LoadedServerModule[] = [];
  const skipped: SkippedServerModule[] = [];

  for (const candidate of sortedCandidates) {
    try {
      assertMdcmsModulePackage(
        candidate.moduleCandidate,
        `modules[${candidate.id}]`,
      );

      const modulePackage = candidate.moduleCandidate as ServerModulePackage;

      assertModuleManifestCompatibility(modulePackage.manifest, {
        coreVersion: options.coreVersion,
        supportedApiVersion: options.supportedApiVersion,
      });

      if (!modulePackage.server) {
        skipped.push({
          id: modulePackage.manifest.id,
          reason: "missing-surface",
          details: "Module does not expose a server surface.",
        });

        continue;
      }

      loaded.push({
        id: modulePackage.manifest.id,
        modulePackage: {
          ...modulePackage,
          server: modulePackage.server,
        },
      });
    } catch (error) {
      const details = toErrorDetails(error);
      const reason: ServerModuleSkipReason =
        error instanceof RuntimeError &&
        error.code === "INCOMPATIBLE_MODULE_MANIFEST"
          ? "incompatible"
          : "invalid-package";

      skipped.push({
        id: candidate.id,
        reason,
        details,
      });
    }
  }

  for (const moduleResult of loaded) {
    logger.info("server_module_loaded", {
      moduleId: moduleResult.id,
    });
  }

  for (const skippedModule of skipped) {
    logger.warn("server_module_skipped", {
      moduleId: skippedModule.id,
      reason: skippedModule.reason,
      details: skippedModule.details,
    });
  }

  const report: ServerModuleLoadReport = {
    evaluatedModuleIds: sortedCandidates.map((candidate) => candidate.id),
    loadedModuleIds: loaded.map((moduleResult) => moduleResult.id),
    skippedModuleIds: skipped.map((moduleResult) => moduleResult.id),
    loaded,
    skipped,
  };

  logger.info("server_module_load_summary", {
    evaluatedModuleIds: report.evaluatedModuleIds,
    loadedModuleIds: report.loadedModuleIds,
    skippedModuleIds: report.skippedModuleIds,
  });

  return report;
}

export function loadServerModules(
  options: BuildServerModuleLoadReportOptions,
): ServerModuleLoadReport {
  return buildServerModuleLoadReport(installedModules, options);
}

export function mountLoadedServerModules(
  app: unknown,
  deps: ServerModuleAppDeps,
  report: ServerModuleLoadReport,
): void {
  for (const moduleResult of report.loaded) {
    moduleResult.modulePackage.server.mount(app, deps);
  }
}

export function collectServerModuleActions(
  report: ServerModuleLoadReport,
): ActionCatalogItem[] {
  const actions: ActionCatalogItem[] = [];

  for (const moduleResult of report.loaded) {
    const moduleActions = moduleResult.modulePackage.server.actions ?? [];

    for (const action of moduleActions) {
      actions.push(action);
    }
  }

  return actions;
}
