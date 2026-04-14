import assert from "node:assert/strict";

import { RuntimeError, type JsonObject } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioSchemaRouteApi,
  type StudioSchemaRouteApiOptions,
} from "./schema-route-api.js";

function readHeader(
  init: RequestInit | undefined,
  name: string,
): string | null {
  const headers = init?.headers;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (headers && !Array.isArray(headers)) {
    const value = (headers as Record<string, string>)[name];
    if (typeof value === "string") {
      return value;
    }
  }

  return null;
}

function readJsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    return undefined;
  }

  return JSON.parse(init.body);
}

function createSchemaRouteApi(options: StudioSchemaRouteApiOptions = {}) {
  return createStudioSchemaRouteApi(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    options,
  );
}

function createRawConfigSnapshot(
  overrides: Record<string, unknown> = {},
): JsonObject {
  return {
    project: "marketing-site",
    environment: "staging",
    environments: {
      production: {},
      staging: {
        extends: "production",
      },
    },
    ...(overrides as JsonObject),
  } satisfies JsonObject;
}

test("list fetches schema entries with scoped headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createSchemaRouteApi({
    fetcher: async (input, init) => {
      calls.push({ input, init });

      return new Response(
        JSON.stringify({
          data: [
            {
              type: "BlogPost",
              directory: "content/blog",
              localized: true,
              schemaHash: "schema-hash-123",
              syncedAt: "2026-03-31T12:00:00.000Z",
              resolvedSchema: {
                type: "BlogPost",
                directory: "content/blog",
                localized: true,
                fields: {},
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await api.list();

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "http://localhost:4000/api/v1/schema");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "staging");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
  assert.equal(calls[0]?.init?.credentials, undefined);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.type, "BlogPost");
});

test("cookie-authenticated sync bootstraps csrf from auth/session", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createSchemaRouteApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });

      if (String(input) === "http://localhost:4000/api/v1/auth/session") {
        assert.equal(init?.method, "GET");
        assert.equal(init?.credentials, "include");

        return new Response(
          JSON.stringify({
            data: {
              csrfToken: "csrf-cookie-token",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      assert.equal(String(input), "http://localhost:4000/api/v1/schema");
      assert.equal(readHeader(init, "x-mdcms-project"), "marketing-site");
      assert.equal(readHeader(init, "x-mdcms-environment"), "staging");
      assert.equal(readHeader(init, "x-mdcms-csrf-token"), "csrf-cookie-token");
      assert.equal(readHeader(init, "authorization"), null);
      assert.equal(init?.credentials, "include");
      assert.deepEqual(readJsonBody(init), {
        rawConfigSnapshot: createRawConfigSnapshot({
          contentDirectories: ["content/blog"],
        }),
        resolvedSchema: {
          BlogPost: {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
            fields: {},
          },
        },
        schemaHash: "schema-hash-123",
      });

      return new Response(
        JSON.stringify({
          data: {
            schemaHash: "schema-hash-123",
            syncedAt: "2026-03-31T12:34:56.000Z",
            affectedTypes: ["BlogPost"],
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await api.sync({
    rawConfigSnapshot: createRawConfigSnapshot({
      contentDirectories: ["content/blog"],
    }),
    resolvedSchema: {
      BlogPost: {
        type: "BlogPost",
        directory: "content/blog",
        localized: true,
        fields: {},
      },
    },
    schemaHash: "schema-hash-123",
  });

  assert.equal(calls.length, 2);
  assert.equal(result.schemaHash, "schema-hash-123");
});

test("token-authenticated sync does not bootstrap csrf", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createSchemaRouteApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });

      assert.equal(String(input), "http://localhost:4000/api/v1/schema");
      assert.equal(readHeader(init, "authorization"), "Bearer mdcms_key_test");
      assert.equal(readHeader(init, "x-mdcms-csrf-token"), null);
      assert.equal(init?.credentials, undefined);

      return new Response(
        JSON.stringify({
          data: {
            schemaHash: "schema-hash-123",
            syncedAt: "2026-03-31T12:34:56.000Z",
            affectedTypes: [],
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await api.sync({
    rawConfigSnapshot: createRawConfigSnapshot(),
    resolvedSchema: {},
    schemaHash: "schema-hash-123",
  });

  assert.equal(calls.length, 1);
  assert.equal(result.affectedTypes.length, 0);
});

test("cookie-authenticated sync preserves a path-prefixed studio serverUrl", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createStudioSchemaRouteApi(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000/review-api/editor",
    },
    {
      auth: { mode: "cookie" },
      fetcher: async (input, init) => {
        calls.push({ input, init });

        if (
          String(input) ===
          "http://localhost:4000/review-api/editor/api/v1/auth/session"
        ) {
          return new Response(
            JSON.stringify({
              data: {
                csrfToken: "csrf-cookie-token",
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        }

        assert.equal(
          String(input),
          "http://localhost:4000/review-api/editor/api/v1/schema",
        );
        assert.equal(
          readHeader(init, "x-mdcms-csrf-token"),
          "csrf-cookie-token",
        );

        return new Response(
          JSON.stringify({
            data: {
              schemaHash: "schema-hash-123",
              syncedAt: "2026-03-31T12:34:56.000Z",
              affectedTypes: [],
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    },
  );

  await api.sync({
    rawConfigSnapshot: createRawConfigSnapshot({
      contentDirectories: ["content/blog"],
    }),
    resolvedSchema: {
      BlogPost: {
        type: "BlogPost",
        directory: "content/blog",
        localized: true,
        fields: {},
      },
    },
    schemaHash: "schema-hash-123",
  });

  assert.deepEqual(
    calls.map((call) => String(call.input)),
    [
      "http://localhost:4000/review-api/editor/api/v1/auth/session",
      "http://localhost:4000/review-api/editor/api/v1/schema",
    ],
  );
});

test("sync surfaces forbidden responses as runtime errors", async () => {
  const api = createSchemaRouteApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "FORBIDDEN",
          message: "Forbidden.",
        }),
        {
          status: 403,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
  });

  await assert.rejects(
    () =>
      api.sync({
        rawConfigSnapshot: createRawConfigSnapshot(),
        resolvedSchema: {},
        schemaHash: "schema-hash-123",
      }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "FORBIDDEN" &&
      error.statusCode === 403,
  );
});

test("sync surfaces incompatible responses as runtime errors", async () => {
  const api = createSchemaRouteApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "SCHEMA_INCOMPATIBLE",
          message: "Schema cannot be synced.",
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
  });

  await assert.rejects(
    () =>
      api.sync({
        rawConfigSnapshot: createRawConfigSnapshot(),
        resolvedSchema: {},
        schemaHash: "schema-hash-123",
      }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "SCHEMA_INCOMPATIBLE" &&
      error.statusCode === 409,
  );
});
