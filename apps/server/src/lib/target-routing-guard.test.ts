import assert from "node:assert/strict";
import { test } from "node:test";

import { MDCMS_ENVIRONMENT_HEADER, MDCMS_PROJECT_HEADER } from "@mdcms/shared";

import { createServerRequestHandler } from "./server.js";

const baseEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
} as NodeJS.ProcessEnv;

function createHandler() {
  return createServerRequestHandler({
    env: baseEnv,
    now: () => new Date("2026-03-01T00:00:00.000Z"),
    configureApp: (app) => {
      const serverApp = app as {
        get?: (path: string, handler: () => unknown) => unknown;
        post?: (path: string, handler: () => unknown) => unknown;
      };

      serverApp.get?.("/api/v1/content", () => ({ route: "content" }));
      serverApp.get?.("/api/v1/environments", () => ({
        route: "environments",
      }));
      serverApp.post?.("/api/v1/media/upload", () => ({ route: "media" }));
      serverApp.get?.("/api/v1/modules/domain-content/preview", () => ({
        moduleId: "domain.content",
        status: "ok",
      }));
    },
  });
}

test("environment-scoped endpoint accepts explicit headers", async () => {
  const handler = createHandler();
  const response = await handler(
    new Request("http://localhost/api/v1/content", {
      headers: {
        [MDCMS_PROJECT_HEADER]: "marketing-site",
        [MDCMS_ENVIRONMENT_HEADER]: "staging",
      },
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.route, "content");
});

test("environment-scoped endpoint accepts explicit query parameters", async () => {
  const handler = createHandler();
  const response = await handler(
    new Request(
      "http://localhost/api/v1/content?project=marketing-site&environment=staging",
    ),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.route, "content");
});

test("environment-scoped endpoint rejects missing routing", async () => {
  const handler = createHandler();
  const response = await handler(
    new Request("http://localhost/api/v1/content"),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.equal(body.code, "MISSING_TARGET_ROUTING");
});

test("project-scoped management endpoint accepts explicit project target", async () => {
  const handler = createHandler();
  const response = await handler(
    new Request("http://localhost/api/v1/environments?project=marketing-site"),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.route, "environments");
});

test("project-scoped management endpoint rejects missing project", async () => {
  const handler = createHandler();
  const response = await handler(
    new Request("http://localhost/api/v1/environments"),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.equal(body.code, "MISSING_TARGET_ROUTING");
});

test("media endpoint requires both project and environment routing", async () => {
  const handler = createHandler();

  const rejectedResponse = await handler(
    new Request("http://localhost/api/v1/media/upload?project=marketing-site", {
      method: "POST",
    }),
  );
  const rejectedBody = (await rejectedResponse.json()) as Record<
    string,
    unknown
  >;

  assert.equal(rejectedResponse.status, 400);
  assert.equal(rejectedBody.code, "MISSING_TARGET_ROUTING");

  const acceptedResponse = await handler(
    new Request(
      "http://localhost/api/v1/media/upload?project=marketing-site&environment=staging",
      {
        method: "POST",
      },
    ),
  );
  const acceptedBody = (await acceptedResponse.json()) as Record<
    string,
    unknown
  >;

  assert.equal(acceptedResponse.status, 200);
  assert.equal(acceptedBody.route, "media");
});

test("scoped endpoint rejects header/query routing mismatches", async () => {
  const handler = createHandler();
  const response = await handler(
    new Request(
      "http://localhost/api/v1/content?project=docs-site&environment=staging",
      {
        headers: {
          [MDCMS_PROJECT_HEADER]: "marketing-site",
          [MDCMS_ENVIRONMENT_HEADER]: "staging",
        },
      },
    ),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.equal(body.code, "TARGET_ROUTING_MISMATCH");
});

test("exempt endpoints remain callable without explicit target routing", async () => {
  const handler = createHandler();

  const healthzResponse = await handler(
    new Request("http://localhost/healthz"),
  );
  assert.equal(healthzResponse.status, 200);

  const actionsResponse = await handler(
    new Request("http://localhost/api/v1/actions"),
  );
  assert.equal(actionsResponse.status, 200);

  const moduleResponse = await handler(
    new Request("http://localhost/api/v1/modules/domain-content/preview"),
  );
  const moduleBody = (await moduleResponse.json()) as Record<string, unknown>;

  assert.equal(moduleResponse.status, 200);
  assert.equal(moduleBody.moduleId, "domain.content");
});
