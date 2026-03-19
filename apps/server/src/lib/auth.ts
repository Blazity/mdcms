import { createHash, randomBytes } from "node:crypto";

import { RuntimeError, serializeError } from "@mdcms/shared";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { DiscoveryError, discoverOIDCConfig, sso } from "@better-auth/sso";
import { z } from "zod";

import type { DrizzleDatabase } from "./db.js";
import {
  apiKeys,
  authAccounts,
  authLoginBackoffs,
  authUsers,
  authSessions,
  authVerifications,
  cliLoginChallenges,
  rbacGrants,
  type ApiKeyScopeTuple,
} from "./db/schema.js";
import {
  evaluatePermission,
  type RbacAction,
  type RbacGrant,
  type RbacRole,
} from "./rbac.js";
import {
  parseServerEnv,
  type OidcProviderConfig,
  type OidcTokenEndpointAuthMethod,
  type SamlProviderConfig,
} from "./env.js";
import {
  createJsonResponse,
  executeWithRuntimeErrorsHandled,
} from "./http-utils.js";

export const API_KEY_OPERATION_SCOPES = [
  "content:read",
  "content:read:draft",
  "content:write",
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
const LEGACY_CONTENT_WRITE_DRAFT_SCOPE = "content:write:draft";
const SESSION_INACTIVITY_TIMEOUT_SECONDS = 2 * 60 * 60;
const SESSION_ABSOLUTE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CLI_LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const LOGIN_BACKOFF_RESET_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BACKOFF_DELAYS_SECONDS = [1, 2, 4, 8, 16, 32] as const;
const CSRF_COOKIE_NAME = "mdcms_csrf";
const CSRF_HEADER_NAME = "x-mdcms-csrf-token";
const CSRF_TOKEN_BYTES = 24;
const OIDC_CALLBACK_PROVISIONING_WINDOW_MS = 5_000;
const CLI_LOGIN_DEFAULT_SCOPES: readonly ApiKeyOperationScope[] = [
  "content:read",
  "content:read:draft",
  "content:write",
];

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
  role?: RbacRole;
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

export type CliLoginStartInput = {
  project: string;
  environment: string;
  redirectUri: string;
  state: string;
  scopes?: ApiKeyOperationScope[];
};

export type CliLoginStartResult = {
  challengeId: string;
  authorizeUrl: string;
  expiresAt: string;
};

export type CliLoginAuthorizeInput = {
  challengeId: string;
  state: string;
  email?: string;
  password?: string;
  request: Request;
};

export type CliLoginAuthorizeResult =
  | {
      outcome: "login_required";
      challengeId: string;
      state: string;
    }
  | {
      outcome: "throttled";
      retryAfterSeconds: number;
    }
  | {
      outcome: "redirect";
      location: string;
      setCookie?: string;
    };

export type CliLoginExchangeInput = {
  challengeId: string;
  state: string;
  code: string;
};

export type AuthService = {
  login: (
    request: Request,
    email: string,
    password: string,
  ) => Promise<PasswordLoginResult>;
  getSession: (request: Request) => Promise<StudioSession | undefined>;
  requireAdminSession: (request: Request) => Promise<StudioSession>;
  logout: (request: Request) => Promise<{
    revoked: boolean;
    setCookie?: string;
  }>;
  signOut: (request: Request) => Promise<Response>;
  authorizeRequest: (
    request: Request,
    requirement: AuthorizationRequirement,
  ) => Promise<AuthorizedRequest>;
  requireCsrfProtection: (request: Request) => Promise<void>;
  issueCsrfCookie: () => string;
  clearCsrfCookie: () => string;
  createApiKey: (
    request: Request,
    input: CreateApiKeyInput,
  ) => Promise<{ key: string; metadata: ApiKeyMetadata }>;
  listApiKeys: (request: Request) => Promise<ApiKeyMetadata[]>;
  revokeApiKey: (request: Request, keyId: string) => Promise<ApiKeyMetadata>;
  revokeSelfApiKey: (
    request: Request,
  ) => Promise<{ revoked: boolean; keyId: string }>;
  startCliLogin: (input: CliLoginStartInput) => Promise<CliLoginStartResult>;
  authorizeCliLogin: (
    input: CliLoginAuthorizeInput,
  ) => Promise<CliLoginAuthorizeResult>;
  exchangeCliLogin: (
    input: CliLoginExchangeInput,
  ) => Promise<{ key: string; metadata: ApiKeyMetadata }>;
  revokeAllUserSessions: (userId: string) => Promise<number>;
  revokeAllSessionsForUserByAdmin: (
    request: Request,
    userId: string,
  ) => Promise<{
    userId: string;
    revokedSessions: number;
  }>;
  startSsoSignIn: (request: Request) => Promise<Response>;
  handleSsoCallback: (request: Request) => Promise<Response>;
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

type PasswordLoginResult =
  | {
      outcome: "success";
      session: StudioSession;
      setCookie: string;
    }
  | {
      outcome: "throttled";
      retryAfterSeconds: number;
    };

type AuthRouteApp = {
  get?: (path: string, handler: (ctx: any) => unknown) => AuthRouteApp;
  post?: (path: string, handler: (ctx: any) => unknown) => AuthRouteApp;
};

type StaticOidcProvider = {
  providerId: OidcProviderConfig["providerId"];
  domain: string;
  oidcConfig: {
    issuer: string;
    discoveryEndpoint: string;
    clientId: string;
    clientSecret: string;
    pkce: true;
    scopes: string[];
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    userInfoEndpoint?: string;
    jwksEndpoint?: string;
    tokenEndpointAuthentication?: OidcTokenEndpointAuthMethod;
    mapping: {
      id: "sub";
      email: "email";
      emailVerified: "email_verified";
      name: "name";
      image: "picture";
      extraFields: {
        givenName: "given_name";
        familyName: "family_name";
        preferredUsername: "preferred_username";
      };
    };
  };
};

type StaticSamlProvider = {
  providerId: SamlProviderConfig["providerId"];
  domain: string;
  samlConfig: {
    issuer: string;
    entryPoint: string;
    cert: string;
    callbackUrl: string;
    audience?: string;
    spMetadata: {
      entityID?: string;
    };
    identifierFormat?: string;
    authnRequestsSigned?: boolean;
    wantAssertionsSigned?: boolean;
    mapping?: SamlProviderConfig["attributeMapping"];
  };
};

type StaticSsoPluginOptions = NonNullable<Parameters<typeof sso>[0]>;

type OidcCanonicalClaims = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
};

type OidcCallbackRecord = {
  sessionId: string;
  sessionCreatedAt: Date;
  userId: string;
  userCreatedAt: Date;
  userEmail: string;
  userEmailVerified: boolean;
  userName: string;
  userImage: string | null;
  accountRowId: string;
  accountCreatedAt: Date;
  accountId: string;
  accountAccessToken: string | null;
  accountIdToken: string | null;
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

const CliLoginStartInputSchema = z.object({
  project: z.string().trim().min(1),
  environment: z.string().trim().min(1),
  redirectUri: z.string().trim().url(),
  state: z.string().trim().min(16).max(256),
  scopes: z.array(z.enum(API_KEY_OPERATION_SCOPES)).min(1).optional(),
});

const CliLoginExchangeInputSchema = z.object({
  challengeId: z.string().uuid(),
  state: z.string().trim().min(16).max(256),
  code: z.string().trim().min(16).max(256),
});

const SsoSignInInputSchema = z
  .object({
    providerId: z.string().trim().min(1),
    callbackURL: z.string().trim().min(1),
    errorCallbackURL: z.string().trim().min(1).optional(),
    newUserCallbackURL: z.string().trim().min(1).optional(),
    loginHint: z.string().trim().min(1).optional(),
  })
  .strict();

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

function appendSetCookieHeaders(
  ...values: Array<string | null | undefined>
): string | undefined {
  const normalized = values
    .flatMap(
      (value) =>
        value
          ?.split(/,(?=\s*[A-Za-z0-9_-]+=)/)
          .map((part) => part.trim())
          .filter((part) => part.length > 0) ?? [],
    )
    .filter((value, index, array) => array.indexOf(value) === index);

  return normalized.length > 0 ? normalized.join(", ") : undefined;
}

function normalizeOptionalOidcClaimString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function selectOidcClaimString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeOptionalOidcClaimString(value);

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function selectOidcBooleanClaim(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (value === true || value === false) {
      return value;
    }
  }

  return undefined;
}

function decodeJwtPayload(
  token: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!token) {
    return undefined;
  }

  const [, payload] = token.split(".");

  if (!payload) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function normalizeOidcClaims(
  claims: Record<string, unknown>,
): OidcCanonicalClaims {
  const id = normalizeOptionalOidcClaimString(claims.sub);
  const email = normalizeOptionalOidcClaimString(claims.email);

  if (!id || !email) {
    throw createRequiredOidcClaimError();
  }

  const combinedName = [
    normalizeOptionalOidcClaimString(claims.given_name),
    normalizeOptionalOidcClaimString(claims.family_name),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  return {
    id,
    email,
    emailVerified: claims.email_verified === true,
    name:
      normalizeOptionalOidcClaimString(claims.name) ||
      combinedName ||
      normalizeOptionalOidcClaimString(claims.preferred_username) ||
      email,
    image: normalizeOptionalOidcClaimString(claims.picture) ?? null,
  };
}

function wasCreatedDuringOidcCallback(
  createdAt: Date,
  sessionCreatedAt: Date,
): boolean {
  return (
    Math.abs(createdAt.getTime() - sessionCreatedAt.getTime()) <=
    OIDC_CALLBACK_PROVISIONING_WINDOW_MS
  );
}

function serializeCookie(input: {
  name: string;
  value: string;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
  httpOnly?: boolean;
  maxAge?: number;
}): string {
  const parts = [`${input.name}=${input.value}`];

  if (input.path) {
    parts.push(`Path=${input.path}`);
  }

  if (input.maxAge !== undefined) {
    parts.push(`Max-Age=${input.maxAge}`);
  }

  if (input.sameSite) {
    parts.push(`SameSite=${input.sameSite}`);
  }

  if (input.secure) {
    parts.push("Secure");
  }

  if (input.httpOnly) {
    parts.push("HttpOnly");
  }

  return parts.join("; ");
}

function readCookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const candidate of cookieHeader.split(";")) {
    const trimmed = candidate.trim();

    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }

  return undefined;
}

function isStateChangingMethod(method: string): boolean {
  const normalized = method.trim().toUpperCase();
  return (
    normalized.length > 0 &&
    normalized !== "GET" &&
    normalized !== "HEAD" &&
    normalized !== "OPTIONS"
  );
}

function withSetCookie(
  response: Response,
  setCookie: string | undefined,
): Response {
  if (!setCookie) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set(
    "set-cookie",
    appendSetCookieHeaders(headers.get("set-cookie"), setCookie) ?? setCookie,
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

function hashCliLoginToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertLoopbackRedirectUri(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: 'Field "redirectUri" must be a valid URL.',
      statusCode: 400,
      details: { field: "redirectUri" },
    });
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopbackHost =
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

  if (parsed.protocol !== "http:" || !isLoopbackHost) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message:
        'Field "redirectUri" must use loopback HTTP origin (127.0.0.1, localhost, or ::1).',
      statusCode: 400,
      details: { field: "redirectUri", value },
    });
  }

  if (!parsed.port) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: 'Field "redirectUri" must include an explicit loopback port.',
      statusCode: 400,
      details: { field: "redirectUri", value },
    });
  }

  return parsed.toString();
}

function appendQueryParams(
  url: string,
  params: Record<string, string>,
): string {
  const parsed = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }

  return parsed.toString();
}

function renderCliAuthorizeLoginForm(input: {
  challengeId: string;
  state: string;
}): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    "<title>MDCMS CLI Login</title>",
    "<style>body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:420px;margin:48px auto;padding:0 16px;}label{display:block;font-size:14px;margin-top:12px;}input{width:100%;padding:8px;margin-top:4px;box-sizing:border-box;}button{margin-top:16px;padding:10px 14px;cursor:pointer;}</style>",
    "</head>",
    "<body>",
    "<h1>MDCMS CLI Login</h1>",
    "<p>Zaloguj się, aby autoryzować CLI.</p>",
    `<form method="post" action="/api/v1/auth/cli/login/authorize?challenge=${encodeURIComponent(input.challengeId)}&state=${encodeURIComponent(input.state)}">`,
    '<label>Email<input name="email" type="email" autocomplete="email" required /></label>',
    '<label>Password<input name="password" type="password" autocomplete="current-password" required /></label>',
    '<button type="submit">Authorize CLI</button>',
    "</form>",
    "</body>",
    "</html>",
  ].join("");
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

function createInvalidInputError(
  message: string,
  details: Record<string, unknown> = {},
): RuntimeError {
  return new RuntimeError({
    code: "INVALID_INPUT",
    message,
    statusCode: 400,
    details,
  });
}

function createSsoProviderNotConfiguredError(providerId: string): RuntimeError {
  return new RuntimeError({
    code: "SSO_PROVIDER_NOT_CONFIGURED",
    message: `SSO provider "${providerId}" is not configured.`,
    statusCode: 404,
    details: {
      providerId,
    },
  });
}

function createRequiredOidcClaimError(): RuntimeError {
  return new RuntimeError({
    code: "AUTH_OIDC_REQUIRED_CLAIM_MISSING",
    message: "OIDC provider response is missing required claims.",
    statusCode: 401,
  });
}

function createAuthProviderError(
  error: string,
  errorDescription: string,
): RuntimeError {
  return new RuntimeError({
    code: "AUTH_PROVIDER_ERROR",
    message: "SSO provider callback failed.",
    statusCode: 502,
    details: {
      providerError: error,
      providerErrorDescription: errorDescription,
    },
  });
}

function createDiscoveryEndpoint(issuer: string): string {
  const url = new URL(issuer);
  const normalizedPath = url.pathname.replace(/\/$/, "");
  url.pathname = `${normalizedPath}/.well-known/openid-configuration`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function createAuthRouteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

function hasResolvedDiscoveryOverrides(provider: OidcProviderConfig): boolean {
  return Boolean(
    provider.discoveryOverrides?.authorizationEndpoint &&
      provider.discoveryOverrides?.tokenEndpoint &&
      provider.discoveryOverrides?.jwksUri,
  );
}

function createInvalidEnvDiscoveryError(
  provider: OidcProviderConfig,
  error: unknown,
): RuntimeError {
  const details: Record<string, unknown> = {
    providerId: provider.providerId,
    issuer: provider.issuer,
  };

  if (error instanceof DiscoveryError) {
    details.discoveryCode = error.code;
  }

  return new RuntimeError({
    code: "INVALID_ENV",
    message: `OIDC discovery failed for provider "${provider.providerId}".`,
    statusCode: 500,
    details,
  });
}

function createStartupDiscoveryConfig(provider: OidcProviderConfig) {
  return {
    issuer: provider.issuer,
    discoveryEndpoint: createDiscoveryEndpoint(provider.issuer),
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    pkce: true,
    scopes: [...provider.scopes],
    authorizationEndpoint: provider.discoveryOverrides?.authorizationEndpoint,
    tokenEndpoint: provider.discoveryOverrides?.tokenEndpoint,
    userInfoEndpoint: provider.discoveryOverrides?.userInfoEndpoint,
    jwksEndpoint: provider.discoveryOverrides?.jwksUri,
    tokenEndpointAuthentication:
      provider.discoveryOverrides?.tokenEndpointAuthMethod,
    mapping: {
      id: "sub" as const,
      email: "email" as const,
      emailVerified: "email_verified" as const,
      name: "name" as const,
      image: "picture" as const,
      extraFields: {
        givenName: "given_name" as const,
        familyName: "family_name" as const,
        preferredUsername: "preferred_username" as const,
      },
    },
  };
}

function createProviderOriginAllowlist(
  provider: OidcProviderConfig,
): Set<string> {
  return new Set([
    new URL(provider.issuer).origin,
    ...(provider.trustedOrigins ?? []),
  ]);
}

export async function resolveStartupOidcProviders(
  providers: OidcProviderConfig[],
): Promise<OidcProviderConfig[]> {
  return Promise.all(
    providers.map(async (provider) => {
      if (hasResolvedDiscoveryOverrides(provider)) {
        return provider;
      }

      const trustedOrigins = createProviderOriginAllowlist(provider);

      try {
        const discovered = await discoverOIDCConfig({
          issuer: provider.issuer,
          existingConfig: createStartupDiscoveryConfig(provider),
          isTrustedOrigin: (url) => {
            try {
              return trustedOrigins.has(new URL(url).origin);
            } catch {
              return false;
            }
          },
        });

        return {
          ...provider,
          discoveryOverrides: {
            authorizationEndpoint: discovered.authorizationEndpoint,
            tokenEndpoint: discovered.tokenEndpoint,
            userInfoEndpoint: discovered.userInfoEndpoint,
            jwksUri: discovered.jwksEndpoint,
            tokenEndpointAuthMethod:
              discovered.tokenEndpointAuthentication ??
              provider.discoveryOverrides?.tokenEndpointAuthMethod ??
              "client_secret_basic",
          },
        };
      } catch (error) {
        throw createInvalidEnvDiscoveryError(provider, error);
      }
    }),
  );
}

export function buildStaticOidcProviders(
  _baseUrl: string,
  providers: OidcProviderConfig[],
): StaticOidcProvider[] {
  return providers.map((provider) => {
    if (!hasResolvedDiscoveryOverrides(provider)) {
      throw new RuntimeError({
        code: "INVALID_ENV",
        message: `OIDC provider "${provider.providerId}" must have resolved discovery metadata before auth startup.`,
        statusCode: 500,
        details: {
          providerId: provider.providerId,
          issuer: provider.issuer,
        },
      });
    }

    return {
      providerId: provider.providerId,
      domain: provider.domain,
      oidcConfig: {
        issuer: provider.issuer,
        discoveryEndpoint: createDiscoveryEndpoint(provider.issuer),
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
        pkce: true,
        scopes: [...provider.scopes],
        authorizationEndpoint:
          provider.discoveryOverrides?.authorizationEndpoint,
        tokenEndpoint: provider.discoveryOverrides?.tokenEndpoint,
        userInfoEndpoint: provider.discoveryOverrides?.userInfoEndpoint,
        jwksEndpoint: provider.discoveryOverrides?.jwksUri,
        tokenEndpointAuthentication:
          provider.discoveryOverrides?.tokenEndpointAuthMethod,
        mapping: {
          id: "sub",
          email: "email",
          emailVerified: "email_verified",
          name: "name",
          image: "picture",
          extraFields: {
            givenName: "given_name",
            familyName: "family_name",
            preferredUsername: "preferred_username",
          },
        },
      },
    };
  });
}

export function buildStaticSamlProviders(
  baseUrl: string,
  providers: SamlProviderConfig[],
): StaticSamlProvider[] {
  return providers.map((provider) => ({
    providerId: provider.providerId,
    domain: provider.domain,
    samlConfig: {
      issuer: provider.issuer,
      entryPoint: provider.entryPoint,
      cert: provider.cert,
      callbackUrl: createAuthRouteUrl(
        baseUrl,
        `/api/v1/auth/sso/saml2/sp/acs/${provider.providerId}`,
      ),
      audience: provider.audience,
      spMetadata: {
        entityID: provider.spEntityId,
      },
      identifierFormat: provider.identifierFormat,
      authnRequestsSigned: provider.authnRequestsSigned,
      wantAssertionsSigned: provider.wantAssertionsSigned,
      mapping: provider.attributeMapping,
    },
  }));
}

export function buildStaticSsoPluginOptions(
  baseUrl: string,
  oidcProviders: OidcProviderConfig[],
  samlProviders: SamlProviderConfig[],
): StaticSsoPluginOptions {
  return {
    defaultSSO: [
      ...buildStaticOidcProviders(baseUrl, oidcProviders),
      ...buildStaticSamlProviders(baseUrl, samlProviders),
    ],
    providersLimit: 0,
    saml: {
      enableInResponseToValidation: true,
      allowIdpInitiated: false,
      requireTimestamps: true,
    },
  };
}

export function validateSsoRedirectUrl(
  value: string,
  field: string,
  baseUrl: string,
): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  let target: URL;
  let appOrigin: string;

  try {
    target = new URL(trimmed);
    appOrigin = new URL(baseUrl).origin;
  } catch {
    throw createInvalidInputError(
      `Field "${field}" must be a relative path or same-origin absolute URL.`,
      { field, value },
    );
  }

  if (target.origin !== appOrigin) {
    throw createInvalidInputError(
      `Field "${field}" must be a relative path or same-origin absolute URL.`,
      { field, value },
    );
  }

  return trimmed;
}

export function mapSsoCallbackErrorCode(
  location: string,
  providerId?: string,
): RuntimeError | undefined {
  let url: URL;

  try {
    url = new URL(location, "http://localhost");
  } catch {
    return createAuthProviderError("invalid_redirect", location);
  }

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description") ?? "";
  const normalizedDescription = errorDescription.toLowerCase();

  if (!error) {
    return undefined;
  }

  if (
    error === "invalid_provider" &&
    normalizedDescription.includes("missing_user_info")
  ) {
    return createRequiredOidcClaimError();
  }

  if (
    error === "invalid_provider" &&
    normalizedDescription.includes("provider not found")
  ) {
    return createSsoProviderNotConfiguredError(providerId ?? "unknown");
  }

  if (error === "invalid_state") {
    return createInvalidInputError("OIDC callback state is invalid.");
  }

  return createAuthProviderError(error, errorDescription);
}

export function validateSsoSignInPayload(
  payload: unknown,
  baseUrl: string,
  configuredProviderIds: ReadonlySet<string>,
): z.infer<typeof SsoSignInInputSchema> {
  const parsed = SsoSignInInputSchema.safeParse(payload);

  if (!parsed.success) {
    throw createInvalidInputError("SSO sign-in payload is invalid.", {
      issues: parsed.error.issues,
    });
  }

  if (!configuredProviderIds.has(parsed.data.providerId)) {
    throw createSsoProviderNotConfiguredError(parsed.data.providerId);
  }

  validateSsoRedirectUrl(parsed.data.callbackURL, "callbackURL", baseUrl);

  if (parsed.data.errorCallbackURL) {
    validateSsoRedirectUrl(
      parsed.data.errorCallbackURL,
      "errorCallbackURL",
      baseUrl,
    );
  }

  if (parsed.data.newUserCallbackURL) {
    validateSsoRedirectUrl(
      parsed.data.newUserCallbackURL,
      "newUserCallbackURL",
      baseUrl,
    );
  }

  return parsed.data;
}

function resolveAuthBaseUrl(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.MDCMS_SERVER_URL?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  const port = env.PORT?.trim() || "4000";
  return `http://localhost:${port}`;
}

function collectTrustedOrigins(
  baseUrl: string,
  providers: OidcProviderConfig[],
): string[] {
  const trustedOrigins = new Set<string>([new URL(baseUrl).origin]);

  for (const provider of providers) {
    trustedOrigins.add(new URL(provider.issuer).origin);

    for (const origin of provider.trustedOrigins ?? []) {
      trustedOrigins.add(origin);
    }
  }

  return [...trustedOrigins];
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

  if (requiredScope === "content:read:draft") {
    return "content:read:draft";
  }

  if (
    requiredScope === "content:write" ||
    requiredScope === LEGACY_CONTENT_WRITE_DRAFT_SCOPE
  ) {
    return "content:write";
  }

  if (requiredScope === "content:publish") {
    return "content:publish";
  }

  if (requiredScope === "content:delete") {
    return "content:delete";
  }

  if (requiredScope === "schema:read") {
    return "schema:read";
  }

  if (requiredScope === "schema:write") {
    return "schema:write";
  }

  return null;
}

function apiKeyScopesSatisfyRequirement(
  scopes: readonly ApiKeyOperationScope[],
  requiredScope: ApiKeyOperationScope,
): boolean {
  if (scopes.includes(requiredScope)) {
    return true;
  }

  if (requiredScope === "content:write") {
    return scopes.includes(LEGACY_CONTENT_WRITE_DRAFT_SCOPE);
  }

  return false;
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

function normalizeLoginBackoffKey(email: string): string {
  return email.trim().toLowerCase();
}

function getLoginBackoffDelaySeconds(failureCount: number): number {
  const index = Math.max(0, failureCount - 1);
  return (
    LOGIN_BACKOFF_DELAYS_SECONDS[
      Math.min(index, LOGIN_BACKOFF_DELAYS_SECONDS.length - 1)
    ] ?? LOGIN_BACKOFF_DELAYS_SECONDS[LOGIN_BACKOFF_DELAYS_SECONDS.length - 1]
  );
}

function hasLoginBackoffWindowExpired(
  row: typeof authLoginBackoffs.$inferSelect,
  nowMs: number,
): boolean {
  return nowMs - row.lastFailedAt.getTime() >= LOGIN_BACKOFF_RESET_WINDOW_MS;
}

function getRetryAfterSeconds(nextAllowedAt: Date, nowMs: number): number {
  return Math.max(1, Math.ceil((nextAllowedAt.getTime() - nowMs) / 1000));
}

function createAuthBackoffError(retryAfterSeconds: number): RuntimeError {
  return new RuntimeError({
    code: "AUTH_BACKOFF_ACTIVE",
    message: `Too many failed login attempts. Retry after ${retryAfterSeconds} seconds.`,
    statusCode: 429,
    details: {
      retryAfterSeconds,
    },
  });
}

function createAuthBackoffResponse(
  request: Request,
  retryAfterSeconds: number,
): Response {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  return createJsonResponse(
    serializeError(createAuthBackoffError(retryAfterSeconds), { requestId }),
    429,
    {
      "retry-after": String(retryAfterSeconds),
    },
  );
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
  const parsedEnv = parseServerEnv(rawEnv);
  const baseUrl = resolveAuthBaseUrl(rawEnv);
  const secret = resolveAuthSecret(rawEnv);
  const useSecureCookies = resolveSecureCookiePolicy(rawEnv);
  const adminAllowlist = resolveAdminAllowlist(rawEnv);
  const ssoPluginOptions = buildStaticSsoPluginOptions(
    baseUrl,
    parsedEnv.MDCMS_AUTH_OIDC_PROVIDERS,
    parsedEnv.MDCMS_AUTH_SAML_PROVIDERS,
  );
  const trustedOrigins = collectTrustedOrigins(
    baseUrl,
    parsedEnv.MDCMS_AUTH_OIDC_PROVIDERS,
  );
  const oidcProviderConfigById = new Map(
    parsedEnv.MDCMS_AUTH_OIDC_PROVIDERS.map((provider) => [
      provider.providerId,
      provider,
    ]),
  );
  const configuredSsoProviderIds = new Set(
    ssoPluginOptions.defaultSSO?.map((provider) => provider.providerId) ?? [],
  );
  const oidcCallbackHookErrors = new Map<string, RuntimeError>();
  const isAdminSession =
    options.isAdminSession ??
    ((session: StudioSession) =>
      adminAllowlist.userIds.has(session.userId) ||
      adminAllowlist.emails.has(session.email.toLowerCase()));

  function createCsrfCookie(): string {
    return serializeCookie({
      name: CSRF_COOKIE_NAME,
      value: randomBytes(CSRF_TOKEN_BYTES).toString("base64url"),
      path: "/",
      sameSite: "Strict",
      secure: useSecureCookies,
      maxAge: SESSION_INACTIVITY_TIMEOUT_SECONDS,
    });
  }

  function createClearedCsrfCookie(): string {
    return serializeCookie({
      name: CSRF_COOKIE_NAME,
      value: "",
      path: "/",
      sameSite: "Strict",
      secure: useSecureCookies,
      maxAge: 0,
    });
  }

  async function loadOidcCallbackRecord(
    sessionId: string,
    userId: string,
    providerId: string,
  ): Promise<OidcCallbackRecord> {
    const [record] = await options.db
      .select({
        sessionId: authSessions.id,
        sessionCreatedAt: authSessions.createdAt,
        userId: authUsers.id,
        userCreatedAt: authUsers.createdAt,
        userEmail: authUsers.email,
        userEmailVerified: authUsers.emailVerified,
        userName: authUsers.name,
        userImage: authUsers.image,
        accountRowId: authAccounts.id,
        accountCreatedAt: authAccounts.createdAt,
        accountId: authAccounts.accountId,
        accountAccessToken: authAccounts.accessToken,
        accountIdToken: authAccounts.idToken,
      })
      .from(authSessions)
      .innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
      .innerJoin(
        authAccounts,
        and(
          eq(authAccounts.userId, authUsers.id),
          eq(authAccounts.providerId, providerId),
        ),
      )
      .where(and(eq(authSessions.id, sessionId), eq(authUsers.id, userId)))
      .orderBy(desc(authAccounts.updatedAt))
      .limit(1);

    if (!record) {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "OIDC callback did not produce a persisted auth account.",
        statusCode: 500,
        details: {
          providerId,
          sessionId,
          userId,
        },
      });
    }

    return record;
  }

  async function loadOidcUserInfoClaims(
    providerId: string,
    accessToken: string | null,
  ): Promise<Record<string, unknown> | undefined> {
    const provider = oidcProviderConfigById.get(
      providerId as OidcProviderConfig["providerId"],
    );
    const userInfoEndpoint = provider?.discoveryOverrides?.userInfoEndpoint;

    if (!accessToken || !userInfoEndpoint) {
      return undefined;
    }

    try {
      const response = await fetch(userInfoEndpoint, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return undefined;
      }

      const body = (await response.json().catch(() => undefined)) as
        | Record<string, unknown>
        | undefined;

      return body && !Array.isArray(body) ? body : undefined;
    } catch {
      return undefined;
    }
  }

  async function rollbackInvalidOidcCallbackRecord(
    record: OidcCallbackRecord,
  ): Promise<void> {
    await options.db
      .delete(authSessions)
      .where(eq(authSessions.id, record.sessionId));

    const createdAccountDuringCallback = wasCreatedDuringOidcCallback(
      record.accountCreatedAt,
      record.sessionCreatedAt,
    );

    if (createdAccountDuringCallback) {
      await options.db
        .delete(authAccounts)
        .where(eq(authAccounts.id, record.accountRowId));
    }

    const [remainingAccount] = await options.db
      .select({
        id: authAccounts.id,
      })
      .from(authAccounts)
      .where(eq(authAccounts.userId, record.userId))
      .limit(1);
    const [remainingSession] = await options.db
      .select({
        id: authSessions.id,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, record.userId))
      .limit(1);

    if (!remainingAccount && !remainingSession) {
      await options.db.delete(authUsers).where(eq(authUsers.id, record.userId));
    }
  }

  async function synchronizeOidcCallbackUser(
    sessionId: string,
    userId: string,
    providerId: string,
  ): Promise<void> {
    const record = await loadOidcCallbackRecord(sessionId, userId, providerId);
    const idTokenClaims = decodeJwtPayload(record.accountIdToken);
    const userInfoClaims = await loadOidcUserInfoClaims(
      providerId,
      record.accountAccessToken,
    );
    let normalized: OidcCanonicalClaims;

    try {
      normalized = normalizeOidcClaims({
        sub: selectOidcClaimString(
          idTokenClaims?.sub,
          userInfoClaims?.sub,
          record.accountId,
        ),
        email: selectOidcClaimString(
          idTokenClaims?.email,
          userInfoClaims?.email,
          record.userEmail,
        ),
        email_verified:
          selectOidcBooleanClaim(
            idTokenClaims?.email_verified,
            userInfoClaims?.email_verified,
          ) ?? false,
        name: selectOidcClaimString(
          idTokenClaims?.name,
          userInfoClaims?.name,
          record.userName,
        ),
        picture: selectOidcClaimString(
          idTokenClaims?.picture,
          userInfoClaims?.picture,
          record.userImage,
        ),
        preferred_username: selectOidcClaimString(
          idTokenClaims?.preferred_username,
          userInfoClaims?.preferred_username,
        ),
        given_name: selectOidcClaimString(
          idTokenClaims?.given_name,
          userInfoClaims?.given_name,
        ),
        family_name: selectOidcClaimString(
          idTokenClaims?.family_name,
          userInfoClaims?.family_name,
        ),
      });
    } catch (error) {
      await rollbackInvalidOidcCallbackRecord(record);

      if (error instanceof RuntimeError) {
        throw error;
      }

      throw createRequiredOidcClaimError();
    }

    if (record.accountId !== normalized.id) {
      await options.db
        .update(authAccounts)
        .set({
          accountId: normalized.id,
          updatedAt: new Date(),
        })
        .where(eq(authAccounts.id, record.accountRowId));
    }

    if (
      record.userEmail === normalized.email &&
      record.userEmailVerified === normalized.emailVerified &&
      record.userName === normalized.name &&
      record.userImage === normalized.image
    ) {
      return;
    }

    await options.db
      .update(authUsers)
      .set({
        email: normalized.email,
        emailVerified: normalized.emailVerified,
        name: normalized.name,
        image: normalized.image,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, record.userId));
  }

  const auth = betterAuth({
    appName: "mdcms",
    baseURL: baseUrl,
    basePath: "/api/v1/auth",
    secret,
    trustedOrigins,
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
    plugins: [
      sso(ssoPluginOptions),
      {
        id: "mdcms-oidc-callback-normalization",
        hooks: {
          after: [
            {
              matcher(context: { path?: string }) {
                return context.path?.startsWith("/sso/callback/") ?? false;
              },
              handler: createAuthMiddleware(async (ctx) => {
                const newSession = ctx.context.newSession;

                if (!newSession?.session?.id || !newSession.user?.id) {
                  return;
                }

                const providerId =
                  typeof ctx.params?.providerId === "string"
                    ? ctx.params.providerId
                    : undefined;

                if (!providerId) {
                  return;
                }

                try {
                  await synchronizeOidcCallbackUser(
                    assertNonEmptyString(newSession.session.id, "session.id"),
                    assertNonEmptyString(newSession.user.id, "user.id"),
                    providerId,
                  );
                } catch (error) {
                  if (error instanceof RuntimeError && ctx.request?.url) {
                    oidcCallbackHookErrors.set(ctx.request.url, error);
                    return;
                  }

                  throw error;
                }
              }),
            },
          ],
        },
      },
    ],
  });

  function assertConfiguredSsoProvider(providerId: string): void {
    if (!configuredSsoProviderIds.has(providerId)) {
      throw createSsoProviderNotConfiguredError(providerId);
    }
  }

  async function parseSsoSignInPayload(request: Request): Promise<{
    providerId: string;
    callbackURL: string;
    errorCallbackURL?: string;
    newUserCallbackURL?: string;
    loginHint?: string;
  }> {
    const payload = await request
      .clone()
      .json()
      .catch(() => {
        throw createInvalidInputError(
          "SSO sign-in requires a valid JSON request body.",
        );
      });

    return validateSsoSignInPayload(payload, baseUrl, configuredSsoProviderIds);
  }

  function toRedirectResponse(response: Response, location: string): Response {
    const headers = new Headers(response.headers);
    headers.delete("content-type");
    headers.set("location", location);

    return new Response(null, {
      status: 302,
      headers,
    });
  }

  function createSsoSignInRequest(
    request: Request,
    payload: Awaited<ReturnType<typeof parseSsoSignInPayload>>,
  ): Request {
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");

    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(payload),
    });
  }

  async function findLoginBackoff(
    loginKey: string,
  ): Promise<typeof authLoginBackoffs.$inferSelect | undefined> {
    const [row] = await options.db
      .select()
      .from(authLoginBackoffs)
      .where(eq(authLoginBackoffs.loginKey, loginKey));

    return row;
  }

  async function clearLoginBackoff(loginKey: string): Promise<void> {
    await options.db
      .delete(authLoginBackoffs)
      .where(eq(authLoginBackoffs.loginKey, loginKey));
  }

  async function getActiveLoginBackoff(
    loginKey: string,
    nowMs = Date.now(),
  ): Promise<{ retryAfterSeconds: number } | undefined> {
    const row = await findLoginBackoff(loginKey);

    if (!row) {
      return undefined;
    }

    if (hasLoginBackoffWindowExpired(row, nowMs)) {
      await clearLoginBackoff(loginKey);
      return undefined;
    }

    if (row.nextAllowedAt.getTime() <= nowMs) {
      return undefined;
    }

    return {
      retryAfterSeconds: getRetryAfterSeconds(row.nextAllowedAt, nowMs),
    };
  }

  async function recordFailedLoginAttempt(
    loginKey: string,
    nowMs = Date.now(),
  ): Promise<void> {
    const now = new Date(nowMs);
    await options.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${loginKey}))`,
      );

      const [existing] = await tx
        .select()
        .from(authLoginBackoffs)
        .where(eq(authLoginBackoffs.loginKey, loginKey));
      const expired = existing
        ? hasLoginBackoffWindowExpired(existing, nowMs)
        : true;
      const seededExisting = existing && !expired ? existing : undefined;
      const failureCount = seededExisting ? seededExisting.failureCount + 1 : 1;
      const nextAllowedAt = new Date(
        nowMs + getLoginBackoffDelaySeconds(failureCount) * 1000,
      );

      await tx
        .insert(authLoginBackoffs)
        .values({
          loginKey,
          failureCount,
          firstFailedAt: seededExisting?.firstFailedAt ?? now,
          lastFailedAt: now,
          nextAllowedAt,
          createdAt: seededExisting?.createdAt ?? now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: authLoginBackoffs.loginKey,
          set: {
            failureCount,
            firstFailedAt: seededExisting?.firstFailedAt ?? now,
            lastFailedAt: now,
            nextAllowedAt,
            updatedAt: now,
          },
        });
    });
  }

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

  async function seedBootstrapOwnerIfNeeded(
    session: StudioSession,
  ): Promise<void> {
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

  async function loadSessionRbacGrants(
    session: StudioSession,
  ): Promise<RbacGrant[]> {
    await seedBootstrapOwnerIfNeeded(session);

    const rows = await options.db
      .select()
      .from(rbacGrants)
      .where(
        and(
          eq(rbacGrants.userId, session.userId),
          isNull(rbacGrants.revokedAt),
        ),
      );

    return rows.map((row) => toRbacGrant(row));
  }

  async function assertSessionRbacAuthorization(
    session: StudioSession,
    requirement: AuthorizationRequirement,
  ): Promise<RbacRole | undefined> {
    const action = toRbacAction(requirement.requiredScope);

    if (!action) {
      return undefined;
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

    return decision.effectiveRole;
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

  function normalizeRequestedCliScopes(
    scopes: ApiKeyOperationScope[] | undefined,
  ): ApiKeyOperationScope[] {
    const source =
      scopes && scopes.length > 0 ? scopes : [...CLI_LOGIN_DEFAULT_SCOPES];
    return [...new Set(source)].sort();
  }

  async function createApiKeyForUser(input: {
    userId: string;
    label: string;
    scopes: ApiKeyOperationScope[];
    contextAllowlist: ApiKeyScopeTuple[];
    expiresAt?: Date | null;
  }): Promise<{ key: string; metadata: ApiKeyMetadata }> {
    const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
    const keyHash = hashApiKey(key);
    const keyPrefix = `${key.slice(0, API_KEY_PREFIX.length + 8)}...`;

    const [created] = await options.db
      .insert(apiKeys)
      .values({
        label: input.label,
        keyPrefix,
        keyHash,
        scopes: input.scopes,
        contextAllowlist: input.contextAllowlist,
        expiresAt: input.expiresAt ?? null,
        createdByUserId: input.userId,
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
  }

  async function requireCliLoginChallenge(
    challengeId: string,
  ): Promise<typeof cliLoginChallenges.$inferSelect> {
    const normalizedChallengeId = assertNonEmptyString(
      challengeId,
      "challengeId",
    );
    const row = await options.db.query.cliLoginChallenges.findFirst({
      where: eq(cliLoginChallenges.id, normalizedChallengeId),
    });

    if (!row) {
      throw new RuntimeError({
        code: "NOT_FOUND",
        message: "CLI login challenge not found.",
        statusCode: 404,
        details: {
          challengeId: normalizedChallengeId,
        },
      });
    }

    if (row.usedAt || row.status === "exchanged") {
      throw new RuntimeError({
        code: "LOGIN_CHALLENGE_USED",
        message: "CLI login challenge has already been used.",
        statusCode: 409,
      });
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await options.db
        .update(cliLoginChallenges)
        .set({
          usedAt: new Date(),
          status: "exchanged",
        })
        .where(eq(cliLoginChallenges.id, row.id));

      throw new RuntimeError({
        code: "LOGIN_CHALLENGE_EXPIRED",
        message: "CLI login challenge expired.",
        statusCode: 410,
      });
    }

    return row;
  }

  function assertCliChallengeState(
    row: typeof cliLoginChallenges.$inferSelect,
    state: string,
  ): void {
    const normalizedState = assertNonEmptyString(state, "state");
    const stateHash = hashCliLoginToken(normalizedState);

    if (stateHash !== row.stateHash) {
      throw new RuntimeError({
        code: "INVALID_LOGIN_EXCHANGE",
        message: "CLI login state does not match challenge.",
        statusCode: 400,
      });
    }
  }

  async function loginWithEmailPassword(
    request: Request,
    email: string,
    password: string,
  ): Promise<PasswordLoginResult> {
    // MDCMS owns failed-attempt backoff here because server-side auth.api
    // calls are outside Better Auth's built-in rate limiter.
    const loginKey = normalizeLoginBackoffKey(email);
    const activeBackoff = await getActiveLoginBackoff(loginKey);

    if (activeBackoff) {
      return {
        outcome: "throttled",
        retryAfterSeconds: activeBackoff.retryAfterSeconds,
      };
    }

    const response = await auth.api.signInEmail({
      headers: request.headers,
      body: {
        email,
        password,
      },
      asResponse: true,
    });

    if (response.status >= 400) {
      await recordFailedLoginAttempt(loginKey);
      throw new RuntimeError({
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Email or password is invalid.",
        statusCode: 401,
      });
    }

    const setCookie = response.headers.get("set-cookie");
    if (!setCookie || setCookie.trim().length === 0) {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "Auth provider did not return a session cookie.",
        statusCode: 500,
      });
    }

    const cookiePair = extractCookiePair(setCookie);
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
    await clearLoginBackoff(loginKey);
    await options.db
      .delete(authSessions)
      .where(
        and(
          eq(authSessions.userId, studioSession.userId),
          ne(authSessions.id, studioSession.id),
        ),
      );

    return {
      outcome: "success",
      session: studioSession,
      setCookie:
        appendSetCookieHeaders(setCookie, createCsrfCookie()) ?? setCookie,
    };
  }

  async function getSessionIfAvailable(
    request: Request,
  ): Promise<StudioSession | undefined> {
    try {
      return await requireSession(request);
    } catch (error) {
      if (error instanceof RuntimeError && error.code === "UNAUTHORIZED") {
        return undefined;
      }

      throw error;
    }
  }

  async function assertCsrfProtection(request: Request): Promise<void> {
    if (!isStateChangingMethod(request.method)) {
      return;
    }

    // API-key requests are not susceptible to browser-driven CSRF.
    if (extractBearerToken(request.headers.get("authorization"))) {
      return;
    }

    const session = await getSessionIfAvailable(request);

    if (!session) {
      return;
    }

    const cookieToken = readCookieValue(request, CSRF_COOKIE_NAME);
    const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim();

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message:
          "Valid CSRF token is required for session-authenticated state-changing requests.",
        statusCode: 403,
      });
    }
  }

  return {
    async login(request, email, password) {
      return loginWithEmailPassword(request, email, password);
    },

    async getSession(request) {
      return getSessionIfAvailable(request);
    },

    async requireAdminSession(request) {
      return assertAdminSession(request);
    },

    async logout(request) {
      const response = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });

      return {
        revoked: response.status < 400,
        setCookie: appendSetCookieHeaders(
          response.headers.get("set-cookie"),
          createClearedCsrfCookie(),
        ),
      };
    },

    async signOut(request) {
      return withSetCookie(
        await auth.handler(request),
        createClearedCsrfCookie(),
      );
    },

    async authorizeRequest(request, requirement) {
      const bearerToken = extractBearerToken(
        request.headers.get("authorization"),
      );

      if (bearerToken) {
        const { row, metadata } = await requireActiveApiKey(bearerToken);
        const hasRequiredScope = apiKeyScopesSatisfyRequirement(
          metadata.scopes,
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
      const role = await assertSessionRbacAuthorization(session, requirement);
      return {
        mode: "session",
        principal: {
          type: "session",
          session,
          role,
        } satisfies SessionPrincipal,
      };
    },

    async requireCsrfProtection(request) {
      await assertCsrfProtection(request);
    },

    issueCsrfCookie() {
      return createCsrfCookie();
    },

    clearCsrfCookie() {
      return createClearedCsrfCookie();
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

      const expiresAt = parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : null;
      return createApiKeyForUser({
        userId: session.userId,
        label: parsed.data.label,
        scopes: parsed.data.scopes,
        contextAllowlist: parsed.data.contextAllowlist,
        expiresAt,
      });
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

    async revokeSelfApiKey(request) {
      const bearerToken = extractBearerToken(
        request.headers.get("authorization"),
      );

      if (!bearerToken) {
        throw new RuntimeError({
          code: "UNAUTHORIZED",
          message: "Authorization header with Bearer API key is required.",
          statusCode: 401,
        });
      }

      const { row } = await requireActiveApiKey(bearerToken);

      await options.db
        .update(apiKeys)
        .set({
          revokedAt: new Date(),
        })
        .where(eq(apiKeys.id, row.id));

      return {
        revoked: true,
        keyId: row.id,
      };
    },

    async startCliLogin(input) {
      const parsed = CliLoginStartInputSchema.safeParse(input);

      if (!parsed.success) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message:
            parsed.error.issues[0]?.message ??
            "CLI login start payload is invalid.",
          statusCode: 400,
        });
      }

      const redirectUri = assertLoopbackRedirectUri(parsed.data.redirectUri);
      const state = parsed.data.state.trim();
      const stateHash = hashCliLoginToken(state);
      const expiresAt = new Date(Date.now() + CLI_LOGIN_CHALLENGE_TTL_MS);
      const requestedScopes = normalizeRequestedCliScopes(parsed.data.scopes);
      const [challenge] = await options.db
        .insert(cliLoginChallenges)
        .values({
          project: parsed.data.project,
          environment: parsed.data.environment,
          redirectUri,
          requestedScopes,
          stateHash,
          status: "pending",
          expiresAt,
        })
        .returning();

      if (!challenge) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "Failed to create CLI login challenge.",
          statusCode: 500,
        });
      }

      const authorizeUrl = appendQueryParams(
        `${baseUrl}/api/v1/auth/cli/login/authorize`,
        {
          challenge: challenge.id,
          state,
        },
      );

      return {
        challengeId: challenge.id,
        authorizeUrl,
        expiresAt: challenge.expiresAt.toISOString(),
      };
    },

    async authorizeCliLogin(input) {
      const challengeId = assertNonEmptyString(
        input.challengeId,
        "challengeId",
      );
      const state = assertNonEmptyString(input.state, "state");
      const challenge = await requireCliLoginChallenge(challengeId);
      assertCliChallengeState(challenge, state);

      let session = await getSessionIfAvailable(input.request);
      let setCookie: string | undefined;

      if (!session) {
        if (!input.email || !input.password) {
          return {
            outcome: "login_required",
            challengeId,
            state,
          };
        }

        const loginResult = await loginWithEmailPassword(
          input.request,
          input.email,
          input.password,
        );

        if (loginResult.outcome === "throttled") {
          return {
            outcome: "throttled",
            retryAfterSeconds: loginResult.retryAfterSeconds,
          };
        }

        session = loginResult.session;
        setCookie = loginResult.setCookie;
      }

      if (!session) {
        throw new RuntimeError({
          code: "UNAUTHORIZED",
          message: "A valid session is required to authorize CLI login.",
          statusCode: 401,
        });
      }

      const code = randomBytes(24).toString("base64url");
      const codeHash = hashCliLoginToken(code);
      await options.db
        .update(cliLoginChallenges)
        .set({
          authorizationCodeHash: codeHash,
          userId: session.userId,
          status: "authorized",
          authorizedAt: new Date(),
        })
        .where(eq(cliLoginChallenges.id, challenge.id));

      return {
        outcome: "redirect",
        location: appendQueryParams(challenge.redirectUri, {
          code,
          state,
        }),
        setCookie,
      };
    },

    async exchangeCliLogin(input) {
      const parsed = CliLoginExchangeInputSchema.safeParse(input);

      if (!parsed.success) {
        throw new RuntimeError({
          code: "INVALID_INPUT",
          message:
            parsed.error.issues[0]?.message ??
            "CLI login exchange payload is invalid.",
          statusCode: 400,
        });
      }

      const challenge = await requireCliLoginChallenge(parsed.data.challengeId);
      assertCliChallengeState(challenge, parsed.data.state);

      if (
        challenge.status !== "authorized" ||
        !challenge.authorizationCodeHash ||
        !challenge.userId
      ) {
        throw new RuntimeError({
          code: "INVALID_LOGIN_EXCHANGE",
          message: "CLI login challenge is not ready for code exchange.",
          statusCode: 400,
        });
      }

      const codeHash = hashCliLoginToken(parsed.data.code);
      if (codeHash !== challenge.authorizationCodeHash) {
        throw new RuntimeError({
          code: "INVALID_LOGIN_EXCHANGE",
          message: "CLI login authorization code is invalid.",
          statusCode: 400,
        });
      }

      const created = await createApiKeyForUser({
        userId: challenge.userId,
        label: `cli:${challenge.project}/${challenge.environment}`,
        scopes: normalizeRequestedCliScopes(
          challenge.requestedScopes as ApiKeyOperationScope[],
        ),
        contextAllowlist: [
          {
            project: challenge.project,
            environment: challenge.environment,
          },
        ],
      });

      await options.db
        .update(cliLoginChallenges)
        .set({
          status: "exchanged",
          usedAt: new Date(),
        })
        .where(eq(cliLoginChallenges.id, challenge.id));

      return created;
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

    async startSsoSignIn(request) {
      const payload = await parseSsoSignInPayload(request);

      const response = await auth.handler(
        createSsoSignInRequest(request, payload),
      );

      if (response.status === 404) {
        throw createSsoProviderNotConfiguredError(payload.providerId);
      }

      if (response.status === 400) {
        throw createInvalidInputError("SSO sign-in payload is invalid.");
      }

      if (response.status >= 500) {
        throw createAuthProviderError("sign_in_failed", "SSO sign-in failed.");
      }

      if (response.status >= 400) {
        return response;
      }

      const body = (await response
        .clone()
        .json()
        .catch(() => undefined)) as
        | {
            url?: unknown;
            redirect?: unknown;
          }
        | undefined;
      const location =
        typeof body?.url === "string" && body.url.trim().length > 0
          ? body.url
          : undefined;

      if (!location) {
        throw new RuntimeError({
          code: "INTERNAL_ERROR",
          message: "SSO sign-in did not return a provider redirect URL.",
          statusCode: 500,
        });
      }

      return toRedirectResponse(response, location);
    },

    async handleSsoCallback(request) {
      const providerId = new URL(request.url).pathname.split("/").at(-1);
      assertConfiguredSsoProvider(
        assertNonEmptyString(providerId, "providerId"),
      );

      const response = await auth.handler(request);
      const hookError = oidcCallbackHookErrors.get(request.url);

      if (hookError) {
        oidcCallbackHookErrors.delete(request.url);
        throw hookError;
      }

      if (response.status !== 302) {
        return response;
      }

      const location = response.headers.get("location");

      if (!location) {
        return response;
      }

      const mappedError = mapSsoCallbackErrorCode(location, providerId);

      if (mappedError) {
        throw mappedError;
      }

      return response;
    },

    handleAuthRequest(request) {
      return auth.handler(request);
    },
  };
}

export type MountAuthRoutesOptions = {
  authService: AuthService;
};

function requireSessionPayload(
  session: StudioSession | undefined,
): StudioSession {
  if (!session) {
    throw createUnauthorizedSessionError("A valid Studio session is required.");
  }

  return session;
}

function parseCliLoginAuthorizeQuery(request: Request): {
  challengeId: string;
  state: string;
} {
  const url = new URL(request.url);
  const challengeId = assertNonEmptyString(
    url.searchParams.get("challenge"),
    "challenge",
  );
  const state = assertNonEmptyString(url.searchParams.get("state"), "state");
  return {
    challengeId,
    state,
  };
}

export function mountAuthRoutes(
  app: unknown,
  options: MountAuthRoutesOptions,
): void {
  const authApp = app as AuthRouteApp;

  authApp.post?.("/api/v1/auth/login", ({ request, body }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const payload = (body ?? {}) as {
        email?: unknown;
        password?: unknown;
      };
      const email = assertNonEmptyString(payload.email, "email");
      const password = assertNonEmptyString(payload.password, "password");
      const result = await options.authService.login(request, email, password);

      if (result.outcome === "throttled") {
        return createAuthBackoffResponse(request, result.retryAfterSeconds);
      }

      return createJsonResponse(
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
    }),
  );

  const mountSessionRoute = (path: string): void => {
    authApp.get?.(path, ({ request }: any) =>
      executeWithRuntimeErrorsHandled(request, async () => {
        const session = requireSessionPayload(
          await options.authService.getSession(request),
        );
        return createJsonResponse(
          {
            data: {
              session,
            },
          },
          200,
          {
            "set-cookie": options.authService.issueCsrfCookie(),
          },
        );
      }),
    );
  };

  mountSessionRoute("/api/v1/auth/session");

  authApp.post?.("/api/v1/auth/logout", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      await options.authService.requireCsrfProtection(request);
      const result = await options.authService.logout(request);

      return createJsonResponse(
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
    }),
  );

  authApp.post?.(
    "/api/v1/auth/users/:userId/sessions/revoke-all",
    ({ request, params }: any) =>
      executeWithRuntimeErrorsHandled(request, async () => {
        await options.authService.requireCsrfProtection(request);
        const result =
          await options.authService.revokeAllSessionsForUserByAdmin(
            request,
            params.userId,
          );

        return {
          data: result,
        };
      }),
  );

  authApp.get?.("/api/v1/auth/api-keys", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const rows = await options.authService.listApiKeys(request);
      return {
        data: rows,
      };
    }),
  );

  authApp.post?.("/api/v1/auth/api-keys", ({ request, body }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      await options.authService.requireCsrfProtection(request);
      const payload = (body ?? {}) as CreateApiKeyInput;
      const created = await options.authService.createApiKey(request, payload);

      return {
        data: {
          key: created.key,
          ...created.metadata,
        },
      };
    }),
  );

  authApp.post?.(
    "/api/v1/auth/api-keys/:keyId/revoke",
    ({ request, params }: any) =>
      executeWithRuntimeErrorsHandled(request, async () => {
        await options.authService.requireCsrfProtection(request);
        const metadata = await options.authService.revokeApiKey(
          request,
          params.keyId,
        );

        return {
          data: metadata,
        };
      }),
  );

  authApp.post?.("/api/v1/auth/api-keys/self/revoke", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const result = await options.authService.revokeSelfApiKey(request);
      return {
        data: result,
      };
    }),
  );

  authApp.post?.("/api/v1/auth/cli/login/start", ({ request, body }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const payload = (body ?? {}) as CliLoginStartInput;
      const started = await options.authService.startCliLogin(payload);
      return {
        data: started,
      };
    }),
  );

  authApp.get?.("/api/v1/auth/cli/login/authorize", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const query = parseCliLoginAuthorizeQuery(request);
      const result = await options.authService.authorizeCliLogin({
        challengeId: query.challengeId,
        state: query.state,
        request,
      });

      if (result.outcome === "throttled") {
        return createAuthBackoffResponse(request, result.retryAfterSeconds);
      }

      if (result.outcome === "login_required") {
        return new Response(
          renderCliAuthorizeLoginForm({
            challengeId: result.challengeId,
            state: result.state,
          }),
          {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      return createJsonResponse(
        {
          data: {
            redirectTo: result.location,
          },
        },
        302,
        {
          location: result.location,
          ...(result.setCookie
            ? {
                "set-cookie": result.setCookie,
              }
            : {}),
        },
      );
    }),
  );

  authApp.post?.("/api/v1/auth/cli/login/authorize", ({ request, body }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const query = parseCliLoginAuthorizeQuery(request);
      let email: string | undefined;
      let password: string | undefined;

      const payload = (body ?? {}) as {
        email?: unknown;
        password?: unknown;
      };
      email = typeof payload.email === "string" ? payload.email : undefined;
      password =
        typeof payload.password === "string" ? payload.password : undefined;

      if (!email || !password) {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const formData = await request.formData().catch(() => undefined);
          const formEmail = formData?.get("email");
          const formPassword = formData?.get("password");
          email = typeof formEmail === "string" ? formEmail : email;
          password = typeof formPassword === "string" ? formPassword : password;
        } else if (contentType.includes("application/json")) {
          const jsonPayload = (await request.json().catch(() => ({}))) as {
            email?: unknown;
            password?: unknown;
          };
          email =
            typeof jsonPayload.email === "string" ? jsonPayload.email : email;
          password =
            typeof jsonPayload.password === "string"
              ? jsonPayload.password
              : password;
        }
      }

      const result = await options.authService.authorizeCliLogin({
        challengeId: query.challengeId,
        state: query.state,
        email,
        password,
        request,
      });

      if (result.outcome === "throttled") {
        return createAuthBackoffResponse(request, result.retryAfterSeconds);
      }

      if (result.outcome === "login_required") {
        return new Response(
          renderCliAuthorizeLoginForm({
            challengeId: result.challengeId,
            state: result.state,
          }),
          {
            status: 401,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      return createJsonResponse(
        {
          data: {
            redirectTo: result.location,
          },
        },
        302,
        {
          location: result.location,
          ...(result.setCookie
            ? {
                "set-cookie": result.setCookie,
              }
            : {}),
        },
      );
    }),
  );

  authApp.post?.("/api/v1/auth/cli/login/exchange", ({ request, body }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      const payload = (body ?? {}) as CliLoginExchangeInput;
      const exchanged = await options.authService.exchangeCliLogin(payload);
      return {
        data: {
          key: exchanged.key,
          ...exchanged.metadata,
        },
      };
    }),
  );

  // Expose Better Auth native endpoints under /api/v1/auth/*
  authApp.post?.("/api/v1/auth/sign-up/email", ({ request }: any) =>
    options.authService.handleAuthRequest(request),
  );
  authApp.post?.("/api/v1/auth/sign-in/email", ({ request }: any) =>
    options.authService.handleAuthRequest(request),
  );
  authApp.post?.("/api/v1/auth/sign-in/sso", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () =>
      options.authService.startSsoSignIn(request),
    ),
  );
  authApp.get?.("/api/v1/auth/sso/callback/:providerId", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () =>
      options.authService.handleSsoCallback(request),
    ),
  );
  authApp.post?.("/api/v1/auth/sign-out", ({ request }: any) =>
    executeWithRuntimeErrorsHandled(request, async () => {
      await options.authService.requireCsrfProtection(request);
      return options.authService.signOut(request);
    }),
  );
  mountSessionRoute("/api/v1/auth/get-session");
}
