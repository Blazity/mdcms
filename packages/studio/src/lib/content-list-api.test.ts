import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioContentListApi,
  type StudioContentListApiOptions,
} from "./content-list-api.js";

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

function createApi(options: StudioContentListApiOptions = {}) {
  return createStudioContentListApi(
    {
      project: "marketing-site",
      environment: "production",
      serverUrl: "http://localhost:4000",
    },
    options,
  );
}

const validPaginatedResponse = {
  data: [
    {
      documentId: "doc-1",
      translationGroupId: "tg-1",
      project: "marketing-site",
      environment: "production",
      path: "blog/hello",
      type: "BlogPost",
      locale: "en",
      format: "md",
      isDeleted: false,
      hasUnpublishedChanges: false,
      version: 1,
      publishedVersion: 1,
      draftRevision: 0,
      frontmatter: { title: "Hello" },
      body: "# Hello",
      createdBy: "user-1",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:00.000Z",
    },
  ],
  pagination: {
    total: 42,
    limit: 1,
    offset: 0,
    hasMore: true,
  },
};

test("list fetches content with project and environment headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validPaginatedResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.list({ limit: 1 });

  assert.equal(calls.length, 1);
  const url = String(calls[0]?.input);
  assert.ok(url.startsWith("http://localhost:4000/api/v1/content"));
  assert.ok(url.includes("limit=1"));
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "production");
  assert.equal(result.pagination.total, 42);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.type, "BlogPost");
});

test("list passes type and published filters as query params", async () => {
  const calls: Array<{ input: string | URL | Request }> = [];
  const api = createApi({
    fetcher: async (input) => {
      calls.push({ input });
      return new Response(JSON.stringify(validPaginatedResponse), {
        status: 200,
      });
    },
  });

  await api.list({ type: "BlogPost", published: true, limit: 1 });

  const url = new URL(String(calls[0]?.input));
  assert.equal(url.searchParams.get("type"), "BlogPost");
  assert.equal(url.searchParams.get("published"), "true");
  assert.equal(url.searchParams.get("limit"), "1");
});

test("list passes sort and order query params", async () => {
  const calls: Array<{ input: string | URL | Request }> = [];
  const api = createApi({
    fetcher: async (input) => {
      calls.push({ input });
      return new Response(JSON.stringify(validPaginatedResponse), {
        status: 200,
      });
    },
  });

  await api.list({ sort: "updatedAt", order: "desc", limit: 5 });

  const url = new URL(String(calls[0]?.input));
  assert.equal(url.searchParams.get("sort"), "updatedAt");
  assert.equal(url.searchParams.get("order"), "desc");
  assert.equal(url.searchParams.get("limit"), "5");
});

test("list returns empty result for malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  const result = await api.list();

  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.total, 0);
});

test("list throws RuntimeError on 401", async () => {
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

test("list throws RuntimeError on 403", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "FORBIDDEN_ORIGIN",
          message: "Origin not allowed",
        }),
        { status: 403 },
      ),
  });

  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof RuntimeError && error.statusCode === 403,
  );
});

test("list throws RuntimeError on 500 with server error code", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "INTERNAL_ERROR",
          message: "Something broke",
        }),
        { status: 500 },
      ),
  });

  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.statusCode === 500 &&
      error.code === "INTERNAL_ERROR",
  );
});

test("list defaults to empty query when called with no args", async () => {
  const calls: Array<{ input: string | URL | Request }> = [];
  const api = createApi({
    fetcher: async (input) => {
      calls.push({ input });
      return new Response(JSON.stringify(validPaginatedResponse), {
        status: 200,
      });
    },
  });

  await api.list();

  const url = new URL(String(calls[0]?.input));
  assert.equal(url.searchParams.toString(), "");
});
