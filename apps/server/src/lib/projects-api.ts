import { RuntimeError } from "@mdcms/shared";
import { and, eq, sql } from "drizzle-orm";

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
};

type ProjectRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => ProjectRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => ProjectRouteApp;
};

/**
 * Create a RuntimeError representing an invalid input for a specific field.
 *
 * @param field - The name of the input field that is invalid
 * @param message - A human-readable error message describing the invalid input
 * @param details - Additional arbitrary details to include in the error `details` object; merged with `{ field }`
 * @returns A `RuntimeError` with `code` set to `"INVALID_INPUT"`, `statusCode` 400, and `details` containing `field` plus any provided `details`
 */
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

/**
 * Validates that a value is a non-empty string and returns the trimmed result.
 *
 * @param value - The value to validate.
 * @param field - The name of the field used in the error details if validation fails.
 * @returns The trimmed string.
 * @throws A `RuntimeError` with `code: "INVALID_INPUT"` and `statusCode: 400` when `value` is not a string or is empty after trimming; the error's `details` include the provided `field`.
 */
function assertRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createInvalidInputError(field, `Field "${field}" is required.`);
  }

  return value.trim();
}

/**
 * Convert a value to an ISO 8601 timestamp string or return `null` when conversion isn't possible.
 *
 * @param value - A Date instance or any value that can be passed to the Date constructor; `null` or `undefined` will be treated as missing.
 * @returns An ISO 8601 string representation of `value` if it represents a valid date, `null` otherwise.
 */
function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Converts a string into a URL-friendly slug.
 *
 * @param name - The input string to convert into a slug
 * @returns The slug: lowercased, characters other than `a-z`, `0-9`, and `-` replaced with `-`, consecutive `-` collapsed into a single `-`, and leading/trailing `-` removed
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Create a ProjectStore backed by the provided Drizzle database.
 *
 * The returned store implements project and environment persistence operations:
 * - list projects with computed environment counts,
 * - create a project (validates name, generates a slug, provisions the project, and returns the project with its environments),
 * - list environments for a project (throws a 404 if the project does not exist),
 * - create an environment in a project (validates inputs and prevents duplicate names).
 *
 * @returns A ProjectStore implementation that uses the provided `db` to persist projects and environments.
 */
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

/**
 * Registers HTTP routes for managing projects and their environments on the given app.
 *
 * Mounted routes:
 * - GET  /api/v1/projects
 *   - Requires read authorization; responds with `{ data: ProjectSummary[] }`.
 * - POST /api/v1/projects
 *   - Requires write authorization; expects `{ name }` in the request body; responds with `{ data: ProjectDetail }`.
 * - GET  /api/v1/projects/:slug/environments
 *   - Requires read authorization; expects `:slug` param; responds with `{ data: { id: string, name: string }[] }`.
 * - POST /api/v1/projects/:slug/environments
 *   - Requires write authorization; expects `:slug` param and `{ name }` in the request body; responds with `{ data: { id: string, name: string } }`.
 *
 * All routes use the provided `options.store` for persistence and call `options.authorizeRead` / `options.authorizeWrite`
 * as appropriate for access control.
 *
 * @param app - An application-like object on which routes will be registered (expects optional `get`/`post` methods).
 * @param options - Dependencies including a `ProjectStore` and authorization functions.
 * @returns void
 */
export function mountProjectApiRoutes(
  app: unknown,
  options: MountProjectApiRoutesOptions,
): void {
  const projectApp = app as ProjectRouteApp;

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
