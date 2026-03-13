import { installedModules } from "@mdcms/modules";
import {
  RuntimeError,
  buildRuntimeModulePlan,
  type ModuleLoadReport,
  type ActionCatalogItem,
  type Logger,
  type MdcmsModulePackage,
} from "@mdcms/shared";

export type ServerModuleAppDeps = Record<string, unknown>;

type ServerModulePackage = MdcmsModulePackage;

export type ServerModuleLoadReport = ModuleLoadReport<
  "server",
  ServerModulePackage
>;

export type BuildServerModuleLoadReportOptions = {
  coreVersion: string;
  logger?: Logger;
  supportedApiVersion?: string;
};

export function buildServerModuleLoadReport(
  moduleCandidates: readonly unknown[],
  options: BuildServerModuleLoadReportOptions,
): ServerModuleLoadReport {
  const runtimePlan = buildRuntimeModulePlan(moduleCandidates, {
    coreVersion: options.coreVersion,
    logger: options.logger,
    supportedApiVersion: options.supportedApiVersion,
    runtime: "server",
    surface: "server",
    mapLoadedModule: (modulePackage) => ({
      ...modulePackage,
      server: modulePackage.server!,
    }),
  });

  if (!runtimePlan.ok) {
    throw new RuntimeError({
      code: "INVALID_MODULE_BOOTSTRAP",
      message: "Server module bootstrap failed.",
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
