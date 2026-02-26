import {
  createServerRequestHandler,
  parseServerEnv,
  type CreateServerRequestHandlerOptions,
  type ServerRequestHandler,
} from "@mdcms/server";
import { createConsoleLogger, type Logger } from "@mdcms/shared";

import {
  collectServerModuleActions,
  loadServerModules,
  mountLoadedServerModules,
  type ServerModuleAppDeps,
  type ServerModuleLoadReport,
} from "./modules.js";

export type CreateAppServerRequestHandlerOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  moduleDeps?: ServerModuleAppDeps;
  moduleLoadReport?: ServerModuleLoadReport;
  serverOptions?: Omit<
    CreateServerRequestHandlerOptions,
    "env" | "logger" | "actions" | "configureApp"
  >;
};

export type AppServerRequestHandlerResult = {
  handler: ServerRequestHandler;
  moduleLoadReport: ServerModuleLoadReport;
};

/**
 * createAppServerRequestHandler composes the package server runtime with
 * compile-time local module loading from @mdcms/modules.
 */
export function createAppServerRequestHandler(
  options: CreateAppServerRequestHandlerOptions = {},
): AppServerRequestHandlerResult {
  const rawEnv = options.env ?? process.env;
  const env = parseServerEnv(rawEnv);
  const logger =
    options.logger ??
    createConsoleLogger({
      level: env.LOG_LEVEL,
      context: {
        runtime: "app-server",
        service: env.SERVICE_NAME,
      },
    });

  const moduleLoadReport =
    options.moduleLoadReport ??
    loadServerModules({
      coreVersion: env.APP_VERSION,
      logger,
    });
  const actions = collectServerModuleActions(moduleLoadReport);
  const moduleDeps = options.moduleDeps ?? {};

  const handler = createServerRequestHandler({
    ...(options.serverOptions ?? {}),
    env: rawEnv,
    logger,
    actions,
    configureApp: (app) => {
      mountLoadedServerModules(app, moduleDeps, moduleLoadReport);
    },
  });

  return {
    handler,
    moduleLoadReport,
  };
}
