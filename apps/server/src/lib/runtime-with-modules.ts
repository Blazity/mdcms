import {
  createServerRequestHandler,
  type CreateServerRequestHandlerOptions,
  type ServerRequestHandler,
} from "./server.js";
import { createConsoleLogger, type Logger } from "@mdcms/shared";
import { parseServerEnv } from "./env.js";
import { createDatabaseConnection, type DatabaseConnection } from "./db.js";
import { createContentDAL } from "./dal/index.js";
import type { ContentDAL } from "./dal/types.js";
import {
  createDatabaseContentStore,
  mountContentApiRoutes,
} from "./content-api.js";
import { createAuthService, mountAuthRoutes } from "./auth.js";
import { mountCollaborationRoutes } from "./collaboration-auth.js";

import {
  collectServerModuleActions,
  loadServerModules,
  mountLoadedServerModules,
  type ServerModuleAppDeps,
  type ServerModuleLoadReport,
} from "./module-loader.js";

export type CreateServerRequestHandlerWithModulesOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  moduleDeps?: ServerModuleAppDeps;
  moduleLoadReport?: ServerModuleLoadReport;
  serverOptions?: Omit<
    CreateServerRequestHandlerOptions,
    "env" | "logger" | "actions" | "configureApp"
  >;
};

export type ServerRequestHandlerWithModulesResult = {
  handler: ServerRequestHandler;
  moduleLoadReport: ServerModuleLoadReport;
  dbConnection: DatabaseConnection;
  dal: ContentDAL;
};

/**
 * createServerRequestHandlerWithModules composes the server runtime with
 * compile-time local module loading from @mdcms/modules.
 */
export function createServerRequestHandlerWithModules(
  options: CreateServerRequestHandlerWithModulesOptions = {},
): ServerRequestHandlerWithModulesResult {
  const rawEnv = options.env ?? process.env;
  const env = parseServerEnv(rawEnv);
  const logger =
    options.logger ??
    createConsoleLogger({
      level: env.LOG_LEVEL,
      context: {
        runtime: "server",
        service: env.SERVICE_NAME,
      },
    });

  const dbConnection = createDatabaseConnection({ env: rawEnv });
  const dal = createContentDAL({ db: dbConnection.db });

  const moduleLoadReport =
    options.moduleLoadReport ??
    loadServerModules({
      coreVersion: env.APP_VERSION,
      logger,
    });
  const authService = createAuthService({ db: dbConnection.db, env: rawEnv });
  const contentStore = createDatabaseContentStore({ db: dbConnection.db });
  const actions = collectServerModuleActions(moduleLoadReport);
  const moduleDeps = { ...(options.moduleDeps ?? {}), dal };

  const handler = createServerRequestHandler({
    ...(options.serverOptions ?? {}),
    env: rawEnv,
    logger,
    actions,
    configureApp: (app) => {
      mountAuthRoutes(app, { authService });
      mountContentApiRoutes(app, {
        store: contentStore,
        authorize: (request, requirement) =>
          authService.authorizeRequest(request, requirement),
      });
      mountCollaborationRoutes(app, {
        authService,
        env: rawEnv,
        resolveDocument: async ({ project, environment, documentId }) => {
          const document = await contentStore.getById(
            { project, environment },
            documentId,
            { draft: true },
          );

          if (!document || document.isDeleted) {
            return undefined;
          }

          return {
            path: document.path,
          };
        },
      });
      mountLoadedServerModules(app, moduleDeps, moduleLoadReport);
    },
  });

  return {
    handler,
    moduleLoadReport,
    dbConnection,
    dal,
  };
}
