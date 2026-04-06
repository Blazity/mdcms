import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioContentOverviewApi,
  type StudioContentOverviewApiOptions,
} from "./content-overview-api.js";

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

function createApi(options: StudioContentOverviewApiOptions = {}) {
  return createStudioContentOverviewApi(
    {
      project: "marketing-site",
      environment: "production",
      serverUrl: "http://localhost:4000",
    },
    options,
  );
}

test("get fetches overview counts with repeated type params and routed headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          data: [
            { type: "BlogPost", total: 2, published: 1, drafts: 1 },
            { type: "Page", total: 0, published: 0, drafts: 0 },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await api.get({ types: ["BlogPost", "Page"] });

  assert.equal(calls.length, 1);
  const url = new URL(String(calls[0]?.input));
  assert.equal(url.pathname, "/api/v1/content/overview");
  assert.deepEqual(url.searchParams.getAll("type"), ["BlogPost", "Page"]);
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "production");
  assert.deepEqual(result, [
    { type: "BlogPost", total: 2, published: 1, drafts: 1 },
    { type: "Page", total: 0, published: 0, drafts: 0 },
  ]);
});

test("get throws RuntimeError when a success response payload is malformed", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.get({ types: ["BlogPost"] }),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "CONTENT_OVERVIEW_RESPONSE_INVALID" &&
      error.statusCode === 502,
  );
});

test("get throws RuntimeError on forbidden responses", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" }),
        { status: 403 },
      ),
  });

  await assert.rejects(
    () => api.get({ types: ["BlogPost"] }),
    (error: unknown) =>
      error instanceof RuntimeError && error.statusCode === 403,
  );
});
