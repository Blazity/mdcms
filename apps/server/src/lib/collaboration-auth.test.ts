import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import {
  createCollaborationAuthGuard,
  mountCollaborationRoutes,
} from "./collaboration-auth.js";
import type {
  ApiKeyMetadata,
  AuthService,
  AuthorizationRequirement,
  AuthorizedRequest,
  CreateApiKeyInput,
  StudioSession,
} from "./auth.js";
import { createServerRequestHandler } from "./server.js";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

function createSession(userId = "user-1"): StudioSession {
  return {
    id: "session-1",
    userId,
    email: `${userId}@mdcms.local`,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

function createAuthServiceStub(overrides: Partial<AuthService>): AuthService {
  const session = createSession();

  const stub: AuthService = {
    async login(_request, _email, _password) {
      return {
        outcome: "success",
        csrfToken: "fake",
        session,
        setCookie: "session_token=fake",
      };
    },
    async getSession() {
      return session;
    },
    async requireAdminSession() {
      return session;
    },
    async logout() {
      return {
        revoked: true,
      };
    },
    async signOut() {
      return new Response(null, { status: 204 });
    },
    async authorizeRequest(
      _request: Request,
      _requirement: AuthorizationRequirement,
    ): Promise<AuthorizedRequest> {
      return {
        mode: "session",
        principal: {
          type: "session",
          session,
          role: "editor",
        },
      };
    },
    async requireCsrfProtection() {
      return undefined;
    },
    issueCsrfBootstrap() {
      return {
        token: "fake",
        setCookie: "mdcms_csrf=fake",
      };
    },
    clearCsrfCookie() {
      return "mdcms_csrf=; Max-Age=0";
    },
    async createApiKey(
      _request: Request,
      _input: CreateApiKeyInput,
    ): Promise<{ key: string; metadata: ApiKeyMetadata }> {
      throw new Error("unused");
    },
    async listApiKeys() {
      return [];
    },
    async revokeApiKey() {
      throw new Error("unused");
    },
    async revokeSelfApiKey() {
      return {
        revoked: true,
        keyId: "api-key-1",
      };
    },
    async revokeAllUserSessions() {
      return 0;
    },
    async revokeAllSessionsForUserByAdmin() {
      return {
        userId: "user-1",
        revokedSessions: 0,
      };
    },
    async startSsoSignIn() {
      return new Response(null, {
        status: 302,
        headers: {
          location: "http://localhost/oidc/authorize",
        },
      });
    },
    async handleSsoCallback() {
      return new Response(null, {
        status: 302,
        headers: {
          location: "http://localhost/studio",
        },
      });
    },
    async handleSamlAcs() {
      return new Response(null, {
        status: 302,
        headers: {
          location: "http://localhost/studio",
        },
      });
    },
    async handleSamlMetadata() {
      return new Response(null, { status: 200 });
    },
    async startCliLogin() {
      return {
        challengeId: "11111111-1111-4111-8111-111111111111",
        authorizeUrl:
          "http://localhost/api/v1/auth/cli/login/authorize?challenge=11111111-1111-4111-8111-111111111111&state=state-1234567890abcdef",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      };
    },
    async authorizeCliLogin() {
      return {
        outcome: "redirect",
        location:
          "http://127.0.0.1:45123/callback?code=code-1234567890abcdef&state=state-1234567890abcdef",
      };
    },
    async exchangeCliLogin(_input) {
      return {
        key: "mdcms_key_test",
        metadata: {
          id: "api-key-1",
          label: "cli:test",
          keyPrefix: "mdcms_key_test...",
          createdByUserId: "user-1",
          scopes: ["content:read"],
          contextAllowlist: [
            {
              project: "marketing",
              environment: "staging",
            },
          ],
          createdAt: new Date().toISOString(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
        },
      };
    },
    async handleAuthRequest() {
      return new Response("not implemented", { status: 501 });
    },
  };

  return {
    ...stub,
    ...overrides,
  };
}

test("collaboration handshake rejects API key auth with 4403", async () => {
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({}),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });

  const result = await guard.authorizeHandshake(
    new Request(
      `http://localhost/api/v1/collaboration?project=marketing&environment=staging&documentId=${DOCUMENT_ID}`,
      {
        headers: {
          origin: "http://localhost:4173",
          authorization: "Bearer mdcms_key_test",
        },
      },
    ),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.closeCode, 4403);
});

test("collaboration handshake maps unauthorized session failures to 4401", async () => {
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({
      async authorizeRequest() {
        throw new RuntimeError({
          code: "UNAUTHORIZED",
          message: "No session",
          statusCode: 401,
        });
      },
    }),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });

  const result = await guard.authorizeHandshake(
    new Request(
      `http://localhost/api/v1/collaboration?project=marketing&environment=staging&documentId=${DOCUMENT_ID}`,
      {
        headers: {
          origin: "http://localhost:4173",
        },
      },
    ),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.closeCode, 4401);
});

test("collaboration handshake returns session context on success", async () => {
  const session = createSession("editor-1");
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({
      async authorizeRequest() {
        return {
          mode: "session",
          principal: {
            type: "session",
            session,
            role: "editor",
          },
        };
      },
    }),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });

  const result = await guard.authorizeHandshake(
    new Request(
      `http://localhost/api/v1/collaboration?project=marketing&environment=staging&documentId=${DOCUMENT_ID}`,
      {
        headers: {
          origin: "http://localhost:4173",
        },
      },
    ),
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.context.userId, "editor-1");
  assert.equal(result.context.role, "editor");
  assert.equal(result.context.documentPath, "blog/post-1");
});

test("collaboration handshake requires both draft-read and write permissions", async () => {
  const requiredScopes: string[] = [];
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({
      async authorizeRequest(_request, requirement) {
        requiredScopes.push(requirement.requiredScope);
        return {
          mode: "session",
          principal: {
            type: "session",
            session: createSession("editor-2"),
            role: "editor",
          },
        };
      },
    }),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });

  const result = await guard.authorizeHandshake(
    new Request(
      `http://localhost/api/v1/collaboration?project=marketing&environment=staging&documentId=${DOCUMENT_ID}`,
      {
        headers: {
          origin: "http://localhost:4173",
        },
      },
    ),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(requiredScopes, ["content:read:draft", "content:write"]);
});

test("collaboration write revalidation closes with 4401 when session is missing", async () => {
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({
      async getSession() {
        return undefined;
      },
    }),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });
  const result = await guard.revalidateWrite(
    new Request("http://localhost/api/v1/collaboration", {
      headers: {
        origin: "http://localhost:4173",
      },
    }),
    {
      userId: "user-1",
      sessionId: "session-1",
      project: "marketing",
      environment: "staging",
      documentId: DOCUMENT_ID,
      documentPath: "blog/post-1",
      role: "editor",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.closeCode, 4401);
});

test("collaboration write revalidation closes with 4403 on RBAC deny", async () => {
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({
      async authorizeRequest() {
        throw new RuntimeError({
          code: "FORBIDDEN",
          message: "Denied",
          statusCode: 403,
        });
      },
    }),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });
  const result = await guard.revalidateWrite(
    new Request("http://localhost/api/v1/collaboration", {
      headers: {
        origin: "http://localhost:4173",
      },
    }),
    {
      userId: "user-1",
      sessionId: "session-1",
      project: "marketing",
      environment: "staging",
      documentId: DOCUMENT_ID,
      documentPath: "blog/post-1",
      role: "editor",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.closeCode, 4403);
});

test("collaboration write revalidation checks draft-read and write permissions", async () => {
  const requiredScopes: string[] = [];
  const guard = createCollaborationAuthGuard({
    authService: createAuthServiceStub({
      async authorizeRequest(_request, requirement) {
        requiredScopes.push(requirement.requiredScope);
        return {
          mode: "session",
          principal: {
            type: "session",
            session: createSession("editor-3"),
            role: "editor",
          },
        };
      },
    }),
    allowedOrigins: ["http://localhost:4173"],
    resolveDocument: async () => ({ path: "blog/post-1" }),
  });
  const result = await guard.revalidateWrite(
    new Request("http://localhost/api/v1/collaboration", {
      headers: {
        origin: "http://localhost:4173",
      },
    }),
    {
      userId: "user-1",
      sessionId: "session-1",
      project: "marketing",
      environment: "staging",
      documentId: DOCUMENT_ID,
      documentPath: "blog/post-1",
      role: "editor",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(requiredScopes, ["content:read:draft", "content:write"]);
});

test("collaboration route returns 426 after successful handshake authorization", async () => {
  const handler = createServerRequestHandler({
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "debug",
      APP_VERSION: "0.0.0",
      PORT: "4000",
      SERVICE_NAME: "mdcms-server",
      MDCMS_COLLAB_ALLOWED_ORIGINS: "http://localhost:4173",
    },
    configureApp(app) {
      mountCollaborationRoutes(app, {
        authService: createAuthServiceStub({}),
        resolveDocument: async () => ({ path: "blog/post-1" }),
        env: {
          MDCMS_COLLAB_ALLOWED_ORIGINS: "http://localhost:4173",
        },
      });
    },
  });

  const response = await handler(
    new Request(
      `http://localhost/api/v1/collaboration?project=marketing&environment=staging&documentId=${DOCUMENT_ID}`,
      {
        headers: {
          origin: "http://localhost:4173",
        },
      },
    ),
  );

  assert.equal(response.status, 426);
});
