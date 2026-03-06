import {
  assertRequestTargetRouting,
  type TargetRoutingRequirement,
} from "@mdcms/shared";
import { resolvePathname } from "./http-utils.js";

export type ScopedRoutePolicy = {
  prefix: string;
  requirement: TargetRoutingRequirement;
};

export const DEFAULT_TARGET_ROUTING_POLICIES: readonly ScopedRoutePolicy[] =
  Object.freeze([
    { prefix: "/api/v1/content", requirement: "project_environment" },
    { prefix: "/api/v1/schema", requirement: "project_environment" },
    { prefix: "/api/v1/webhooks", requirement: "project_environment" },
    { prefix: "/api/v1/search", requirement: "project_environment" },
    { prefix: "/api/v1/collaboration", requirement: "project_environment" },
    { prefix: "/api/v1/media", requirement: "project_environment" },
    { prefix: "/api/v1/environments", requirement: "project" },
  ]);

export type CreateTargetRoutingGuardOptions = {
  policies?: readonly ScopedRoutePolicy[];
};

export type TargetRoutingGuard = (request: Request) => void;

function matchesScopedPathPrefix(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) {
    return false;
  }

  if (pathname.length === prefix.length) {
    return true;
  }

  return pathname.charAt(prefix.length) === "/";
}

export function resolvePathRoutingRequirement(
  pathname: string,
  policies: readonly ScopedRoutePolicy[] = DEFAULT_TARGET_ROUTING_POLICIES,
): TargetRoutingRequirement | undefined {
  for (const policy of policies) {
    if (matchesScopedPathPrefix(pathname, policy.prefix)) {
      return policy.requirement;
    }
  }

  return undefined;
}

/**
 * createTargetRoutingGuard enforces explicit routing only for scoped API
 * routes that require project and/or environment targeting.
 */
export function createTargetRoutingGuard(
  options: CreateTargetRoutingGuardOptions = {},
): TargetRoutingGuard {
  const policies = options.policies ?? DEFAULT_TARGET_ROUTING_POLICIES;

  return (request: Request): void => {
    const requirement = resolvePathRoutingRequirement(
      resolvePathname(request),
      policies,
    );

    if (!requirement) {
      return;
    }

    assertRequestTargetRouting(request, requirement);
  };
}
