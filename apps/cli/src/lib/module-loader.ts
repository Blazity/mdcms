import { installedModules } from "@mdcms/modules";
import {
  RuntimeError,
  assertMdcmsModulePackage,
  assertModuleManifestCompatibility,
  createConsoleLogger,
  type CliActionAlias,
  type CliOutputFormatter,
  type CliPreflightHook,
  type Logger,
  type MdcmsModulePackage,
} from "@mdcms/shared";

type CliModulePackage = MdcmsModulePackage;

type LoadedCliModule = {
  id: string;
  modulePackage: CliModulePackage & {
    cli: NonNullable<CliModulePackage["cli"]>;
  };
};

export type CliModuleSkipReason =
  | "missing-surface"
  | "incompatible"
  | "invalid-package";

export type SkippedCliModule = {
  id: string;
  reason: CliModuleSkipReason;
  details: string;
};

export type CliModuleLoadReport = {
  evaluatedModuleIds: readonly string[];
  loadedModuleIds: readonly string[];
  skippedModuleIds: readonly string[];
  loaded: readonly LoadedCliModule[];
  skipped: readonly SkippedCliModule[];
};

export type BuildCliModuleLoadReportOptions = {
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

export function buildCliModuleLoadReport(
  moduleCandidates: readonly unknown[],
  options: BuildCliModuleLoadReportOptions,
): CliModuleLoadReport {
  const logger =
    options.logger ??
    createConsoleLogger({
      level: "info",
      context: {
        runtime: "cli",
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

  const loaded: LoadedCliModule[] = [];
  const skipped: SkippedCliModule[] = [];

  for (const candidate of sortedCandidates) {
    try {
      assertMdcmsModulePackage(
        candidate.moduleCandidate,
        `modules[${candidate.id}]`,
      );

      const modulePackage = candidate.moduleCandidate as CliModulePackage;

      assertModuleManifestCompatibility(modulePackage.manifest, {
        coreVersion: options.coreVersion,
        supportedApiVersion: options.supportedApiVersion,
      });

      if (!modulePackage.cli) {
        skipped.push({
          id: modulePackage.manifest.id,
          reason: "missing-surface",
          details: "Module does not expose a cli surface.",
        });

        continue;
      }

      loaded.push({
        id: modulePackage.manifest.id,
        modulePackage: {
          ...modulePackage,
          cli: modulePackage.cli,
        },
      });
    } catch (error) {
      const details = toErrorDetails(error);
      const reason: CliModuleSkipReason =
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
    logger.info("cli_module_loaded", {
      moduleId: moduleResult.id,
    });
  }

  for (const skippedModule of skipped) {
    logger.warn("cli_module_skipped", {
      moduleId: skippedModule.id,
      reason: skippedModule.reason,
      details: skippedModule.details,
    });
  }

  const report: CliModuleLoadReport = {
    evaluatedModuleIds: sortedCandidates.map((candidate) => candidate.id),
    loadedModuleIds: loaded.map((moduleResult) => moduleResult.id),
    skippedModuleIds: skipped.map((moduleResult) => moduleResult.id),
    loaded,
    skipped,
  };

  logger.info("cli_module_load_summary", {
    evaluatedModuleIds: report.evaluatedModuleIds,
    loadedModuleIds: report.loadedModuleIds,
    skippedModuleIds: report.skippedModuleIds,
  });

  return report;
}

export function loadCliModules(
  options: BuildCliModuleLoadReportOptions,
): CliModuleLoadReport {
  return buildCliModuleLoadReport(installedModules, options);
}

export function collectCliActionAliases(
  report: CliModuleLoadReport,
): CliActionAlias[] {
  const aliases: CliActionAlias[] = [];

  for (const moduleResult of report.loaded) {
    const moduleAliases = moduleResult.modulePackage.cli.actionAliases ?? [];

    for (const alias of moduleAliases) {
      aliases.push(alias);
    }
  }

  return aliases;
}

export function collectCliOutputFormatters(
  report: CliModuleLoadReport,
): CliOutputFormatter[] {
  const formatters: CliOutputFormatter[] = [];

  for (const moduleResult of report.loaded) {
    const moduleFormatters =
      moduleResult.modulePackage.cli.outputFormatters ?? [];

    for (const formatter of moduleFormatters) {
      formatters.push(formatter);
    }
  }

  return formatters;
}

export function collectCliPreflightHooks(
  report: CliModuleLoadReport,
): CliPreflightHook[] {
  const hooks: CliPreflightHook[] = [];

  for (const moduleResult of report.loaded) {
    const moduleHooks = moduleResult.modulePackage.cli.preflightHooks ?? [];

    for (const hook of moduleHooks) {
      hooks.push(hook);
    }
  }

  return hooks;
}
