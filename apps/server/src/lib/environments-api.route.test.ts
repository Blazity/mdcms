import assert from "node:assert/strict";
import { test } from "node:test";

import { createServerRequestHandler } from "./server.js";
import { mountEnvironmentApiRoutes } from "./environments-api.js";

const baseEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
} as NodeJS.ProcessEnv;

test("environment routes list project-scoped environments for admin sessions", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    configureApp: (app) => {
      mountEnvironmentApiRoutes(app, {
        store: {
          async list(project) {
            assert.equal(project, "marketing-site");
            return [
              {
                id: "env-production",
                project: "marketing-site",
                name: "production",
                extends: null,
                isDefault: true,
                createdAt: "2026-03-11T12:00:00.000Z",
              },
            ];
          },
          async create() {
            throw new Error("not used");
          },
          async delete() {
            throw new Error("not used");
          },
        },
        authorizeAdmin: async () => undefined,
      });
    },
  });

  const response = await handler(
    new Request("http://localhost/api/v1/environments?project=marketing-site"),
  );
  const body = (await response.json()) as {
    data: Array<{ name: string }>;
  };

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.data.map((entry) => entry.name),
    ["production"],
  );
});

test("environment routes reject create requests without admin privileges", async () => {
  const handler = createServerRequestHandler({
    env: baseEnv,
    configureApp: (app) => {
      mountEnvironmentApiRoutes(app, {
        store: {
          async list() {
            return [];
          },
          async create() {
            throw new Error("not used");
          },
          async delete() {
            throw new Error("not used");
          },
        },
        authorizeAdmin: async () => {
          throw Object.assign(new Error("forbidden"), {
            code: "FORBIDDEN",
            statusCode: 403,
            message: "Admin privileges are required to manage environments.",
          });
        },
      });
    },
  });

  const response = await handler(
    new Request("http://localhost/api/v1/environments?project=marketing-site", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "staging",
        extends: "production",
      }),
    }),
  );
  const body = (await response.json()) as { code: string };

  assert.equal(response.status, 403);
  assert.equal(body.code, "FORBIDDEN");
});
