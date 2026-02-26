import { createCliRuntimeContext, type CliRuntimeContext } from "@mdcms/cli";
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
} from "./modules.js";

export type AppCliRuntimeContext = CliRuntimeContext & {
  moduleLoadReport: CliModuleLoadReport;
  actionAliases: readonly CliActionAlias[];
  outputFormatters: readonly CliOutputFormatter[];
  preflightHooks: readonly CliPreflightHook[];
};

/**
 * createAppCliRuntimeContext composes @mdcms/cli runtime context with
 * compile-time local module loading from @mdcms/modules.
 */
export function createAppCliRuntimeContext(
  rawEnv: NodeJS.ProcessEnv = process.env,
): AppCliRuntimeContext {
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
