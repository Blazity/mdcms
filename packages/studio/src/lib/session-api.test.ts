import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioSessionApi,
  type StudioSessionApiOptions,
} from "./session-api.js";

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

function createSessionApi(options: StudioSessionApiOptions = {}) {
  return createStudioSessionApi(
    { serverUrl: "http://localhost:4000" },
    options,
  );
}

function createSessionResponse(
  overrides: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      data: {
        csrfToken: "csrf-test-token",
        session: {
          id: "session-1",
          userId: "user-1",
          email: "alice@company.com",
          issuedAt: "2026-04-02T10:00:00.000Z",
          expiresAt: "2026-04-02T22:00:00.000Z",
          ...overrides,
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("get fetches session with cookie auth", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createSessionApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return createSessionResponse();
    },
  });

  const result = await api.get();

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/session",
  );
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
  assert.equal(result.session.email, "alice@company.com");
  assert.equal(result.session.userId, "user-1");
  assert.equal(result.csrfToken, "csrf-test-token");
});

test("get attaches bearer token in token auth mode", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createSessionApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return createSessionResponse();
    },
  });

  const result = await api.get();

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
  assert.equal(result.session.email, "alice@company.com");
});

test("get throws UNAUTHORIZED on 401 response", async () => {
  const api = createSessionApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          status: "error",
          code: "UNAUTHORIZED",
          message: "A valid Studio session is required.",
        }),
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => api.get(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "UNAUTHORIZED" &&
      error.statusCode === 401,
  );
});

test("get throws on invalid response shape", async () => {
  const api = createSessionApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: { csrfToken: "token" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    () => api.get(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "SESSION_RESPONSE_INVALID",
  );
});

test("signOut posts to logout with CSRF token", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createSessionApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { revoked: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await api.signOut("csrf-test-token");

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/logout",
  );
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    readHeader(calls[0]?.init, "x-mdcms-csrf-token"),
    "csrf-test-token",
  );
  assert.equal(calls[0]?.init?.credentials, "include");
});
