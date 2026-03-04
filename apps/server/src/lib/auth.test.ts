import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { authSessions } from "./db/schema.js";
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
