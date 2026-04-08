import { RuntimeError } from "@mdcms/shared";

export const RBAC_ROLES = ["viewer", "editor", "admin", "owner"] as const;

export type RbacRole = (typeof RBAC_ROLES)[number];

export type RbacGlobalScope = {
  kind: "global";
};

export type RbacProjectScope = {
  kind: "project";
  project: string;
};

export type RbacFolderPrefixScope = {
  kind: "folder_prefix";
  project: string;
  environment: string;
  pathPrefix: string;
};

export type RbacGrant =
  | {
      role: "owner" | "admin";
      scope: RbacGlobalScope;
      source?: string;
    }
  | {
      role: "editor" | "viewer";
      scope: RbacGlobalScope | RbacProjectScope | RbacFolderPrefixScope;
      source?: string;
    };

export type RbacResourceTarget = {
  project: string;
  environment?: string;
  path?: string;
};

export type RbacAction =
  | "content:read"
  | "content:read:draft"
  | "content:write"
  | "content:publish"
  | "content:unpublish"
  | "content:delete"
  | "schema:read"
  | "schema:write"
  | "projects:read"
  | "projects:write"
  | "user:manage"
  | "settings:manage";

const ROLE_RANK: Record<RbacRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

const ROLE_ACTIONS: Record<RbacRole, readonly RbacAction[]> = {
  viewer: ["content:read", "schema:read", "projects:read"],
  editor: [
    "content:read",
    "content:read:draft",
    "content:write",
    "content:publish",
    "content:unpublish",
    "content:delete",
    "schema:read",
    "projects:read",
  ],
  admin: [
    "content:read",
    "content:read:draft",
    "content:write",
    "content:publish",
    "content:unpublish",
    "content:delete",
    "schema:read",
    "schema:write",
    "projects:read",
    "projects:write",
    "user:manage",
    "settings:manage",
  ],
  owner: [
    "content:read",
    "content:read:draft",
    "content:write",
    "content:publish",
    "content:unpublish",
    "content:delete",
    "schema:read",
    "schema:write",
    "projects:read",
    "projects:write",
    "user:manage",
    "settings:manage",
  ],
};

function assertGrantScopeCompatibility(grant: RbacGrant): void {
  if (
    (grant.role === "owner" || grant.role === "admin") &&
    grant.scope.kind !== "global"
  ) {
    throw new RuntimeError({
      code: "INVALID_RBAC_GRANT",
      message: `${grant.role} role must be instance-wide (global scope only).`,
      statusCode: 400,
      details: {
        role: grant.role,
        scopeKind: grant.scope.kind,
      },
    });
  }
}

/**
 * Normalize a path prefix by trimming whitespace and ensuring it ends with a trailing slash, or return an empty string for empty input.
 *
 * @param input - The raw path prefix which may include leading/trailing whitespace
 * @returns The trimmed path prefix guaranteed to end with `/`, or `""` if the input is empty after trimming
 */
function normalizePathPrefix(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * Normalizes a path by resolving `.` and `..` segments and removing empty segments.
 *
 * @param input - The path string to normalize (may contain `/`, `.` and `..` segments)
 * @returns The collapsed path with `.` segments and empty segments removed, `..` segments applied by removing the previous segment, and remaining segments joined by `/`. The result does not include a leading or trailing `/`.
 */
function collapsePathTraversal(input: string): string {
  const segments: string[] = [];
  for (const segment of input.split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "" && segment !== ".") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

/**
 * Checks whether a resource path falls within a folder prefix.
 *
 * Both inputs are normalized before comparison: `path` has leading slashes removed and path traversal (`.`/`..`) collapsed; `prefix` is normalized to end with a trailing `/` and has leading slashes removed. An empty `prefix` matches every `path`.
 *
 * @param path - The resource path to test (may contain `.`/`..` or leading slashes)
 * @param prefix - The folder prefix to match against (may be empty or contain leading/trailing slashes)
 * @returns `true` if `path` equals the prefix (ignoring the prefix's trailing slash) or is located inside the prefix, `false` otherwise.
 */
function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalizedPath = collapsePathTraversal(path.trim().replace(/^\/+/, ""));
  const normalizedPrefix = normalizePathPrefix(prefix).replace(/^\/+/, "");
  if (!normalizedPrefix) {
    return true;
  }

  if (normalizedPath === normalizedPrefix.slice(0, -1)) {
    return true;
  }

  return normalizedPath.startsWith(normalizedPrefix);
}

function isGrantApplicable(
  grant: RbacGrant,
  target: RbacResourceTarget,
): boolean {
  if (grant.scope.kind === "global") {
    return true;
  }

  if (grant.scope.kind === "project") {
    return grant.scope.project === target.project;
  }

  if (
    !target.environment ||
    !target.path ||
    grant.scope.project !== target.project ||
    grant.scope.environment !== target.environment
  ) {
    return false;
  }

  return pathMatchesPrefix(target.path, grant.scope.pathPrefix);
}

function pickHigherRole(left: RbacRole, right: RbacRole): RbacRole {
  return ROLE_RANK[left] >= ROLE_RANK[right] ? left : right;
}

export function evaluateEffectiveRole(
  grants: readonly RbacGrant[],
  target: RbacResourceTarget,
): RbacRole | undefined {
  let best: RbacRole | undefined;

  for (const grant of grants) {
    assertGrantScopeCompatibility(grant);

    if (!isGrantApplicable(grant, target)) {
      continue;
    }

    best = best ? pickHigherRole(best, grant.role) : grant.role;
  }

  return best;
}

export function evaluatePermission(input: {
  grants: readonly RbacGrant[];
  target: RbacResourceTarget;
  action: RbacAction;
}): {
  allowed: boolean;
  effectiveRole?: RbacRole;
} {
  const effectiveRole = evaluateEffectiveRole(input.grants, input.target);

  if (!effectiveRole) {
    return {
      allowed: false,
    };
  }

  return {
    allowed: ROLE_ACTIONS[effectiveRole].includes(input.action),
    effectiveRole,
  };
}

export type OwnerInvariantSnapshot = {
  activeOwnerCount: number;
};

export function assertOwnerInvariant(
  snapshot: OwnerInvariantSnapshot,
): OwnerInvariantSnapshot {
  if (snapshot.activeOwnerCount !== 1) {
    throw new RuntimeError({
      code: "OWNER_INVARIANT_VIOLATION",
      message:
        "Exactly one non-removable Owner must exist per instance at all times.",
      statusCode: 409,
      details: {
        activeOwnerCount: snapshot.activeOwnerCount,
      },
    });
  }

  return snapshot;
}

export type OwnerMutationIntent = "remove_owner" | "demote_owner";

export function assertOwnerMutationAllowed(input: {
  activeOwnerCount: number;
  intent: OwnerMutationIntent;
}): void {
  if (input.activeOwnerCount <= 1) {
    throw new RuntimeError({
      code: "OWNER_INVARIANT_VIOLATION",
      message:
        "Cannot remove or demote the last remaining Owner for this instance.",
      statusCode: 409,
      details: {
        activeOwnerCount: input.activeOwnerCount,
        intent: input.intent,
      },
    });
  }
}

/**
 * CMS-44 close work (March 4) will replace this with DB-backed checks around
 * membership/grant mutation flows.
 */
export type OwnerInvariantStore = {
  countActiveOwners: () => Promise<number>;
};

export async function assertOwnerInvariantFromStore(
  store: OwnerInvariantStore,
): Promise<void> {
  const activeOwnerCount = await store.countActiveOwners();
  assertOwnerInvariant({ activeOwnerCount });
}
