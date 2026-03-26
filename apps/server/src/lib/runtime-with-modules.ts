import {
  createServerRequestHandler,
  type CreateServerRequestHandlerOptions,
  type ServerRequestHandler,
} from "./server.js";
import { createConsoleLogger, type Logger } from "@mdcms/shared";
import { and, eq } from "drizzle-orm";
import { parseServerEnv } from "./env.js";
import { createDatabaseConnection, type DatabaseConnection } from "./db.js";
import { createContentDAL } from "./dal/index.js";
import type { ContentDAL } from "./dal/types.js";
import {
  createDatabaseContentStore,
  mountContentApiRoutes,
} from "./content-api.js";
import {
  createDatabaseSchemaStore,
  mountSchemaApiRoutes,
} from "./schema-api.js";
import {
  createAuthService,
  mountAuthRoutes,
  resolveStartupOidcProviders,
} from "./auth.js";
import { mountCollaborationRoutes } from "./collaboration-auth.js";
import {
  createDatabaseEnvironmentStore,
  mountEnvironmentApiRoutes,
} from "./environments-api.js";
import { loadServerConfig } from "./config.js";
import type { ParsedMdcmsConfig } from "@mdcms/shared";
import {
  createRefreshingStudioRuntimePublicationSelection,
  createStudioRuntimePublication,
  type CreateStudioRuntimePublicationOptions,
} from "./studio-bootstrap.js";
import { schemaSyncs } from "./db/schema.js";
import { resolveProjectEnvironmentScope } from "./project-provisioning.js";

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
  config?: ParsedMdcmsConfig;
  configPath?: string;
  cwd?: string;
  moduleDeps?: ServerModuleAppDeps;
  moduleLoadReport?: ServerModuleLoadReport;
  serverOptions?: Omit<
    CreateServerRequestHandlerOptions,
    "env" | "logger" | "actions" | "configureApp"
  >;
};

export type PrepareServerRequestHandlerWithModulesOptions =
  CreateServerRequestHandlerWithModulesOptions & {
    studioRuntimeOptions?: CreateStudioRuntimePublicationOptions;
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
  const moduleLoadReport =
    options.moduleLoadReport ??
    loadServerModules({
      coreVersion: env.APP_VERSION,
      logger,
    });

  const dbConnection = createDatabaseConnection({ env: rawEnv });
  const dal = createContentDAL({ db: dbConnection.db });
  const authService = createAuthService({ db: dbConnection.db, env: rawEnv });
  const contentStore = createDatabaseContentStore({ db: dbConnection.db });
  const schemaStore = createDatabaseSchemaStore({ db: dbConnection.db });
  let configPromise: Promise<ParsedMdcmsConfig | undefined> | undefined;
  const getConfig = () => {
    if (options.config) {
      return Promise.resolve(options.config);
    }

    configPromise ??= loadServerConfig({
      cwd: options.cwd,
      configPath: options.configPath,
    }).then((loaded) => loaded?.config);

    return configPromise;
  };
  const environmentStore = createDatabaseEnvironmentStore({
    db: dbConnection.db,
    getConfig,
  });
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
        requireCsrf: (request) => authService.requireCsrfProtection(request),
        getWriteSchemaSyncState: async (scope) => {
          const resolvedScope = await resolveProjectEnvironmentScope(
            dbConnection.db,
            {
              project: scope.project,
              environment: scope.environment,
            },
          );

          if (!resolvedScope) {
            return undefined;
          }

          const row = await dbConnection.db.query.schemaSyncs.findFirst({
            where: and(
              eq(schemaSyncs.projectId, resolvedScope.project.id),
              eq(schemaSyncs.environmentId, resolvedScope.environment.id),
            ),
          });

          if (!row) {
            return undefined;
          }

          return {
            schemaHash: row.schemaHash,
          };
        },
      });
      mountSchemaApiRoutes(app, {
        store: schemaStore,
        authorize: (request, requirement) =>
          authService.authorizeRequest(request, requirement),
        requireCsrf: (request) => authService.requireCsrfProtection(request),
      });
      mountEnvironmentApiRoutes(app, {
        store: environmentStore,
        authorizeAdmin: (request) => authService.requireAdminSession(request),
        requireCsrf: (request) => authService.requireCsrfProtection(request),
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

/**
 * prepareServerRequestHandlerWithModules builds the startup-owned Studio
 * runtime publication once, then composes it into the shared server handler.
 */
export async function prepareServerRequestHandlerWithModules(
  options: PrepareServerRequestHandlerWithModulesOptions = {},
): Promise<ServerRequestHandlerWithModulesResult> {
  const rawEnv = options.env ?? process.env;
  const env = parseServerEnv(rawEnv);
  const resolvedOidcProviders = await resolveStartupOidcProviders(
    env.MDCMS_AUTH_OIDC_PROVIDERS,
  );
  const resolvedEnv: NodeJS.ProcessEnv = {
    ...rawEnv,
    MDCMS_AUTH_OIDC_PROVIDERS: JSON.stringify(resolvedOidcProviders),
  };
  const logger =
    options.logger ??
    createConsoleLogger({
      level: env.LOG_LEVEL,
      context: {
        runtime: "server",
        service: env.SERVICE_NAME,
      },
    });
  const moduleLoadReport =
    options.moduleLoadReport ??
    loadServerModules({
      coreVersion: env.APP_VERSION,
      logger,
    });
  const studioRuntimePublication =
    options.serverOptions?.studioRuntimePublication ??
    (env.NODE_ENV === "development"
      ? await createRefreshingStudioRuntimePublicationSelection({
          ...options.studioRuntimeOptions,
          studioVersion:
            options.studioRuntimeOptions?.studioVersion ??
            (rawEnv.APP_VERSION?.trim() || "0.0.0"),
        })
      : ({
          active: await createStudioRuntimePublication({
            ...options.studioRuntimeOptions,
            studioVersion:
              options.studioRuntimeOptions?.studioVersion ??
              (rawEnv.APP_VERSION?.trim() || "0.0.0"),
          }),
        } as const));

  return createServerRequestHandlerWithModules({
    ...options,
    env: resolvedEnv,
    logger,
    moduleLoadReport,
    serverOptions: {
      ...(options.serverOptions ?? {}),
      studioRuntimePublication,
    },
  });
}
