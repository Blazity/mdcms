import { RuntimeError } from "@mdcms/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DrizzleDatabase } from "./db.js";
import { environments, projects, rbacGrants } from "./db/schema.js";
import { executeWithRuntimeErrorsHandled } from "./http-utils.js";
import {
  ensureProjectProvisioned,
  findProjectBySlug,
  DEFAULT_PROVISION_ACTOR,
} from "./project-provisioning.js";

export type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  environmentCount: number;
  createdAt: string;
};

export type ProjectDetail = {
  id: string;
  slug: string;
  name: string;
  environments: { id: string; name: string }[];
};

export type ProjectStore = {
  list: () => Promise<ProjectSummary[]>;
  listForUser: (userId: string) => Promise<ProjectSummary[]>;
  create: (input: { name: string }) => Promise<ProjectDetail>;
  listEnvironments: (slug: string) => Promise<{ id: string; name: string }[]>;
  createEnvironment: (
    slug: string,
    input: { name: string },
  ) => Promise<{ id: string; name: string }>;
};

export type MountProjectApiRoutesOptions = {
  store: ProjectStore;
  authorizeRead: (request: Request) => Promise<void>;
  authorizeWrite: (request: Request) => Promise<void>;
  requireSession: (request: Request) => Promise<{ userId: string }>;
};

type ProjectRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => ProjectRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => ProjectRouteApp;
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

function assertRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createInvalidInputError(field, `Field "${field}" is required.`);
  }

  return value.trim();
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createDatabaseProjectStore(options: {
  db: DrizzleDatabase;
}): ProjectStore {
  const { db } = options;

  return {
    async list() {
      const environmentCountSubquery = db
        .select({
          projectId: environments.projectId,
          count: sql<number>`count(*)::int`.as("environment_count"),
        })
        .from(environments)
        .groupBy(environments.projectId)
        .as("env_counts");

      const rows = await db
        .select({
          id: projects.id,
          slug: projects.slug,
          name: projects.name,
          createdAt: projects.createdAt,
          environmentCount: sql<number>`coalesce(${environmentCountSubquery.count}, 0)::int`,
        })
        .from(projects)
        .leftJoin(
          environmentCountSubquery,
          eq(projects.id, environmentCountSubquery.projectId),
        );

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        environmentCount: row.environmentCount,
        createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
      }));
    },

    async listForUser(userId: string) {
      const userGrants = await db
        .select({
          scopeKind: rbacGrants.scopeKind,
          project: rbacGrants.project,
        })
        .from(rbacGrants)
        .where(
          and(eq(rbacGrants.userId, userId), isNull(rbacGrants.revokedAt)),
        );

      const hasGlobalGrant = userGrants.some((g) => g.scopeKind === "global");
      if (hasGlobalGrant) {
        return this.list();
      }

      const grantedSlugs = [
        ...new Set(
          userGrants
            .filter(
              (g) =>
                g.scopeKind === "project" || g.scopeKind === "folder_prefix",
            )
            .map((g) => g.project)
            .filter((p): p is string => p !== null),
        ),
      ];

      if (grantedSlugs.length === 0) {
        return [];
      }

      const environmentCountSubquery = db
        .select({
          projectId: environments.projectId,
          count: sql<number>`count(*)::int`.as("environment_count"),
        })
        .from(environments)
        .groupBy(environments.projectId)
        .as("env_counts");

      const rows = await db
        .select({
          id: projects.id,
          slug: projects.slug,
          name: projects.name,
          createdAt: projects.createdAt,
          environmentCount: sql<number>`coalesce(${environmentCountSubquery.count}, 0)::int`,
        })
        .from(projects)
        .leftJoin(
          environmentCountSubquery,
          eq(projects.id, environmentCountSubquery.projectId),
        )
        .where(inArray(projects.slug, grantedSlugs));

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        environmentCount: row.environmentCount,
        createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
      }));
    },

    async create(input) {
      const name = assertRequiredString(input.name, "name");
      const slug = slugify(name);

      if (slug.length === 0) {
        throw createInvalidInputError(
          "name",
          "Name must contain at least one alphanumeric character.",
        );
      }

      const existing = await findProjectBySlug(db, slug);
      if (existing) {
        throw new RuntimeError({
          code: "CONFLICT",
          message: `Project "${slug}" already exists.`,
          statusCode: 409,
          details: { slug },
        });
      }

      await ensureProjectProvisioned(db, { project: slug });

      const projectRow = await findProjectBySlug(db, slug);

      if (!projectRow) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "Project could not be loaded after provisioning.",
          statusCode: 500,
        });
      }

      // Update the name if it differs from the slug used during provisioning
      if (projectRow.name !== name) {
        await db
          .update(projects)
          .set({ name })
          .where(eq(projects.id, projectRow.id));
      }

      const envRows = await db
        .select({
          id: environments.id,
          name: environments.name,
        })
        .from(environments)
        .where(eq(environments.projectId, projectRow.id));

      return {
        id: projectRow.id,
        slug: projectRow.slug,
        name,
        environments: envRows,
      };
    },

    async listEnvironments(slug) {
      const normalizedSlug = assertRequiredString(slug, "slug");
      const projectRow = await findProjectBySlug(db, normalizedSlug);

      if (!projectRow) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: `Project "${normalizedSlug}" not found.`,
          statusCode: 404,
          details: { project: normalizedSlug },
        });
      }

      const rows = await db
        .select({
          id: environments.id,
          name: environments.name,
        })
        .from(environments)
        .where(eq(environments.projectId, projectRow.id));

      return rows;
    },

    async createEnvironment(slug, input) {
      const normalizedSlug = assertRequiredString(slug, "slug");
      const name = assertRequiredString(input.name, "name");
      const projectRow = await findProjectBySlug(db, normalizedSlug);

      if (!projectRow) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: `Project "${normalizedSlug}" not found.`,
          statusCode: 404,
          details: { project: normalizedSlug },
        });
      }

      const existing = await db
        .select({ id: environments.id })
        .from(environments)
        .where(
          and(
            eq(environments.projectId, projectRow.id),
            eq(environments.name, name),
          ),
        );

      if (existing.length > 0) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message: `Environment with name "${name}" already exists for project "${normalizedSlug}".`,
          statusCode: 400,
          details: { project: normalizedSlug, name },
        });
      }

      let created;
      try {
        [created] = await db
          .insert(environments)
          .values({
            projectId: projectRow.id,
            name,
            description: null,
            createdBy: DEFAULT_PROVISION_ACTOR,
          })
          .returning({
            id: environments.id,
            name: environments.name,
          });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("unique") ||
          message.includes("duplicate") ||
          message.includes("UNIQUE")
        ) {
          throw new RuntimeError({
            code: "INVALID_INPUT",
            message: `Environment with name "${name}" already exists for project "${normalizedSlug}".`,
            statusCode: 400,
            details: { project: normalizedSlug, name },
          });
        }
        throw error;
      }

      if (!created) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "Environment creation did not return a row.",
          statusCode: 500,
        });
      }

      return created;
    },
  };
}

export function mountProjectApiRoutes(
  app: unknown,
  options: MountProjectApiRoutesOptions,
): void {
  const projectApp = app as ProjectRouteApp;

  projectApp.get?.("/api/v1/me/projects", ({ request }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      const session = await options.requireSession(request);
      return {
        data: await options.store.listForUser(session.userId),
      };
    });
  });

  projectApp.get?.("/api/v1/projects", ({ request }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      await options.authorizeRead(request);

      return {
        data: await options.store.list(),
      };
    });
  });

  projectApp.post?.("/api/v1/projects", ({ request, body }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      await options.authorizeWrite(request);

      const payload = (body ?? {}) as Record<string, unknown>;
      assertRequiredString(payload.name, "name");

      return {
        data: await options.store.create(payload as { name: string }),
      };
    });
  });

  projectApp.get?.(
    "/api/v1/projects/:slug/environments",
    ({ request, params }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        await options.authorizeRead(request);
        const slug = assertRequiredString(params.slug, "slug");

        return {
          data: await options.store.listEnvironments(slug),
        };
      });
    },
  );

  projectApp.post?.(
    "/api/v1/projects/:slug/environments",
    ({ request, params, body }: any) => {
      return executeWithRuntimeErrorsHandled(request, async () => {
        await options.authorizeWrite(request);
        const slug = assertRequiredString(params.slug, "slug");

        const payload = (body ?? {}) as Record<string, unknown>;
        assertRequiredString(payload.name, "name");

        return {
          data: await options.store.createEnvironment(
            slug,
            payload as { name: string },
          ),
        };
      });
    },
  );
}
