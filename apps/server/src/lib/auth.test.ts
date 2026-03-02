import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";
import postgres from "postgres";

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
