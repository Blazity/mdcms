import {
  RuntimeError,
  assertEnvironmentCreateInput,
  type EnvironmentCreateInput,
  type EnvironmentSummary,
  type ParsedMdcmsConfig,
  resolveRequestTargetRouting,
} from "@mdcms/shared";
import { and, eq, sql } from "drizzle-orm";

import type { StudioSession } from "./auth.js";
import type { DrizzleDatabase } from "./db.js";
import {
  documents,
  documentVersions,
  environments,
  schemaRegistryEntries,
  schemaSyncs,
} from "./db/schema.js";
import { executeWithRuntimeErrorsHandled } from "./http-utils.js";
import {
  DEFAULT_ENVIRONMENT_NAME,
  DEFAULT_PROVISION_ACTOR,
  ensureProjectProvisioned,
  findProjectBySlug,
} from "./project-provisioning.js";

type EnvironmentRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => EnvironmentRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => EnvironmentRouteApp;
  delete?: (
    path: string,
    handler: (ctx: any) => unknown,
  ) => EnvironmentRouteApp;
};

export type EnvironmentStore = {
  list: (project: string) => Promise<EnvironmentSummary[]>;
  create: (
    project: string,
    input: EnvironmentCreateInput,
  ) => Promise<EnvironmentSummary>;
  delete: (
    project: string,
    environmentId: string,
  ) => Promise<{ deleted: true; id: string }>;
};

export type EnvironmentAdminAuthorizer = (
  request: Request,
) => Promise<StudioSession | void>;

export type MountEnvironmentApiRoutesOptions = {
  store: EnvironmentStore;
  authorizeAdmin: EnvironmentAdminAuthorizer;
};

export type CreateDatabaseEnvironmentStoreOptions = {
  db: DrizzleDatabase;
  getConfig: () => Promise<ParsedMdcmsConfig | undefined>;
};

function createInvalidInputError(
  field: string,
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message,
    statusCode: 400,
    details: {
      field,
      ...details,
    },
  });
}

function createConflictError(
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "CONFLICT",
    message,
    statusCode: 409,
    details,
  });
}

function assertRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createInvalidInputError(field, `Field "${field}" is required.`);
  }

  return value.trim();
}

function pickProject(request: Request): string {
  const scope = resolveRequestTargetRouting(request);

  if (!scope.project) {
    throw new RuntimeError({
      code: "MISSING_TARGET_ROUTING",
      message: "Project routing is required for environment endpoints.",
      statusCode: 400,
      details: {
        project: scope.project ?? null,
      },
    });
  }

  return scope.project;
}

function toIsoString(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value as any).toISOString();
}

function toEnvironmentSummary(input: {
  project: string;
  row: typeof environments.$inferSelect;
  config?: ParsedMdcmsConfig;
}): EnvironmentSummary {
  return {
    id: input.row.id,
    project: input.project,
    name: input.row.name,
    extends: input.config?.environments[input.row.name]?.extends ?? null,
    isDefault: input.row.name === DEFAULT_ENVIRONMENT_NAME,
    createdAt: toIsoString(input.row.createdAt),
  };
}

async function requireConfig(
  getConfig: () => Promise<ParsedMdcmsConfig | undefined>,
): Promise<ParsedMdcmsConfig> {
  const config = await getConfig();

  if (!config) {
    throw new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "Server config is required to manage environments.",
      statusCode: 500,
    });
  }

  return config;
}

function assertEnvironmentAllowedByConfig(
  config: ParsedMdcmsConfig,
  input: EnvironmentCreateInput,
): void {
  const definition = config.environments[input.name];

  if (!definition) {
    throw createInvalidInputError(
      "name",
      `Environment "${input.name}" is not defined in mdcms.config.ts.`,
      {
        environment: input.name,
      },
    );
  }

  const expectedExtends = definition.extends ?? null;
  const providedExtends = input.extends?.trim() || null;

  if (providedExtends !== null && providedExtends !== expectedExtends) {
    throw createInvalidInputError(
      "extends",
      `Environment "${input.name}" must extend "${expectedExtends ?? "null"}" according to mdcms.config.ts.`,
      {
        environment: input.name,
        expectedExtends,
        providedExtends,
      },
    );
  }
}

export function createDatabaseEnvironmentStore(
  options: CreateDatabaseEnvironmentStoreOptions,
): EnvironmentStore {
  const { db, getConfig } = options;

  return {
    async list(project) {
      const normalizedProject = assertRequiredString(project, "project");
      const [projectRow, config] = await Promise.all([
        findProjectBySlug(db, normalizedProject),
        getConfig(),
      ]);

      if (!projectRow) {
        return [];
      }

      const rows = await db
        .select()
        .from(environments)
        .where(eq(environments.projectId, projectRow.id));

      return rows
        .map((row) =>
          toEnvironmentSummary({
            project: normalizedProject,
            row,
            config: config ?? undefined,
          }),
        )
        .sort((left, right) => left.name.localeCompare(right.name));
    },

    async create(project, input) {
      const normalizedProject = assertRequiredString(project, "project");
      const payload = {
        name: assertRequiredString(input.name, "name"),
        ...(input.extends !== undefined
          ? {
              extends: assertRequiredString(input.extends, "extends"),
            }
          : {}),
      } satisfies EnvironmentCreateInput;
      const config = await requireConfig(getConfig);

      assertEnvironmentAllowedByConfig(config, payload);

      return db.transaction(async (tx) => {
        const existingProject = await findProjectBySlug(
          tx as unknown as DrizzleDatabase,
          normalizedProject,
        );
        const provisioned = await ensureProjectProvisioned(
          tx as unknown as DrizzleDatabase,
          {
            project: normalizedProject,
          },
        );

        const existingEnvironment = await tx.query.environments.findFirst({
          where: and(
            eq(environments.projectId, provisioned.projectId),
            eq(environments.name, payload.name),
          ),
        });

        if (payload.name === DEFAULT_ENVIRONMENT_NAME) {
          if (
            existingProject &&
            existingEnvironment &&
            !provisioned.createdProductionEnvironment
          ) {
            throw createConflictError(
              `Environment "${payload.name}" already exists in project "${normalizedProject}".`,
              {
                project: normalizedProject,
                environment: payload.name,
              },
            );
          }

          const productionRow =
            existingEnvironment ??
            (await tx.query.environments.findFirst({
              where: and(
                eq(environments.projectId, provisioned.projectId),
                eq(environments.name, DEFAULT_ENVIRONMENT_NAME),
              ),
            }));

          if (!productionRow) {
            throw new RuntimeError({
              code: "INTERNAL_ERROR",
              message: "Default production environment could not be loaded.",
              statusCode: 500,
            });
          }

          return toEnvironmentSummary({
            project: normalizedProject,
            row: productionRow,
            config,
          });
        }

        if (existingEnvironment) {
          throw createConflictError(
            `Environment "${payload.name}" already exists in project "${normalizedProject}".`,
            {
              project: normalizedProject,
              environment: payload.name,
            },
          );
        }

        const [created] = await tx
          .insert(environments)
          .values({
            projectId: provisioned.projectId,
            name: payload.name,
            description: null,
            createdBy: DEFAULT_PROVISION_ACTOR,
          })
          .returning();

        if (!created) {
          throw new RuntimeError({
            code: "INTERNAL_ERROR",
            message: "Environment creation did not return a row.",
            statusCode: 500,
          });
        }

        return toEnvironmentSummary({
          project: normalizedProject,
          row: created,
          config,
        });
      });
    },

    async delete(project, environmentId) {
      const normalizedProject = assertRequiredString(project, "project");
      const normalizedEnvironmentId = assertRequiredString(
        environmentId,
        "environmentId",
      );
      const projectRow = await findProjectBySlug(db, normalizedProject);

      if (!projectRow) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Environment not found.",
          statusCode: 404,
          details: {
            project: normalizedProject,
            environmentId: normalizedEnvironmentId,
          },
        });
      }

      const environmentRow = await db.query.environments.findFirst({
        where: and(
          eq(environments.projectId, projectRow.id),
          eq(environments.id, normalizedEnvironmentId),
        ),
      });

      if (!environmentRow) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Environment not found.",
          statusCode: 404,
          details: {
            project: normalizedProject,
            environmentId: normalizedEnvironmentId,
          },
        });
      }

      if (environmentRow.name === DEFAULT_ENVIRONMENT_NAME) {
        throw createConflictError(
          'The default "production" environment cannot be deleted.',
          {
            project: normalizedProject,
            environmentId: environmentRow.id,
            environment: environmentRow.name,
          },
        );
      }

      const [documentsRow, versionsRow, syncsRow, registryRow] =
        await Promise.all([
          db
            .select({
              count: sql<number>`count(*)::int`,
            })
            .from(documents)
            .where(
              and(
                eq(documents.projectId, projectRow.id),
                eq(documents.environmentId, environmentRow.id),
              ),
            ),
          db
            .select({
              count: sql<number>`count(*)::int`,
            })
            .from(documentVersions)
            .where(
              and(
                eq(documentVersions.projectId, projectRow.id),
                eq(documentVersions.environmentId, environmentRow.id),
              ),
            ),
          db
            .select({
              count: sql<number>`count(*)::int`,
            })
            .from(schemaSyncs)
            .where(
              and(
                eq(schemaSyncs.projectId, projectRow.id),
                eq(schemaSyncs.environmentId, environmentRow.id),
              ),
            ),
          db
            .select({
              count: sql<number>`count(*)::int`,
            })
            .from(schemaRegistryEntries)
            .where(
              and(
                eq(schemaRegistryEntries.projectId, projectRow.id),
                eq(schemaRegistryEntries.environmentId, environmentRow.id),
              ),
            ),
        ]);

      const dependencyCount =
        (documentsRow[0]?.count ?? 0) +
        (versionsRow[0]?.count ?? 0) +
        (syncsRow[0]?.count ?? 0) +
        (registryRow[0]?.count ?? 0);

      if (dependencyCount > 0) {
        throw createConflictError(
          `Environment "${environmentRow.name}" cannot be deleted while content or schema state still exists.`,
          {
            project: normalizedProject,
            environmentId: environmentRow.id,
            environment: environmentRow.name,
          },
        );
      }

      await db
        .delete(environments)
        .where(
          and(
            eq(environments.projectId, projectRow.id),
            eq(environments.id, environmentRow.id),
          ),
        );

      return {
        deleted: true as const,
        id: environmentRow.id,
      };
    },
  };
}

export function mountEnvironmentApiRoutes(
  app: unknown,
  options: MountEnvironmentApiRoutesOptions,
): void {
  const environmentApp = app as EnvironmentRouteApp;

  environmentApp.get?.("/api/v1/environments", ({ request }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const project = pickProject(request);
      await options.authorizeAdmin(request);

      return {
        data: await options.store.list(project),
      };
    });
  });

  environmentApp.post?.("/api/v1/environments", ({ request, body }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const project = pickProject(request);
      await options.authorizeAdmin(request);

      const payload = (body ?? {}) as unknown;
      assertEnvironmentCreateInput(payload);

      return {
        data: await options.store.create(project, payload),
      };
    });
  });

  environmentApp.delete?.(
    "/api/v1/environments/:id",
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        const project = pickProject(request);
        await options.authorizeAdmin(request);
        const environmentId = assertRequiredString(params.id, "id");

        return {
          data: await options.store.delete(project, environmentId),
        };
      });
    },
  );
}
