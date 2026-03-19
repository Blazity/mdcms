import { RuntimeError } from "../runtime/error.js";
import { z } from "zod";

export const MDCMS_PROJECT_HEADER = "X-MDCMS-Project" as const;
export const MDCMS_ENVIRONMENT_HEADER = "X-MDCMS-Environment" as const;
export const MDCMS_PROJECT_QUERY_PARAM = "project" as const;
export const MDCMS_ENVIRONMENT_QUERY_PARAM = "environment" as const;

export type TargetRoutingRequirement = "project" | "project_environment";
export type TargetRoutingFieldSource = "header" | "query";
export type TargetRoutingSource = "none" | "headers" | "query" | "mixed";

export type ResolvedRequestTargetRouting = {
  project?: string;
  environment?: string;
  source: TargetRoutingSource;
  projectSource?: TargetRoutingFieldSource;
  environmentSource?: TargetRoutingFieldSource;
};

const TargetRoutingValueSchema = z.string().trim().min(1);
const ProjectRoutingRequirementSchema = z.object({
  project: z.string().min(1),
});
const ProjectEnvironmentRoutingRequirementSchema = z.object({
  project: z.string().min(1),
  environment: z.string().min(1),
});

function normalizeTargetRoutingValue(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = TargetRoutingValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function resolveRequestUrl(request: Request): URL {
  try {
    return new URL(request.url);
  } catch (error) {
    throw new RuntimeError({
      code: "INVALID_TARGET_ROUTING",
      message: "Request URL is not a valid absolute URL.",
      statusCode: 400,
      details: {
        url: request.url,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function throwTargetRoutingMismatchError(
  field: "project" | "environment",
  headerValue: string,
  queryValue: string,
): never {
  throw new RuntimeError({
    code: "TARGET_ROUTING_MISMATCH",
    message: `Conflicting target routing for "${field}": header and query values must match.`,
    statusCode: 400,
    details: {
      field,
      headerName:
        field === "project" ? MDCMS_PROJECT_HEADER : MDCMS_ENVIRONMENT_HEADER,
      queryParam:
        field === "project"
          ? MDCMS_PROJECT_QUERY_PARAM
          : MDCMS_ENVIRONMENT_QUERY_PARAM,
      headerValue,
      queryValue,
    },
  });
}

function resolveTargetRoutingSource(
  projectSource?: TargetRoutingFieldSource,
  environmentSource?: TargetRoutingFieldSource,
): TargetRoutingSource {
  const sources = [projectSource, environmentSource].filter(
    (value): value is TargetRoutingFieldSource => value !== undefined,
  );

  if (sources.length === 0) {
    return "none";
  }

  if (sources.every((source) => source === "header")) {
    return "headers";
  }

  if (sources.every((source) => source === "query")) {
    return "query";
  }

  return "mixed";
}

/**
 * resolveRequestTargetRouting reads explicit target routing from
 * `X-MDCMS-Project` / `X-MDCMS-Environment` headers and
 * `project` / `environment` query params.
 *
 * If both header and query values are present for the same field, they must
 * match exactly after trimming.
 */
export function resolveRequestTargetRouting(
  request: Request,
): ResolvedRequestTargetRouting {
  const url = resolveRequestUrl(request);
  const headerProject = normalizeTargetRoutingValue(
    request.headers.get(MDCMS_PROJECT_HEADER),
  );
  const queryProject = normalizeTargetRoutingValue(
    url.searchParams.get(MDCMS_PROJECT_QUERY_PARAM),
  );
  const headerEnvironment = normalizeTargetRoutingValue(
    request.headers.get(MDCMS_ENVIRONMENT_HEADER),
  );
  const queryEnvironment = normalizeTargetRoutingValue(
    url.searchParams.get(MDCMS_ENVIRONMENT_QUERY_PARAM),
  );

  if (
    headerProject !== undefined &&
    queryProject !== undefined &&
    headerProject !== queryProject
  ) {
    throwTargetRoutingMismatchError("project", headerProject, queryProject);
  }

  if (
    headerEnvironment !== undefined &&
    queryEnvironment !== undefined &&
    headerEnvironment !== queryEnvironment
  ) {
    throwTargetRoutingMismatchError(
      "environment",
      headerEnvironment,
      queryEnvironment,
    );
  }

  const project = headerProject ?? queryProject;
  const environment = headerEnvironment ?? queryEnvironment;
  const projectSource: TargetRoutingFieldSource | undefined =
    headerProject !== undefined
      ? "header"
      : queryProject !== undefined
        ? "query"
        : undefined;
  const environmentSource: TargetRoutingFieldSource | undefined =
    headerEnvironment !== undefined
      ? "header"
      : queryEnvironment !== undefined
        ? "query"
        : undefined;

  return {
    project,
    environment,
    projectSource,
    environmentSource,
    source: resolveTargetRoutingSource(projectSource, environmentSource),
  };
}

/**
 * assertRequestTargetRouting validates that the request includes an explicit
 * target that satisfies the route requirement.
 */
export function assertRequestTargetRouting(
  request: Request,
  requirement: TargetRoutingRequirement,
): ResolvedRequestTargetRouting {
  const resolved = resolveRequestTargetRouting(request);
  const requirementSchema =
    requirement === "project"
      ? ProjectRoutingRequirementSchema
      : ProjectEnvironmentRoutingRequirementSchema;
  const parsed = requirementSchema.safeParse(resolved);

  if (!parsed.success) {
    const missingFieldSet = new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter(
          (value): value is "project" | "environment" =>
            value === "project" || value === "environment",
        ),
    );
    const missingFields = (["project", "environment"] as const).filter(
      (field) => missingFieldSet.has(field),
    );

    throw new RuntimeError({
      code: "MISSING_TARGET_ROUTING",
      message: `Explicit target routing is required (${missingFields.join(", ")}).`,
      statusCode: 400,
      details: {
        requirement,
        missingFields,
        headerNames: [MDCMS_PROJECT_HEADER, MDCMS_ENVIRONMENT_HEADER],
        queryParams: [MDCMS_PROJECT_QUERY_PARAM, MDCMS_ENVIRONMENT_QUERY_PARAM],
      },
    });
  }

  return resolved;
}
