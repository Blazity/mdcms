import assert from "node:assert/strict";

import { test } from "bun:test";
import { defineConfig, defineType, reference } from "@mdcms/shared";

import { createStudioSchemaRouteApi } from "./schema-route-api.js";
import {
  createStudioSchemaLoadingState,
  loadStudioSchemaState,
} from "./schema-state.js";

function createConfig() {
  return defineConfig({
    project: "marketing-site",
    serverUrl: "http://localhost:4000",
    environment: "staging",
    contentDirectories: ["content/blog"],
    types: [
      defineType("BlogPost", {
        directory: "content/blog",
        fields: {
          title: reference("BlogPost"),
        },
      }),
    ],
    environments: {
      staging: {},
    },
  });
}

function createSchemaRouteApi(fetcher: typeof fetch) {
  return createStudioSchemaRouteApi(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    {
      fetcher,
    },
  );
}

test("createStudioSchemaLoadingState returns a deterministic loading state", () => {
  const state = createStudioSchemaLoadingState();

  assert.equal(state.status, "loading");
});

test("loadStudioSchemaState returns ready state with local and server hashes", async () => {
  const api = createSchemaRouteApi(async (input: RequestInfo | URL) => {
    assert.equal(String(input), "http://localhost:4000/api/v1/schema");

    return new Response(
      JSON.stringify({
        data: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
            schemaHash: "server-hash",
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
  });

  const state = await loadStudioSchemaState({
    config: createConfig(),
    schemaApi: api,
  });

  assert.equal(state.status, "ready");
  if (state.status !== "ready") {
    throw new Error("Expected a ready schema state.");
  }

  assert.ok(state.localSchemaHash);
  assert.equal(state.localSchemaHash.length, 64);
  assert.equal(state.serverSchemaHash, "server-hash");
  assert.equal(state.isMismatch, true);
  assert.equal(state.entries.length, 1);
  assert.equal(state.canSync, true);
});

test("loadStudioSchemaState maps forbidden schema responses deterministically", async () => {
  const api = createSchemaRouteApi(
    async () =>
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
  );

  const state = await loadStudioSchemaState({
    config: createConfig(),
    schemaApi: api,
  });

  assert.equal(state.status, "forbidden");
  assert.equal(state.message, "Forbidden.");
});

test("loadStudioSchemaState maps invalid schema responses to error state", async () => {
  const api = createSchemaRouteApi(
    async () =>
      new Response(
        JSON.stringify({
          data: { unexpected: true },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
  );

  const state = await loadStudioSchemaState({
    config: createConfig(),
    schemaApi: api,
  });

  assert.equal(state.status, "error");
  assert.match(state.message, /invalid/i);
});
