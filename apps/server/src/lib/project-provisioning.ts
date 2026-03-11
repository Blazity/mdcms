import { and, eq } from "drizzle-orm";

import type { DrizzleDatabase } from "./db.js";
import { environments, projects } from "./db/schema.js";

export const DEFAULT_ENVIRONMENT_NAME = "production";
export const DEFAULT_PROVISION_ACTOR = "00000000-0000-0000-0000-000000000001";

export type ProjectProvisioningResult = {
  projectId: string;
  productionEnvironmentId: string;
  createdProject: boolean;
  createdProductionEnvironment: boolean;
};

export type ProjectEnvironmentScope = {
  project: typeof projects.$inferSelect;
  environment: typeof environments.$inferSelect;
};

type DatabaseLike = DrizzleDatabase;

async function findEnvironmentByProjectAndName(
  db: DatabaseLike,
  input: { projectId: string; environment: string },
): Promise<typeof environments.$inferSelect | undefined> {
  return db.query.environments.findFirst({
    where: and(
      eq(environments.projectId, input.projectId),
      eq(environments.name, input.environment),
    ),
  });
}

export async function ensureProjectProvisioned(
  db: DatabaseLike,
  input: { project: string },
): Promise<ProjectProvisioningResult> {
  return db.transaction(async (tx) => {
    let createdProject = false;
    let createdProductionEnvironment = false;

    let project = await tx.query.projects.findFirst({
      where: eq(projects.slug, input.project),
    });

    if (!project) {
      const [insertedProject] = await tx
        .insert(projects)
        .values({
          name: input.project,
          slug: input.project,
          createdBy: DEFAULT_PROVISION_ACTOR,
        })
        .onConflictDoNothing()
        .returning();

      createdProject = insertedProject !== undefined;

      project = await tx.query.projects.findFirst({
        where: eq(projects.slug, input.project),
      });
    }

    if (!project) {
      throw new Error(`Failed to provision project "${input.project}".`);
    }

    let productionEnvironment = await tx.query.environments.findFirst({
      where: and(
        eq(environments.projectId, project.id),
        eq(environments.name, DEFAULT_ENVIRONMENT_NAME),
      ),
    });

    if (!productionEnvironment) {
      const [insertedEnvironment] = await tx
        .insert(environments)
        .values({
          projectId: project.id,
          name: DEFAULT_ENVIRONMENT_NAME,
          description: null,
          createdBy: DEFAULT_PROVISION_ACTOR,
        })
        .onConflictDoNothing()
        .returning();

      createdProductionEnvironment = insertedEnvironment !== undefined;

      productionEnvironment = await tx.query.environments.findFirst({
        where: and(
          eq(environments.projectId, project.id),
          eq(environments.name, DEFAULT_ENVIRONMENT_NAME),
        ),
      });
    }

    if (!productionEnvironment) {
      throw new Error(
        `Failed to provision default environment for project "${input.project}".`,
      );
    }

    return {
      projectId: project.id,
      productionEnvironmentId: productionEnvironment.id,
      createdProject,
      createdProductionEnvironment,
    };
  });
}

export async function findProjectBySlug(
  db: DatabaseLike,
  project: string,
): Promise<typeof projects.$inferSelect | undefined> {
  return db.query.projects.findFirst({
    where: eq(projects.slug, project),
  });
}

export async function resolveProjectEnvironmentScope(
  db: DatabaseLike,
  input: {
    project: string;
    environment: string;
    createIfMissing?: boolean;
  },
): Promise<ProjectEnvironmentScope | undefined> {
  let project = await findProjectBySlug(db, input.project);

  if (!project && input.createIfMissing) {
    await ensureProjectProvisioned(db, { project: input.project });
    project = await findProjectBySlug(db, input.project);
  }

  if (!project) {
    return undefined;
  }

  let environment = await findEnvironmentByProjectAndName(db, {
    projectId: project.id,
    environment: input.environment,
  });

  if (
    !environment &&
    input.createIfMissing &&
    input.environment === DEFAULT_ENVIRONMENT_NAME
  ) {
    await ensureProjectProvisioned(db, { project: input.project });
    environment = await findEnvironmentByProjectAndName(db, {
      projectId: project.id,
      environment: input.environment,
    });
  }

  if (!environment) {
    return undefined;
  }

  return { project, environment };
}

export async function findEnvironmentByProjectAndId(
  db: DatabaseLike,
  input: { project: string; environmentId: string },
): Promise<typeof environments.$inferSelect | undefined> {
  const project = await findProjectBySlug(db, input.project);

  if (!project) {
    return undefined;
  }

  return db.query.environments.findFirst({
    where: and(
      eq(environments.projectId, project.id),
      eq(environments.id, input.environmentId),
    ),
  });
}
