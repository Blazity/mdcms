import { installedModules } from "@mdcms/modules";
import {
  RuntimeError,
  assertMdcmsModulePackage,
  assertModuleManifestCompatibility,
  buildRuntimeModulePlan,
  type ModuleLoadReport,
  type CliActionAlias,
  type CliOutputFormatter,
  type CliPreflightHook,
  type Logger,
  type MdcmsModulePackage,
  type SkippedModule,
} from "@mdcms/shared";

type CliModulePackage = MdcmsModulePackage;

export type CliModuleLoadReport = ModuleLoadReport<"cli", CliModulePackage>;

export type BuildCliModuleLoadReportOptions = {
  coreVersion: string;
  logger?: Logger;
  supportedApiVersion?: string;
};

export function buildCliModuleLoadReport(
  moduleCandidates: readonly unknown[],
  options: BuildCliModuleLoadReportOptions,
): CliModuleLoadReport {
  const runtimePlan = buildRuntimeModulePlan(moduleCandidates, {
    coreVersion: options.coreVersion,
    logger: options.logger,
    supportedApiVersion: options.supportedApiVersion,
    runtime: "cli",
    surface: "cli",
    mapLoadedModule: (modulePackage) => ({
      ...modulePackage,
      cli: modulePackage.cli!,
    }),
  });

  if (!runtimePlan.ok) {
    throw new RuntimeError({
      code: "INVALID_MODULE_BOOTSTRAP",
      message: "CLI module bootstrap failed.",
      statusCode: 500,
      details: {
        violations: runtimePlan.violations,
      },
    });
  }

  const evaluatedModuleIds: string[] = [];
  const skipped: SkippedModule[] = [];

  for (const moduleCandidate of moduleCandidates) {
    assertMdcmsModulePackage(moduleCandidate, "module");

    const modulePackage = moduleCandidate as MdcmsModulePackage;
    assertModuleManifestCompatibility(modulePackage.manifest, {
      coreVersion: options.coreVersion,
      supportedApiVersion: options.supportedApiVersion,
    });

    evaluatedModuleIds.push(modulePackage.manifest.id);

    if (modulePackage.cli === undefined) {
      skipped.push({
        id: modulePackage.manifest.id,
        reason: "missing-surface",
        details: "Module does not expose a cli surface.",
      });
    }
  }

  evaluatedModuleIds.sort((left, right) => left.localeCompare(right));
  skipped.sort((left, right) => left.id.localeCompare(right.id));

  return {
    evaluatedModuleIds,
    loadedModuleIds: runtimePlan.moduleIds,
    skippedModuleIds: skipped.map((entry) => entry.id),
    loaded: runtimePlan.loaded,
    skipped,
  };
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
