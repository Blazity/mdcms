import { createCliRuntimeContext, type CliRuntimeContext } from "./cli.js";
import type {
  CliActionAlias,
  CliOutputFormatter,
  CliPreflightHook,
} from "@mdcms/shared";

import {
  collectCliActionAliases,
  collectCliOutputFormatters,
  collectCliPreflightHooks,
  loadCliModules,
  type CliModuleLoadReport,
} from "./module-loader.js";

export type CliRuntimeContextWithModules = CliRuntimeContext & {
  moduleLoadReport: CliModuleLoadReport;
  actionAliases: readonly CliActionAlias[];
  outputFormatters: readonly CliOutputFormatter[];
  preflightHooks: readonly CliPreflightHook[];
};

/**
 * createCliRuntimeContextWithModules composes CLI runtime context with
 * compile-time local module loading from @mdcms/modules.
 */
export function createCliRuntimeContextWithModules(
  rawEnv: NodeJS.ProcessEnv = process.env,
): CliRuntimeContextWithModules {
  const runtimeContext = createCliRuntimeContext(rawEnv);
  const moduleLoadReport = loadCliModules({
    coreVersion: runtimeContext.env.APP_VERSION,
    logger: runtimeContext.logger,
  });
  const actionAliases = Object.freeze(
    collectCliActionAliases(moduleLoadReport),
  ) as readonly CliActionAlias[];
  const outputFormatters = Object.freeze(
    collectCliOutputFormatters(moduleLoadReport),
  ) as readonly CliOutputFormatter[];
  const preflightHooks = Object.freeze(
    collectCliPreflightHooks(moduleLoadReport),
  ) as readonly CliPreflightHook[];

  return {
    ...runtimeContext,
    moduleLoadReport,
    actionAliases,
    outputFormatters,
    preflightHooks,
  };
}
