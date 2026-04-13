import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioEnvironmentApi,
  type StudioEnvironmentApiOptions,
} from "./environment-api.js";

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

function createApi(
  options: StudioEnvironmentApiOptions = {},
  config?: {
    project?: string;
    environment?: string;
    serverUrl?: string;
  },
) {
  return createStudioEnvironmentApi(
    {
      project: config?.project ?? "marketing-site",
      environment: config?.environment ?? "production",
      serverUrl: config?.serverUrl ?? "http://localhost:4000",
    },
    options,
  );
}

const validEnvSummary = {
  id: "env-production",
  project: "marketing-site",
  name: "production",
  extends: null,
  isDefault: true,
  createdAt: "2026-03-19T10:00:00.000Z",
};

test("list fetches environments with project header", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          data: [validEnvSummary],
          meta: {
            definitionsStatus: "ready",
            configSnapshotHash: "sha256:abc123",
            syncedAt: "2026-03-19T10:00:00.000Z",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await api.list();

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/environments",
  );
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "production");
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.name, "production");
  assert.equal(result.meta.definitionsStatus, "ready");
});

test("list returns empty array for empty response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          data: [],
          meta: {
            definitionsStatus: "missing",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  const result = await api.list();

  assert.deepEqual(result.data, []);
  assert.deepEqual(result.meta, {
    definitionsStatus: "missing",
  });
});

test("list resolves scenario-relative environment routes", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi(
    {
      fetcher: async (input, init) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({
            data: [validEnvSummary],
            meta: {
              definitionsStatus: "ready",
              configSnapshotHash: "sha256:abc123",
              syncedAt: "2026-03-19T10:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
    {
      serverUrl: "http://localhost:4000/review-api/editor",
    },
  );

  await api.list();

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/review-api/editor/api/v1/environments",
  );
});

test("create posts the environment name with project and csrf headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    csrfToken: "csrf-token",
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          data: {
            ...validEnvSummary,
            id: "env-staging",
            name: "staging",
            isDefault: false,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await api.create({ name: "staging" });

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/environments",
  );
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "production");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-csrf-token"), "csrf-token");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ name: "staging" }));
  assert.equal(result.name, "staging");
});

test("create throws MISSING_CSRF_TOKEN when cookie auth omits csrfToken", async () => {
  let called = false;
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async () => {
      called = true;
      throw new Error("fetcher should not be called");
    },
  });

  await assert.rejects(
    () => api.create({ name: "staging" }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "MISSING_CSRF_TOKEN",
  );
  assert.equal(called, false);
});

test("delete sends the environment id with csrf protection", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    csrfToken: "csrf-token",
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({ data: { deleted: true, id: "env-staging" } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  await api.delete("env-staging");

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/environments/env-staging",
  );
  assert.equal(calls[0]?.init?.method, "DELETE");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-csrf-token"), "csrf-token");
});

test("delete throws MISSING_CSRF_TOKEN when cookie auth omits csrfToken", async () => {
  let called = false;
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async () => {
      called = true;
      throw new Error("fetcher should not be called");
    },
  });

  await assert.rejects(
    () => api.delete("env-staging"),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "MISSING_CSRF_TOKEN",
  );
  assert.equal(called, false);
});

test("list throws on 401 response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "UNAUTHORIZED", message: "Unauthorized" }),
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof RuntimeError && error.statusCode === 401,
  );
});
