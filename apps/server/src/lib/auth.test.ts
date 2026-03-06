import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { authSessions, cliLoginChallenges, rbacGrants } from "./db/schema.js";
import { createServerRequestHandlerWithModules } from "./runtime-with-modules.js";

const env = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
  DATABASE_URL: "postgres://mdcms:mdcms@localhost:5432/mdcms",
} as NodeJS.ProcessEnv;

const logger = createConsoleLogger({
  level: "error",
  sink: () => undefined,
});

async function canConnectToDatabase(): Promise<boolean> {
  const client = postgres(env.DATABASE_URL ?? "", {
    onnotice: () => undefined,
    connect_timeout: 1,
    max: 1,
  });

  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 });
  }
}

const dbAvailable = await canConnectToDatabase();
const testWithDatabase = dbAvailable ? test : test.skip;

function uniqueEmail(): string {
  return `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mdcms.local`;
}

function extractSetCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  assert.ok(header);
  return header;
}

async function signUp(
  handler: (request: Request) => Promise<Response>,
  input: {
    email: string;
    password: string;
    name?: string;
  },
): Promise<void> {
  const response = await handler(
    new Request("http://localhost/api/v1/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        name: input.name ?? "Admin User",
      }),
    }),
  );

  assert.equal(response.status, 200);
}

async function login(
  handler: (request: Request) => Promise<Response>,
  input: {
    email: string;
    password: string;
  },
): Promise<{
  cookie: string;
  session: {
    id: string;
    userId: string;
    email: string;
    issuedAt: string;
    expiresAt: string;
  };
}> {
  const loginResponse = await handler(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );
  const loginBody = (await loginResponse.json()) as {
    data: {
      session: {
        id: string;
        userId: string;
        email: string;
        issuedAt: string;
        expiresAt: string;
      };
    };
  };

  assert.equal(loginResponse.status, 200);
  return {
    cookie: extractSetCookie(loginResponse),
    session: loginBody.data.session,
  };
}

testWithDatabase(
  "auth login issues a Studio session cookie and session is retrievable",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      const signUpResponse = await handler(
        new Request("http://localhost/api/v1/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            name: "Admin User",
          }),
        }),
      );

      assert.equal(signUpResponse.status, 200);

      const loginResponse = await handler(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }),
      );
      const loginBody = (await loginResponse.json()) as {
        data: { session: { email: string } };
      };
      const cookie = extractSetCookie(loginResponse);

      assert.equal(loginResponse.status, 200);
      assert.equal(cookie.includes("session_token="), true);
      assert.equal(loginBody.data.session.email, email);

      const sessionResponse = await handler(
        new Request("http://localhost/api/v1/auth/session", {
          headers: {
            cookie,
          },
        }),
      );
      const sessionBody = (await sessionResponse.json()) as {
        data: { session: { email: string } };
      };

      assert.equal(sessionResponse.status, 200);
      assert.equal(sessionBody.data.session.email, email);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "auth login cookie uses Strict policy and secure-by-default with local override",
  async () => {
    const secureDefaultEmail = uniqueEmail();
    const insecureOverrideEmail = uniqueEmail();
    const password = "Admin12345!";

    const secureHandlerBundle = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const insecureHandlerBundle = createServerRequestHandlerWithModules({
      env: {
        ...env,
        MDCMS_AUTH_INSECURE_COOKIES: "true",
      },
      logger,
    });

    try {
      await signUp(secureHandlerBundle.handler, {
        email: secureDefaultEmail,
        password,
      });
      const secureLogin = await login(secureHandlerBundle.handler, {
        email: secureDefaultEmail,
        password,
      });

      assert.equal(secureLogin.cookie.includes("HttpOnly"), true);
      assert.equal(secureLogin.cookie.includes("SameSite=Strict"), true);
      assert.equal(secureLogin.cookie.includes("Path=/"), true);
      assert.equal(secureLogin.cookie.includes("Secure"), true);

      await signUp(insecureHandlerBundle.handler, {
        email: insecureOverrideEmail,
        password,
      });
      const insecureLogin = await login(insecureHandlerBundle.handler, {
        email: insecureOverrideEmail,
        password,
      });

      assert.equal(insecureLogin.cookie.includes("HttpOnly"), true);
      assert.equal(insecureLogin.cookie.includes("SameSite=Strict"), true);
      assert.equal(insecureLogin.cookie.includes("Path=/"), true);
      assert.equal(insecureLogin.cookie.includes("Secure"), false);
    } finally {
      await secureHandlerBundle.dbConnection.close();
      await insecureHandlerBundle.dbConnection.close();
    }
  },
);

testWithDatabase(
  "auth session endpoint is deny-by-default without a valid session",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });

    try {
      const response = await handler(
        new Request("http://localhost/api/v1/auth/session"),
      );
      const body = (await response.json()) as { code: string };

      assert.equal(response.status, 401);
      assert.equal(body.code, "UNAUTHORIZED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase("auth logout revokes an active session", async () => {
  const { handler, dbConnection } = createServerRequestHandlerWithModules({
    env,
    logger,
  });
  const email = uniqueEmail();
  const password = "Admin12345!";

  try {
    await handler(
      new Request("http://localhost/api/v1/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          name: "Admin User",
        }),
      }),
    );

    const loginResponse = await handler(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }),
    );
    const cookie = extractSetCookie(loginResponse);

    const logoutResponse = await handler(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie,
        },
      }),
    );
    const logoutBody = (await logoutResponse.json()) as {
      data: { revoked: boolean };
    };

    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutBody.data.revoked, true);
    assert.equal(extractSetCookie(logoutResponse).includes("Max-Age=0"), true);

    const sessionResponse = await handler(
      new Request("http://localhost/api/v1/auth/session", {
        headers: {
          cookie,
        },
      }),
    );
    const sessionBody = (await sessionResponse.json()) as { code: string };

    assert.equal(sessionResponse.status, 401);
    assert.equal(sessionBody.code, "UNAUTHORIZED");
  } finally {
    await dbConnection.close();
  }
});

testWithDatabase(
  "auth session expires after inactivity timeout semantics are enforced",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      await signUp(handler, { email, password });
      const { cookie, session } = await login(handler, { email, password });

      await dbConnection.db
        .update(authSessions)
        .set({
          expiresAt: new Date(Date.now() - 60_000),
        })
        .where(eq(authSessions.id, session.id));

      const response = await handler(
        new Request("http://localhost/api/v1/auth/session", {
          headers: {
            cookie,
          },
        }),
      );
      const body = (await response.json()) as { code: string };

      assert.equal(response.status, 401);
      assert.equal(body.code, "UNAUTHORIZED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "auth session is rejected after absolute max age and removed from storage",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      await signUp(handler, { email, password });
      const { cookie, session } = await login(handler, { email, password });

      await dbConnection.db
        .update(authSessions)
        .set({
          createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .where(eq(authSessions.id, session.id));

      const response = await handler(
        new Request("http://localhost/api/v1/auth/session", {
          headers: {
            cookie,
          },
        }),
      );
      const body = (await response.json()) as { code: string };

      assert.equal(response.status, 401);
      assert.equal(body.code, "UNAUTHORIZED");

      const rows = await dbConnection.db
        .select({
          id: authSessions.id,
        })
        .from(authSessions)
        .where(eq(authSessions.id, session.id));

      assert.equal(rows.length, 0);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "native get-session route enforces absolute max age policy",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      await signUp(handler, { email, password });
      const { cookie, session } = await login(handler, { email, password });

      await dbConnection.db
        .update(authSessions)
        .set({
          createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .where(eq(authSessions.id, session.id));

      const response = await handler(
        new Request("http://localhost/api/v1/auth/get-session", {
          headers: {
            cookie,
          },
        }),
      );
      const body = (await response.json()) as { code: string };

      assert.equal(response.status, 401);
      assert.equal(body.code, "UNAUTHORIZED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "auth login rotates previous sessions for the same user",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      await signUp(handler, { email, password });
      const firstLogin = await login(handler, { email, password });
      const secondLogin = await login(handler, { email, password });

      assert.notEqual(firstLogin.session.id, secondLogin.session.id);

      const currentSessionResponse = await handler(
        new Request("http://localhost/api/v1/auth/session", {
          headers: {
            cookie: secondLogin.cookie,
          },
        }),
      );
      assert.equal(currentSessionResponse.status, 200);

      const firstSessionResponse = await handler(
        new Request("http://localhost/api/v1/auth/session", {
          headers: {
            cookie: firstLogin.cookie,
          },
        }),
      );
      const firstSessionBody = (await firstSessionResponse.json()) as {
        code: string;
      };

      assert.equal(firstSessionResponse.status, 401);
      assert.equal(firstSessionBody.code, "UNAUTHORIZED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "admin revoke-all endpoint enforces authz and revokes target sessions",
  async () => {
    const adminEmail = uniqueEmail();
    const editorEmail = uniqueEmail();
    const targetEmail = uniqueEmail();
    const password = "Admin12345!";
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env: {
        ...env,
        MDCMS_AUTH_ADMIN_EMAILS: adminEmail,
      },
      logger,
    });

    try {
      await signUp(handler, {
        email: adminEmail,
        password,
        name: "Owner User",
      });
      await signUp(handler, {
        email: editorEmail,
        password,
        name: "Editor User",
      });
      await signUp(handler, {
        email: targetEmail,
        password,
        name: "Target User",
      });

      const adminLogin = await login(handler, {
        email: adminEmail,
        password,
      });
      const editorLogin = await login(handler, {
        email: editorEmail,
        password,
      });
      const targetLogin = await login(handler, {
        email: targetEmail,
        password,
      });

      const unauthenticatedResponse = await handler(
        new Request(
          "http://localhost/api/v1/auth/users/non-existent/sessions/revoke-all",
          {
            method: "POST",
          },
        ),
      );
      const unauthenticatedBody = (await unauthenticatedResponse.json()) as {
        code: string;
      };
      assert.equal(unauthenticatedResponse.status, 401);
      assert.equal(unauthenticatedBody.code, "UNAUTHORIZED");

      const forbiddenResponse = await handler(
        new Request(
          `http://localhost/api/v1/auth/users/${targetLogin.session.userId}/sessions/revoke-all`,
          {
            method: "POST",
            headers: {
              cookie: editorLogin.cookie,
            },
          },
        ),
      );
      const forbiddenBody = (await forbiddenResponse.json()) as {
        code: string;
      };
      assert.equal(forbiddenResponse.status, 403);
      assert.equal(forbiddenBody.code, "FORBIDDEN");

      const notFoundResponse = await handler(
        new Request(
          "http://localhost/api/v1/auth/users/user-not-found/sessions/revoke-all",
          {
            method: "POST",
            headers: {
              cookie: adminLogin.cookie,
            },
          },
        ),
      );
      const notFoundBody = (await notFoundResponse.json()) as { code: string };
      assert.equal(notFoundResponse.status, 404);
      assert.equal(notFoundBody.code, "NOT_FOUND");

      const revokeResponse = await handler(
        new Request(
          `http://localhost/api/v1/auth/users/${targetLogin.session.userId}/sessions/revoke-all`,
          {
            method: "POST",
            headers: {
              cookie: adminLogin.cookie,
            },
          },
        ),
      );
      const revokeBody = (await revokeResponse.json()) as {
        data: { userId: string; revokedSessions: number };
      };

      assert.equal(revokeResponse.status, 200);
      assert.equal(revokeBody.data.userId, targetLogin.session.userId);
      assert.ok(revokeBody.data.revokedSessions >= 1);

      const targetSessionResponse = await handler(
        new Request("http://localhost/api/v1/auth/session", {
          headers: {
            cookie: targetLogin.cookie,
          },
        }),
      );
      const targetSessionBody = (await targetSessionResponse.json()) as {
        code: string;
      };

      assert.equal(targetSessionResponse.status, 401);
      assert.equal(targetSessionBody.code, "UNAUTHORIZED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "API key lifecycle supports create/list/revoke with one-time key reveal",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      await handler(
        new Request("http://localhost/api/v1/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            name: "Admin User",
          }),
        }),
      );

      const loginResponse = await handler(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }),
      );
      const cookie = extractSetCookie(loginResponse);

      const readKeyResponse = await handler(
        new Request("http://localhost/api/v1/auth/api-keys", {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            label: "read-only",
            scopes: ["content:read"],
            contextAllowlist: [
              { project: "marketing-site", environment: "production" },
            ],
          }),
        }),
      );
      const readKeyBody = (await readKeyResponse.json()) as {
        data: {
          id: string;
          key: string;
          label: string;
          revokedAt: string | null;
        };
      };

      assert.equal(readKeyResponse.status, 200);
      assert.equal(readKeyBody.data.key.startsWith("mdcms_key_"), true);
      assert.equal(readKeyBody.data.label, "read-only");
      assert.equal(readKeyBody.data.revokedAt, null);

      const listBeforeRevoke = await handler(
        new Request("http://localhost/api/v1/auth/api-keys", {
          headers: {
            cookie,
          },
        }),
      );
      const listBeforeRevokeBody = (await listBeforeRevoke.json()) as {
        data: Array<{
          id: string;
          label: string;
          revokedAt: string | null;
          key?: string;
        }>;
      };
      const createdMetadata = listBeforeRevokeBody.data.find(
        (row) => row.id === readKeyBody.data.id,
      );

      assert.equal(listBeforeRevoke.status, 200);
      assert.ok(createdMetadata);
      assert.equal(createdMetadata?.label, "read-only");
      assert.equal(createdMetadata?.revokedAt, null);
      assert.equal(
        Object.prototype.hasOwnProperty.call(createdMetadata ?? {}, "key"),
        false,
      );

      const revokeResponse = await handler(
        new Request(
          `http://localhost/api/v1/auth/api-keys/${readKeyBody.data.id}/revoke`,
          {
            method: "POST",
            headers: {
              cookie,
            },
          },
        ),
      );
      const revokeBody = (await revokeResponse.json()) as {
        data: { id: string; revokedAt: string | null };
      };

      assert.equal(revokeResponse.status, 200);
      assert.equal(revokeBody.data.id, readKeyBody.data.id);
      assert.ok(revokeBody.data.revokedAt);

      const listAfterRevoke = await handler(
        new Request("http://localhost/api/v1/auth/api-keys", {
          headers: {
            cookie,
          },
        }),
      );
      const listAfterRevokeBody = (await listAfterRevoke.json()) as {
        data: Array<{ id: string; revokedAt: string | null }>;
      };
      const revokedMetadata = listAfterRevokeBody.data.find(
        (row) => row.id === readKeyBody.data.id,
      );

      assert.equal(listAfterRevoke.status, 200);
      assert.ok(revokedMetadata?.revokedAt);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "API key content scopes split draft-read and write while keeping legacy write:draft as write-only",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";

    try {
      await signUp(handler, {
        email,
        password,
        name: "Scope Test User",
      });
      const loginResult = await login(handler, {
        email,
        password,
      });
      await dbConnection.db
        .insert(rbacGrants)
        .values({
          userId: loginResult.session.userId,
          role: "owner",
          scopeKind: "global",
          source: "test:auth-scope-split",
          createdByUserId: loginResult.session.userId,
        })
        .onConflictDoNothing();

      const createDocumentResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            cookie: loginResult.cookie,
            "x-mdcms-project": "marketing-site",
            "x-mdcms-environment": "production",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `content/posts/scope-test-${Date.now()}`,
            type: "post",
            locale: "en",
            format: "md",
            frontmatter: {
              title: "Scope test",
              slug: "scope-test",
            },
            body: "draft body",
          }),
        }),
      );
      const createDocumentBody = (await createDocumentResponse.json()) as {
        data: { documentId: string };
      };
      assert.equal(createDocumentResponse.status, 200);

      const legacyWriteKeyResponse = await handler(
        new Request("http://localhost/api/v1/auth/api-keys", {
          method: "POST",
          headers: {
            cookie: loginResult.cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            label: "legacy-write-only",
            scopes: ["content:write:draft"],
            contextAllowlist: [
              {
                project: "marketing-site",
                environment: "production",
              },
            ],
          }),
        }),
      );
      const legacyWriteKeyBody = (await legacyWriteKeyResponse.json()) as {
        data: { key: string };
      };
      assert.equal(legacyWriteKeyResponse.status, 200);

      const draftReadForbiddenResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${createDocumentBody.data.documentId}?draft=true`,
          {
            headers: {
              authorization: `Bearer ${legacyWriteKeyBody.data.key}`,
              "x-mdcms-project": "marketing-site",
              "x-mdcms-environment": "production",
            },
          },
        ),
      );
      const draftReadForbiddenBody =
        (await draftReadForbiddenResponse.json()) as {
          code: string;
        };
      assert.equal(draftReadForbiddenResponse.status, 403);
      assert.equal(draftReadForbiddenBody.code, "FORBIDDEN");

      const legacyWriteUpdateResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${createDocumentBody.data.documentId}`,
          {
            method: "PUT",
            headers: {
              authorization: `Bearer ${legacyWriteKeyBody.data.key}`,
              "x-mdcms-project": "marketing-site",
              "x-mdcms-environment": "production",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              body: "updated by legacy write scope",
            }),
          },
        ),
      );
      assert.equal(legacyWriteUpdateResponse.status, 200);

      const draftReadKeyResponse = await handler(
        new Request("http://localhost/api/v1/auth/api-keys", {
          method: "POST",
          headers: {
            cookie: loginResult.cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            label: "draft-read-only",
            scopes: ["content:read:draft"],
            contextAllowlist: [
              {
                project: "marketing-site",
                environment: "production",
              },
            ],
          }),
        }),
      );
      const draftReadKeyBody = (await draftReadKeyResponse.json()) as {
        data: { key: string };
      };
      assert.equal(draftReadKeyResponse.status, 200);

      const draftReadAllowedResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${createDocumentBody.data.documentId}?draft=true`,
          {
            headers: {
              authorization: `Bearer ${draftReadKeyBody.data.key}`,
              "x-mdcms-project": "marketing-site",
              "x-mdcms-environment": "production",
            },
          },
        ),
      );
      assert.equal(draftReadAllowedResponse.status, 200);

      const draftWriteForbiddenResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${createDocumentBody.data.documentId}`,
          {
            method: "PUT",
            headers: {
              authorization: `Bearer ${draftReadKeyBody.data.key}`,
              "x-mdcms-project": "marketing-site",
              "x-mdcms-environment": "production",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              body: "should be rejected",
            }),
          },
        ),
      );
      const draftWriteForbiddenBody =
        (await draftWriteForbiddenResponse.json()) as {
          code: string;
        };
      assert.equal(draftWriteForbiddenResponse.status, 403);
      assert.equal(draftWriteForbiddenBody.code, "FORBIDDEN");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "CLI login browser flow supports start -> authorize -> exchange and self-revoke",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";
    const state = `state-${Date.now()}-abcdefghijklmnop`;
    const redirectUri = "http://127.0.0.1:45123/callback";

    try {
      await signUp(handler, { email, password });

      const startResponse = await handler(
        new Request("http://localhost/api/v1/auth/cli/login/start", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            project: "marketing-site",
            environment: "staging",
            redirectUri,
            state,
            scopes: ["content:read", "content:read:draft", "content:write"],
          }),
        }),
      );
      const startBody = (await startResponse.json()) as {
        data: {
          challengeId: string;
          authorizeUrl: string;
        };
      };

      assert.equal(startResponse.status, 200);
      assert.ok(startBody.data.challengeId);
      assert.equal(
        startBody.data.authorizeUrl.includes(
          "/api/v1/auth/cli/login/authorize",
        ),
        true,
      );

      const authorizeGetResponse = await handler(
        new Request(startBody.data.authorizeUrl, {
          method: "GET",
        }),
      );
      const authorizeGetHtml = await authorizeGetResponse.text();

      assert.equal(authorizeGetResponse.status, 200);
      assert.equal(
        authorizeGetResponse.headers.get("content-type")?.includes("text/html"),
        true,
      );
      assert.equal(authorizeGetHtml.includes("<form"), true);

      const authorizePostUrl = new URL(startBody.data.authorizeUrl);
      const authorizePostResponse = await handler(
        new Request(authorizePostUrl.toString(), {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            email,
            password,
          }).toString(),
        }),
      );
      const redirectLocation = authorizePostResponse.headers.get("location");

      assert.equal(authorizePostResponse.status, 302);
      assert.ok(redirectLocation);
      assert.ok(authorizePostResponse.headers.get("set-cookie"));

      const callbackUrl = new URL(redirectLocation ?? "");
      const code = callbackUrl.searchParams.get("code");
      const returnedState = callbackUrl.searchParams.get("state");

      assert.ok(code);
      assert.equal(returnedState, state);

      const exchangeResponse = await handler(
        new Request("http://localhost/api/v1/auth/cli/login/exchange", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            challengeId: startBody.data.challengeId,
            state,
            code,
          }),
        }),
      );
      const exchangeBody = (await exchangeResponse.json()) as {
        data: {
          id: string;
          key: string;
          keyPrefix: string;
        };
      };

      assert.equal(exchangeResponse.status, 200);
      assert.equal(exchangeBody.data.key.startsWith("mdcms_key_"), true);
      assert.ok(exchangeBody.data.id);
      assert.ok(exchangeBody.data.keyPrefix);

      const challengeRows = await dbConnection.db
        .select()
        .from(cliLoginChallenges)
        .where(eq(cliLoginChallenges.id, startBody.data.challengeId));
      assert.equal(challengeRows.length, 1);
      assert.equal(challengeRows[0]?.status, "exchanged");
      assert.ok(challengeRows[0]?.usedAt);

      const reusedExchangeResponse = await handler(
        new Request("http://localhost/api/v1/auth/cli/login/exchange", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            challengeId: startBody.data.challengeId,
            state,
            code,
          }),
        }),
      );
      const reusedExchangeBody = (await reusedExchangeResponse.json()) as {
        code: string;
      };
      assert.equal(reusedExchangeResponse.status, 409);
      assert.equal(reusedExchangeBody.code, "LOGIN_CHALLENGE_USED");

      const selfRevokeResponse = await handler(
        new Request("http://localhost/api/v1/auth/api-keys/self/revoke", {
          method: "POST",
          headers: {
            authorization: `Bearer ${exchangeBody.data.key}`,
          },
        }),
      );
      const selfRevokeBody = (await selfRevokeResponse.json()) as {
        data: { revoked: boolean; keyId: string };
      };
      assert.equal(selfRevokeResponse.status, 200);
      assert.equal(selfRevokeBody.data.revoked, true);
      assert.equal(selfRevokeBody.data.keyId, exchangeBody.data.id);

      const secondRevokeResponse = await handler(
        new Request("http://localhost/api/v1/auth/api-keys/self/revoke", {
          method: "POST",
          headers: {
            authorization: `Bearer ${exchangeBody.data.key}`,
          },
        }),
      );
      const secondRevokeBody = (await secondRevokeResponse.json()) as {
        code: string;
      };
      assert.equal(secondRevokeResponse.status, 401);
      assert.equal(secondRevokeBody.code, "UNAUTHORIZED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase("CLI login exchange rejects expired challenge", async () => {
  const { handler, dbConnection } = createServerRequestHandlerWithModules({
    env,
    logger,
  });
  const state = `state-${Date.now()}-abcdefghijklmnop`;

  try {
    const startResponse = await handler(
      new Request("http://localhost/api/v1/auth/cli/login/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project: "marketing-site",
          environment: "staging",
          redirectUri: "http://127.0.0.1:45123/callback",
          state,
        }),
      }),
    );
    const startBody = (await startResponse.json()) as {
      data: { challengeId: string };
    };

    await dbConnection.db
      .update(cliLoginChallenges)
      .set({
        expiresAt: new Date(Date.now() - 1_000),
      })
      .where(eq(cliLoginChallenges.id, startBody.data.challengeId));

    const exchangeResponse = await handler(
      new Request("http://localhost/api/v1/auth/cli/login/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          challengeId: startBody.data.challengeId,
          state,
          code: "invalid-code-for-expired-case",
        }),
      }),
    );
    const exchangeBody = (await exchangeResponse.json()) as { code: string };

    assert.equal(exchangeResponse.status, 410);
    assert.equal(exchangeBody.code, "LOGIN_CHALLENGE_EXPIRED");
  } finally {
    await dbConnection.close();
  }
});

testWithDatabase("CLI login authorize rejects state mismatch", async () => {
  const { handler, dbConnection } = createServerRequestHandlerWithModules({
    env,
    logger,
  });
  const state = `state-${Date.now()}-abcdefghijklmnop`;

  try {
    const startResponse = await handler(
      new Request("http://localhost/api/v1/auth/cli/login/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project: "marketing-site",
          environment: "staging",
          redirectUri: "http://127.0.0.1:45123/callback",
          state,
        }),
      }),
    );
    const startBody = (await startResponse.json()) as {
      data: { challengeId: string };
    };

    const badAuthorizeResponse = await handler(
      new Request(
        `http://localhost/api/v1/auth/cli/login/authorize?challenge=${encodeURIComponent(startBody.data.challengeId)}&state=wrong-state-value-abcdefghijklmnop`,
      ),
    );
    const badAuthorizeBody = (await badAuthorizeResponse.json()) as {
      code: string;
    };

    assert.equal(badAuthorizeResponse.status, 400);
    assert.equal(badAuthorizeBody.code, "INVALID_LOGIN_EXCHANGE");
  } finally {
    await dbConnection.close();
  }
});
