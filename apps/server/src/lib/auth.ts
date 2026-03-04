import { createHash, randomBytes } from "node:crypto";

import { RuntimeError, serializeError } from "@mdcms/shared";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { z } from "zod";

import type { DrizzleDatabase } from "./db.js";
import {
  apiKeys,
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  rbacGrants,
  type ApiKeyScopeTuple,
} from "./db/schema.js";
import {
  evaluatePermission,
  type RbacAction,
  type RbacGrant,
} from "./rbac.js";

export const API_KEY_OPERATION_SCOPES = [
  "content:read",
  "content:write:draft",
  "content:publish",
  "content:delete",
  "schema:read",
  "schema:write",
  "media:upload",
  "media:delete",
  "webhooks:read",
  "webhooks:write",
  "environments:clone",
  "environments:promote",
  "migrations:run",
] as const;

const API_KEY_PREFIX = "mdcms_key_";
const SESSION_INACTIVITY_TIMEOUT_SECONDS = 2 * 60 * 60;
const SESSION_ABSOLUTE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type ApiKeyOperationScope = (typeof API_KEY_OPERATION_SCOPES)[number];

export type StudioSession = {
  id: string;
  userId: string;
  email: string;
  issuedAt: string;
  expiresAt: string;
};

export type ApiKeyPrincipal = {
  type: "api_key";
  keyId: string;
  keyPrefix: string;
  label: string;
  scopes: readonly ApiKeyOperationScope[];
  contextAllowlist: readonly ApiKeyScopeTuple[];
};

export type SessionPrincipal = {
  type: "session";
  session: StudioSession;
};

export type AuthPrincipal = ApiKeyPrincipal | SessionPrincipal;

export type AuthorizationRequirement = {
  requiredScope: ApiKeyOperationScope;
  project?: string;
  environment?: string;
  documentPath?: string;
};

export type AuthorizedRequest = {
  mode: "session" | "api_key";
  principal: AuthPrincipal;
};

export type CreateApiKeyInput = {
  label: string;
  scopes: ApiKeyOperationScope[];
  contextAllowlist: ApiKeyScopeTuple[];
  expiresAt?: string;
};

export type ApiKeyMetadata = {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: ApiKeyOperationScope[];
  contextAllowlist: ApiKeyScopeTuple[];
  createdByUserId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

export type AuthService = {
  login: (
    request: Request,
    email: string,
    password: string,
  ) => Promise<{
    session: StudioSession;
    setCookie: string;
  }>;
  getSession: (request: Request) => Promise<StudioSession | undefined>;
  logout: (request: Request) => Promise<{
    revoked: boolean;
    setCookie?: string;
  }>;
  authorizeRequest: (
    request: Request,
    requirement: AuthorizationRequirement,
  ) => Promise<AuthorizedRequest>;
  createApiKey: (
    request: Request,
    input: CreateApiKeyInput,
  ) => Promise<{ key: string; metadata: ApiKeyMetadata }>;
  listApiKeys: (request: Request) => Promise<ApiKeyMetadata[]>;
  revokeApiKey: (request: Request, keyId: string) => Promise<ApiKeyMetadata>;
  revokeAllUserSessions: (userId: string) => Promise<number>;
  revokeAllSessionsForUserByAdmin: (
    request: Request,
    userId: string,
  ) => Promise<{
    userId: string;
    revokedSessions: number;
  }>;
  handleAuthRequest: (request: Request) => Promise<Response>;
};

type BetterAuthLikeSession = {
  session?: {
    id?: unknown;
    userId?: unknown;
    createdAt?: unknown;
    expiresAt?: unknown;
  };
  user?: {
    id?: unknown;
    email?: unknown;
  };
};

type AuthRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => AuthRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => AuthRouteApp;
};

const CreateApiKeyInputSchema = z.object({
  label: z.string().trim().min(1).max(128),
  scopes: z.array(z.enum(API_KEY_OPERATION_SCOPES)).min(1),
  contextAllowlist: z
    .array(
      z.object({
        project: z.string().trim().min(1),
        environment: z.string().trim().min(1),
      }),
    )
    .min(1),
  expiresAt: z.string().datetime().optional(),
});

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  return new Date(value as any).toISOString();
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Field "${field}" is required.`,
      statusCode: 400,
      details: { field },
    });
  }

  return value.trim();
}

function toJsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function toErrorResponse(error: RuntimeError, request: Request): Response {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const body = serializeError(error, { requestId });

  return toJsonResponse(body, error.statusCode);
}

function mapUnknownAuthError(
  error: unknown,
  code: string,
  message: string,
): never {
  if (error instanceof RuntimeError) {
    throw error;
  }

  throw new RuntimeError({
    code,
    message,
    statusCode: 401,
    details:
      error instanceof Error
        ? {
            cause: error.message,
          }
        : undefined,
  });
}

function extractCookiePair(setCookieHeader: string | null): string {
  if (!setCookieHeader || setCookieHeader.trim().length === 0) {
    throw new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "Auth provider did not return a session cookie.",
      statusCode: 500,
    });
  }

  const [pair] = setCookieHeader.split(";");

  if (!pair || pair.trim().length === 0) {
    throw new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "Auth provider returned an invalid session cookie.",
      statusCode: 500,
    });
  }

  return pair.trim();
}

function extractBearerToken(
  authorizationHeader: string | null,
): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const trimmed = authorizationHeader.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const [scheme, token] = trimmed.split(/\s+/, 2);

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    throw new RuntimeError({
      code: "UNAUTHORIZED",
      message: "Authorization header must use Bearer token format.",
      statusCode: 401,
    });
  }

  return token;
}

function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function ensureValidApiKeyToken(token: string): void {
  if (!token.startsWith(API_KEY_PREFIX)) {
    throw new RuntimeError({
      code: "UNAUTHORIZED",
      message: "Invalid API key format.",
      statusCode: 401,
    });
  }
}

function normalizeApiKeyScopes(value: unknown): ApiKeyOperationScope[] {
  const parsed = z.array(z.enum(API_KEY_OPERATION_SCOPES)).safeParse(value);

  if (!parsed.success) {
    throw new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "Stored API key scopes are invalid.",
      statusCode: 500,
    });
  }

  return parsed.data;
}

function normalizeApiKeyContextAllowlist(value: unknown): ApiKeyScopeTuple[] {
  const parsed = z
    .array(
      z.object({
        project: z.string().trim().min(1),
        environment: z.string().trim().min(1),
      }),
    )
    .safeParse(value);

  if (!parsed.success) {
    throw new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "Stored API key context allowlist is invalid.",
      statusCode: 500,
    });
  }

  return parsed.data;
}

function toApiKeyMetadata(row: typeof apiKeys.$inferSelect): ApiKeyMetadata {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.keyPrefix,
    scopes: normalizeApiKeyScopes(row.scopes),
    contextAllowlist: normalizeApiKeyContextAllowlist(row.contextAllowlist),
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
    expiresAt: row.expiresAt ? toIsoString(row.expiresAt) : null,
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
    lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
  };
}

function toStudioSession(payload: BetterAuthLikeSession): StudioSession {
  const sessionId = assertNonEmptyString(payload.session?.id, "session.id");
  const userId = assertNonEmptyString(payload.user?.id, "user.id");
  const email = assertNonEmptyString(payload.user?.email, "user.email");
  const issuedAt = toIsoString(payload.session?.createdAt);
  const expiresAt = toIsoString(payload.session?.expiresAt);

  return {
    id: sessionId,
    userId,
    email,
    issuedAt,
    expiresAt,
  };
}

function resolveAuthBaseUrl(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.MDCMS_SERVER_URL?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  const port = env.PORT?.trim() || "4000";
  return `http://localhost:${port}`;
}

function resolveAuthSecret(env: NodeJS.ProcessEnv): string {
  const configured = env.BETTER_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim();

  if (configured) {
    return configured;
  }

  if (env.NODE_ENV === "production") {
    throw new RuntimeError({
      code: "INVALID_ENV",
      message:
        "BETTER_AUTH_SECRET (or AUTH_SECRET) must be configured in production.",
      statusCode: 500,
    });
  }

  return "mdcms-dev-secret-do-not-use-in-production";
}

function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function resolveSecureCookiePolicy(env: NodeJS.ProcessEnv): boolean {
  const explicitInsecure = parseEnvBoolean(env.MDCMS_AUTH_INSECURE_COOKIES);
  return explicitInsecure === true ? false : true;
}

function parseCsvSet(rawValue: string | undefined): Set<string> {
  if (!rawValue) {
    return new Set<string>();
  }

  return new Set(
    rawValue
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

function resolveAdminAllowlist(env: NodeJS.ProcessEnv): {
  userIds: Set<string>;
  emails: Set<string>;
} {
  return {
    userIds: parseCsvSet(env.MDCMS_AUTH_ADMIN_USER_IDS),
    emails: new Set(
      [...parseCsvSet(env.MDCMS_AUTH_ADMIN_EMAILS)].map((email) =>
        email.toLowerCase(),
      ),
    ),
  };
}

function toRbacAction(requiredScope: ApiKeyOperationScope): RbacAction | null {
  if (requiredScope === "content:read") {
    return "content:read";
  }

  if (requiredScope === "content:write:draft") {
    return "content:write:draft";
  }

  if (requiredScope === "content:publish") {
    return "content:publish";
  }

  if (requiredScope === "content:delete") {
    return "content:delete";
  }

  return null;
}

function isSessionBeyondAbsoluteMaxAge(session: StudioSession): boolean {
  const issuedAt = Date.parse(session.issuedAt);

  if (Number.isNaN(issuedAt)) {
    return true;
  }

  return Date.now() - issuedAt > SESSION_ABSOLUTE_MAX_AGE_MS;
}

function createUnauthorizedSessionError(message: string): RuntimeError {
  return new RuntimeError({
    code: "UNAUTHORIZED",
    message,
    statusCode: 401,
  });
}

export type CreateAuthServiceOptions = {
  db: DrizzleDatabase;
  env?: NodeJS.ProcessEnv;
  isAdminSession?: (session: StudioSession) => boolean | Promise<boolean>;
};

export function createAuthService(
  options: CreateAuthServiceOptions,
): AuthService {
  const rawEnv = options.env ?? process.env;
  const baseUrl = resolveAuthBaseUrl(rawEnv);
  const secret = resolveAuthSecret(rawEnv);
  const useSecureCookies = resolveSecureCookiePolicy(rawEnv);
  const adminAllowlist = resolveAdminAllowlist(rawEnv);
  const isAdminSession =
    options.isAdminSession ??
    ((session: StudioSession) =>
      adminAllowlist.userIds.has(session.userId) ||
      adminAllowlist.emails.has(session.email.toLowerCase()));

  const auth = betterAuth({
    appName: "mdcms",
    baseURL: baseUrl,
    basePath: "/api/v1/auth",
    secret,
    database: drizzleAdapter(options.db as unknown as Record<string, unknown>, {
      provider: "pg",
      schema: {
        users: authUsers,
        sessions: authSessions,
        accounts: authAccounts,
        verifications: authVerifications,
      },
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: SESSION_INACTIVITY_TIMEOUT_SECONDS,
      updateAge: 0,
    },
    advanced: {
      useSecureCookies,
      defaultCookieAttributes: {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: useSecureCookies,
      },
    },
    rateLimit: {
      enabled: false,
    },
  });

  function toRbacGrant(row: typeof rbacGrants.$inferSelect): RbacGrant {
    if (row.role === "owner" || row.role === "admin") {
      if (row.scopeKind !== "global") {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "Stored RBAC grant has invalid role/scope pairing.",
          statusCode: 500,
          details: {
            grantId: row.id,
          },
        });
      }

      return {
        role: row.role,
        scope: { kind: "global" },
        source: row.source ?? undefined,
      };
    }

    if (row.role !== "editor" && row.role !== "viewer") {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "Stored RBAC grant has invalid role value.",
        statusCode: 500,
        details: {
          grantId: row.id,
          role: row.role,
        },
      });
    }

    if (row.scopeKind === "global") {
      return {
        role: row.role,
        scope: { kind: "global" },
        source: row.source ?? undefined,
      };
    }

    if (row.scopeKind === "project") {
      if (!row.project) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "Stored RBAC grant is missing required project scope data.",
          statusCode: 500,
          details: {
            grantId: row.id,
          },
        });
      }

      return {
        role: row.role,
        scope: {
          kind: "project",
          project: row.project,
        },
        source: row.source ?? undefined,
      };
    }

    if (row.scopeKind === "folder_prefix") {
      if (!row.project || !row.environment || !row.pathPrefix) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message:
            "Stored RBAC grant is missing required folder-prefix scope data.",
          statusCode: 500,
          details: {
            grantId: row.id,
          },
        });
      }

      return {
        role: row.role,
        scope: {
          kind: "folder_prefix",
          project: row.project,
          environment: row.environment,
          pathPrefix: row.pathPrefix,
        },
        source: row.source ?? undefined,
      };
    }

    throw new RuntimeError({
      code: "INTERNAL_ERROR",
      message: "Stored RBAC grant has invalid scope kind.",
      statusCode: 500,
      details: {
        grantId: row.id,
        scopeKind: row.scopeKind,
      },
    });
  }

  async function seedBootstrapOwnerIfNeeded(session: StudioSession): Promise<void> {
    const [ownerCountRow] = await options.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(rbacGrants)
      .where(and(eq(rbacGrants.role, "owner"), isNull(rbacGrants.revokedAt)));
    const ownerCount = ownerCountRow?.count ?? 0;

    if (ownerCount > 0) {
      return;
    }

    await options.db
      .insert(rbacGrants)
      .values({
        userId: session.userId,
        role: "owner",
        scopeKind: "global",
        source: "bootstrap:first-session",
        createdByUserId: session.userId,
      })
      .onConflictDoNothing();
  }

  async function loadSessionRbacGrants(session: StudioSession): Promise<RbacGrant[]> {
    await seedBootstrapOwnerIfNeeded(session);

    const rows = await options.db
      .select()
      .from(rbacGrants)
      .where(
        and(eq(rbacGrants.userId, session.userId), isNull(rbacGrants.revokedAt)),
      );

    return rows.map((row) => toRbacGrant(row));
  }

  async function assertSessionRbacAuthorization(
    session: StudioSession,
    requirement: AuthorizationRequirement,
  ): Promise<void> {
    const action = toRbacAction(requirement.requiredScope);

    if (!action) {
      return;
    }

    if (!requirement.project) {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message:
          "RBAC authorization requires an explicit project in the request context.",
        statusCode: 403,
      });
    }

    const grants = await loadSessionRbacGrants(session);
    const decision = evaluatePermission({
      grants,
      target: {
        project: requirement.project,
        environment: requirement.environment,
        path: requirement.documentPath,
      },
      action,
    });

    if (!decision.allowed) {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message:
          "Session role does not allow this operation for the requested content scope.",
        statusCode: 403,
        details: {
          requiredScope: requirement.requiredScope,
          project: requirement.project,
          environment: requirement.environment ?? null,
          documentPath: requirement.documentPath ?? null,
        },
      });
    }
  }

  async function revokeAllUserSessions(userId: string): Promise<number> {
    const normalizedUserId = assertNonEmptyString(userId, "userId");
    const revoked = await options.db
      .delete(authSessions)
      .where(eq(authSessions.userId, normalizedUserId))
      .returning({
        id: authSessions.id,
      });

    return revoked.length;
  }

  async function requireSession(request: Request): Promise<StudioSession> {
    const session = (await auth.api.getSession({
      headers: request.headers,
    })) as BetterAuthLikeSession | null;

    if (!session) {
      throw createUnauthorizedSessionError(
        "A valid Studio session is required.",
      );
    }

    const parsed = toStudioSession(session);

    if (isSessionBeyondAbsoluteMaxAge(parsed)) {
      await options.db
        .delete(authSessions)
        .where(eq(authSessions.id, parsed.id));
      throw createUnauthorizedSessionError(
        "Session exceeded the absolute maximum age.",
      );
    }

    return parsed;
  }

  async function assertAdminSession(request: Request): Promise<StudioSession> {
    const session = await requireSession(request);
    const grants = await loadSessionRbacGrants(session);
    const hasGlobalAdminGrant = grants.some(
      (grant) =>
        grant.scope.kind === "global" &&
        (grant.role === "owner" || grant.role === "admin"),
    );
    const isAdmin = hasGlobalAdminGrant || (await isAdminSession(session));

    if (!isAdmin) {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message:
          "Admin privileges are required to revoke sessions for another user.",
        statusCode: 403,
      });
    }

    return session;
  }

  async function requireActiveApiKey(
    token: string,
  ): Promise<{ row: typeof apiKeys.$inferSelect; metadata: ApiKeyMetadata }> {
    ensureValidApiKeyToken(token);
    const hashedToken = hashApiKey(token);

    const row = await options.db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.keyHash, hashedToken),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), sql`${apiKeys.expiresAt} > now()`),
      ),
    });

    if (!row) {
      throw new RuntimeError({
        code: "UNAUTHORIZED",
        message: "API key is invalid, expired, or revoked.",
        statusCode: 401,
      });
    }

    return {
      row,
      metadata: toApiKeyMetadata(row),
    };
  }

  return {
    async login(request, email, password) {
      try {
        const response = await auth.api.signInEmail({
          headers: request.headers,
          body: {
            email,
            password,
          },
          asResponse: true,
        });

        if (response.status >= 400) {
          throw new RuntimeError({
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Email or password is invalid.",
            statusCode: 401,
          });
        }

        const setCookie = response.headers.get("set-cookie");
        const cookiePair = extractCookiePair(setCookie);
        const responseCookie = setCookie ?? cookiePair;
        const session = (await auth.api.getSession({
          headers: new Headers({
            cookie: cookiePair,
          }),
        })) as BetterAuthLikeSession | null;

        if (!session) {
          throw new RuntimeError({
            code: "INTERNAL_ERROR",
            message: "Session lookup failed after successful sign-in.",
            statusCode: 500,
          });
        }

        const studioSession = toStudioSession(session);
        await options.db
          .delete(authSessions)
          .where(
            and(
              eq(authSessions.userId, studioSession.userId),
              ne(authSessions.id, studioSession.id),
            ),
          );

        return {
          session: studioSession,
          setCookie: responseCookie,
        };
      } catch (error) {
        mapUnknownAuthError(
          error,
          "AUTH_INVALID_CREDENTIALS",
          "Email or password is invalid.",
        );
      }
    },

    async getSession(request) {
      try {
        return await requireSession(request);
      } catch (error) {
        if (error instanceof RuntimeError && error.code === "UNAUTHORIZED") {
          return undefined;
        }

        throw error;
      }
    },

    async logout(request) {
      const response = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });

      return {
        revoked: response.status < 400,
        setCookie: response.headers.get("set-cookie") ?? undefined,
      };
    },

    async authorizeRequest(request, requirement) {
      const bearerToken = extractBearerToken(
        request.headers.get("authorization"),
      );

      if (bearerToken) {
        const { row, metadata } = await requireActiveApiKey(bearerToken);
        const hasRequiredScope = metadata.scopes.includes(
          requirement.requiredScope,
        );

        if (!hasRequiredScope) {
          throw new RuntimeError({
            code: "FORBIDDEN",
            message: `API key scope "${requirement.requiredScope}" is required for this endpoint.`,
            statusCode: 403,
            details: {
              requiredScope: requirement.requiredScope,
            },
          });
        }

        if (!requirement.project || !requirement.environment) {
          throw new RuntimeError({
            code: "FORBIDDEN",
            message:
              "API key authorization requires explicit project/environment routing context.",
            statusCode: 403,
          });
        }

        const isContextAllowed = metadata.contextAllowlist.some(
          (candidate) =>
            candidate.project === requirement.project &&
            candidate.environment === requirement.environment,
        );

        if (!isContextAllowed) {
          throw new RuntimeError({
            code: "FORBIDDEN",
            message:
              "API key is not allowed for the requested project/environment context.",
            statusCode: 403,
            details: {
              project: requirement.project,
              environment: requirement.environment,
            },
          });
        }

        await options.db
          .update(apiKeys)
          .set({
            lastUsedAt: new Date(),
          })
          .where(eq(apiKeys.id, row.id));

        return {
          mode: "api_key",
          principal: {
            type: "api_key",
            keyId: metadata.id,
            keyPrefix: metadata.keyPrefix,
            label: metadata.label,
            scopes: metadata.scopes,
            contextAllowlist: metadata.contextAllowlist,
          } satisfies ApiKeyPrincipal,
        };
      }

      const session = await requireSession(request);
      await assertSessionRbacAuthorization(session, requirement);
      return {
        mode: "session",
        principal: {
          type: "session",
          session,
        } satisfies SessionPrincipal,
      };
    },

    async createApiKey(request, input) {
      const session = await requireSession(request);
      const parsed = CreateApiKeyInputSchema.safeParse(input);

      if (!parsed.success) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message:
            parsed.error.issues[0]?.message ?? "API key payload is invalid.",
          statusCode: 400,
          details: {
            issue: parsed.error.issues[0]?.path.join(".") ?? undefined,
          },
        });
      }

      const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
      const keyHash = hashApiKey(key);
      const keyPrefix = `${key.slice(0, API_KEY_PREFIX.length + 8)}...`;
      const expiresAt = parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : null;

      const [created] = await options.db
        .insert(apiKeys)
        .values({
          label: parsed.data.label,
          keyPrefix,
          keyHash,
          scopes: parsed.data.scopes,
          contextAllowlist: parsed.data.contextAllowlist,
          expiresAt,
          createdByUserId: session.userId,
        })
        .returning();

      if (!created) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "Failed to create API key.",
          statusCode: 500,
        });
      }

      return {
        key,
        metadata: toApiKeyMetadata(created),
      };
    },

    async listApiKeys(request) {
      await requireSession(request);

      const rows = await options.db
        .select()
        .from(apiKeys)
        .orderBy(desc(apiKeys.createdAt));

      return rows.map((row) => toApiKeyMetadata(row));
    },

    async revokeApiKey(request, keyId) {
      await requireSession(request);
      const normalizedKeyId = assertNonEmptyString(keyId, "keyId");

      const [existing] = await options.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, normalizedKeyId))
        .limit(1);

      if (!existing) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "API key not found.",
          statusCode: 404,
          details: {
            keyId: normalizedKeyId,
          },
        });
      }

      const [updated] = await options.db
        .update(apiKeys)
        .set({
          revokedAt: new Date(),
        })
        .where(eq(apiKeys.id, normalizedKeyId))
        .returning();

      return toApiKeyMetadata(updated ?? existing);
    },

    revokeAllUserSessions,

    async revokeAllSessionsForUserByAdmin(request, userId) {
      await assertAdminSession(request);
      const normalizedUserId = assertNonEmptyString(userId, "userId");
      const user = await options.db.query.authUsers.findFirst({
        where: eq(authUsers.id, normalizedUserId),
      });

      if (!user) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "User not found.",
          statusCode: 404,
          details: {
            userId: normalizedUserId,
          },
        });
      }

      const revokedSessions = await revokeAllUserSessions(normalizedUserId);
      return {
        userId: normalizedUserId,
        revokedSessions,
      };
    },

    handleAuthRequest(request) {
      return auth.handler(request);
    },
  };
}

export type MountAuthRoutesOptions = {
  authService: AuthService;
};

function handleRouteError(request: Request, error: unknown): Response {
  if (error instanceof RuntimeError) {
    return toErrorResponse(error, request);
  }

  throw error;
}

export function mountAuthRoutes(
  app: unknown,
  options: MountAuthRoutesOptions,
): void {
  const authApp = app as AuthRouteApp;

  authApp.post?.("/api/v1/auth/login", async ({ request, body }: any) => {
    try {
      const payload = (body ?? {}) as {
        email?: unknown;
        password?: unknown;
      };
      const email = assertNonEmptyString(payload.email, "email");
      const password = assertNonEmptyString(payload.password, "password");
      const result = await options.authService.login(request, email, password);

      return toJsonResponse(
        {
          data: {
            session: result.session,
          },
        },
        200,
        {
          "set-cookie": result.setCookie,
        },
      );
    } catch (error) {
      return handleRouteError(request, error);
    }
  });

  authApp.get?.("/api/v1/auth/session", async ({ request }: any) => {
    try {
      const session = await options.authService.getSession(request);

      if (!session) {
        throw new RuntimeError({
          code: "UNAUTHORIZED",
          message: "A valid Studio session is required.",
          statusCode: 401,
        });
      }

      return {
        data: {
          session,
        },
      };
    } catch (error) {
      return handleRouteError(request, error);
    }
  });

  authApp.post?.("/api/v1/auth/logout", async ({ request }: any) => {
    try {
      const result = await options.authService.logout(request);

      return toJsonResponse(
        {
          data: {
            revoked: result.revoked,
          },
        },
        200,
        result.setCookie
          ? {
              "set-cookie": result.setCookie,
            }
          : {},
      );
    } catch (error) {
      return handleRouteError(request, error);
    }
  });

  authApp.post?.(
    "/api/v1/auth/users/:userId/sessions/revoke-all",
    async ({ request, params }: any) => {
      try {
        const result =
          await options.authService.revokeAllSessionsForUserByAdmin(
            request,
            params.userId,
          );

        return {
          data: result,
        };
      } catch (error) {
        return handleRouteError(request, error);
      }
    },
  );

  authApp.get?.("/api/v1/auth/api-keys", async ({ request }: any) => {
    try {
      const rows = await options.authService.listApiKeys(request);
      return {
        data: rows,
      };
    } catch (error) {
      return handleRouteError(request, error);
    }
  });

  authApp.post?.("/api/v1/auth/api-keys", async ({ request, body }: any) => {
    try {
      const payload = (body ?? {}) as CreateApiKeyInput;
      const created = await options.authService.createApiKey(request, payload);

      return {
        data: {
          key: created.key,
          ...created.metadata,
        },
      };
    } catch (error) {
      return handleRouteError(request, error);
    }
  });

  authApp.post?.(
    "/api/v1/auth/api-keys/:keyId/revoke",
    async ({ request, params }: any) => {
      try {
        const metadata = await options.authService.revokeApiKey(
          request,
          params.keyId,
        );

        return {
          data: metadata,
        };
      } catch (error) {
        return handleRouteError(request, error);
      }
    },
  );

  // Expose Better Auth native endpoints under /api/v1/auth/*
  authApp.post?.("/api/v1/auth/sign-up/email", ({ request }: any) =>
    options.authService.handleAuthRequest(request),
  );
  authApp.post?.("/api/v1/auth/sign-in/email", ({ request }: any) =>
    options.authService.handleAuthRequest(request),
  );
  authApp.post?.("/api/v1/auth/sign-out", ({ request }: any) =>
    options.authService.handleAuthRequest(request),
  );
  authApp.get?.("/api/v1/auth/get-session", async ({ request }: any) => {
    try {
      const session = await options.authService.getSession(request);

      if (!session) {
        throw new RuntimeError({
          code: "UNAUTHORIZED",
          message: "A valid Studio session is required.",
          statusCode: 401,
        });
      }

      return {
        data: {
          session,
        },
      };
    } catch (error) {
      return handleRouteError(request, error);
    }
  });
}
