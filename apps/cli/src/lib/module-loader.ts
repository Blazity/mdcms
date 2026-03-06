import { installedModules } from "@mdcms/modules";
import {
  buildModuleLoadReport,
  type ModuleLoadReport,
  type CliActionAlias,
  type CliOutputFormatter,
  type CliPreflightHook,
  type Logger,
  type MdcmsModulePackage,
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
  return buildModuleLoadReport(moduleCandidates, {
    coreVersion: options.coreVersion,
    logger: options.logger,
    supportedApiVersion: options.supportedApiVersion,
    runtime: "cli",
    surface: "cli",
    missingSurfaceDetails: "Module does not expose a cli surface.",
    mapLoadedModule: (modulePackage) => ({
      ...modulePackage,
      cli: modulePackage.cli,
    }),
  });
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
