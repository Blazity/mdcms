import { RuntimeError } from "@mdcms/shared";
import { eq, sql } from "drizzle-orm";

import type { DrizzleDatabase } from "./db.js";
import { environments, projects } from "./db/schema.js";
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
  create: (input: { name: string }) => Promise<ProjectDetail>;
  listEnvironments: (
    slug: string,
  ) => Promise<{ id: string; name: string }[]>;
  createEnvironment: (
    slug: string,
    input: { name: string },
  ) => Promise<{ id: string; name: string }>;
};

export type MountProjectApiRoutesOptions = {
  store: ProjectStore;
  authorize: (request: Request) => Promise<void>;
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

function toIsoString(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value as any).toISOString();
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
          environmentCount:
            sql<number>`coalesce(${environmentCountSubquery.count}, 0)::int`,
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
        createdAt: toIsoString(row.createdAt),
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

      const [created] = await db
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

  projectApp.get?.("/api/v1/projects", ({ request }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      await options.authorize(request);

      return {
        data: await options.store.list(),
      };
    });
  });

  projectApp.post?.("/api/v1/projects", ({ request, body }: any) => {
    return executeWithRuntimeErrorsHandled(request, async () => {
      await options.authorize(request);

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
        await options.authorize(request);
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
        await options.authorize(request);
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
