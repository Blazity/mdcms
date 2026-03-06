import {
  assertMdcmsModulePackage,
  assertModuleManifestCompatibility,
  type MdcmsModulePackage,
} from "../contracts/extensibility.js";
import { RuntimeError } from "./error.js";
import { createConsoleLogger, type Logger } from "./logger.js";

export type ModuleSurface = "server" | "cli";

export type ModuleLoadSkipReason =
  | "missing-surface"
  | "incompatible"
  | "invalid-package";

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
> = {
  coreVersion: string;
  surface: TSurface;
  runtime: string;
  logger?: Logger;
  supportedApiVersion?: string;
  missingSurfaceDetails?: string;
  loadedEvent?: string;
  skippedEvent?: string;
  summaryEvent?: string;
  mapLoadedModule?: (
    modulePackage: TModulePackage,
  ) => ModuleWithSurface<TSurface, TModulePackage>;
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

function defaultLoadedEvent(runtime: string): string {
  return `${runtime}_module_loaded`;
}

function defaultSkippedEvent(runtime: string): string {
  return `${runtime}_module_skipped`;
}

function defaultSummaryEvent(runtime: string): string {
  return `${runtime}_module_load_summary`;
}

function defaultMissingSurfaceDetails(surface: ModuleSurface): string {
  return `Module does not expose a ${surface} surface.`;
}

export function buildModuleLoadReport<
  TSurface extends ModuleSurface,
  TModulePackage extends MdcmsModulePackage = MdcmsModulePackage,
>(
  moduleCandidates: readonly unknown[],
  options: BuildModuleLoadReportOptions<TSurface, TModulePackage>,
): ModuleLoadReport<TSurface, TModulePackage> {
  const logger =
    options.logger ??
    createConsoleLogger({
      level: "info",
      context: {
        runtime: options.runtime,
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

  const loaded: LoadedModule<TSurface, TModulePackage>[] = [];
  const skipped: SkippedModule[] = [];

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

      const surfaceValue = modulePackage[options.surface];

      if (!surfaceValue) {
        skipped.push({
          id: modulePackage.manifest.id,
          reason: "missing-surface",
          details:
            options.missingSurfaceDetails ??
            defaultMissingSurfaceDetails(options.surface),
        });

        continue;
      }

      loaded.push({
        id: modulePackage.manifest.id,
        modulePackage: options.mapLoadedModule
          ? options.mapLoadedModule(modulePackage)
          : ({
              ...modulePackage,
              [options.surface]: surfaceValue,
            } as unknown as ModuleWithSurface<TSurface, TModulePackage>),
      });
    } catch (error) {
      const reason: ModuleLoadSkipReason =
        error instanceof RuntimeError &&
        error.code === "INCOMPATIBLE_MODULE_MANIFEST"
          ? "incompatible"
          : "invalid-package";

      skipped.push({
        id: candidate.id,
        reason,
        details: toErrorDetails(error),
      });
    }
  }

  const loadedEvent =
    options.loadedEvent ?? defaultLoadedEvent(options.runtime);
  const skippedEvent =
    options.skippedEvent ?? defaultSkippedEvent(options.runtime);
  const summaryEvent =
    options.summaryEvent ?? defaultSummaryEvent(options.runtime);

  for (const moduleResult of loaded) {
    logger.info(loadedEvent, {
      moduleId: moduleResult.id,
    });
  }

  for (const skippedModule of skipped) {
    logger.warn(skippedEvent, {
      moduleId: skippedModule.id,
      reason: skippedModule.reason,
      details: skippedModule.details,
    });
  }

  const report: ModuleLoadReport<TSurface, TModulePackage> = {
    evaluatedModuleIds: sortedCandidates.map((candidate) => candidate.id),
    loadedModuleIds: loaded.map((moduleResult) => moduleResult.id),
    skippedModuleIds: skipped.map((moduleResult) => moduleResult.id),
    loaded,
    skipped,
  };

  logger.info(summaryEvent, {
    evaluatedModuleIds: report.evaluatedModuleIds,
    loadedModuleIds: report.loadedModuleIds,
    skippedModuleIds: report.skippedModuleIds,
  });

  return report;
}
