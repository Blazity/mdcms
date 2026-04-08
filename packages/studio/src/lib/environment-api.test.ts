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

function createApi(options: StudioEnvironmentApiOptions = {}) {
  return createStudioEnvironmentApi(
    {
      project: "marketing-site",
      environment: "production",
      serverUrl: "http://localhost:4000",
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
      return new Response(JSON.stringify({ data: [validEnvSummary] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, "production");
});

test("list returns empty array for empty response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  const result = await api.list();

  assert.deepEqual(result, []);
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
