import { RuntimeError, serializeError } from "@mdcms/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { DrizzleDatabase } from "./db.js";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from "./db/schema.js";

export type StudioSession = {
  id: string;
  userId: string;
  email: string;
  issuedAt: string;
  expiresAt: string;
};

export type SessionPrincipal = {
  type: "session";
  session: StudioSession;
};

export type AuthorizationRequirement = {
  requiredScope: string;
  project?: string;
  environment?: string;
};

export type AuthorizedRequest = {
  mode: "session";
  principal: SessionPrincipal;
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

export type CreateAuthServiceOptions = {
  db: DrizzleDatabase;
  env?: NodeJS.ProcessEnv;
};

export function createAuthService(
  options: CreateAuthServiceOptions,
): AuthService {
  const rawEnv = options.env ?? process.env;
  const baseUrl = resolveAuthBaseUrl(rawEnv);
  const secret = resolveAuthSecret(rawEnv);

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
      expiresIn: 2 * 60 * 60,
      updateAge: 0,
    },
    advanced: {
      useSecureCookies: rawEnv.NODE_ENV === "production",
      defaultCookieAttributes: {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: rawEnv.NODE_ENV === "production",
      },
    },
    rateLimit: {
      enabled: false,
    },
  });

  async function requireSession(request: Request): Promise<StudioSession> {
    const session = (await auth.api.getSession({
      headers: request.headers,
    })) as BetterAuthLikeSession | null;

    if (!session) {
      throw new RuntimeError({
        code: "UNAUTHORIZED",
        message: "A valid Studio session is required.",
        statusCode: 401,
      });
    }

    return toStudioSession(session);
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

        return {
          session: toStudioSession(session),
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

    async authorizeRequest(request, _requirement) {
      const session = await requireSession(request);
      return {
        mode: "session",
        principal: {
          type: "session",
          session,
        } satisfies SessionPrincipal,
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
  authApp.get?.("/api/v1/auth/get-session", ({ request }: any) =>
    options.authService.handleAuthRequest(request),
  );
}
