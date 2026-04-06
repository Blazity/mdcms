import assert from "node:assert/strict";

import { test } from "bun:test";

import { createLoginApi, type LoginApiOptions } from "./login-api.js";

function readHeader(
  init: RequestInit | undefined,
  name: string,
): string | null {
  const headers = init?.headers;
  if (headers instanceof Headers) return headers.get(name);
  if (headers && !Array.isArray(headers)) {
    const value = (headers as Record<string, string>)[name];
    if (typeof value === "string") return value;
  }
  return null;
}

function createApi(options: LoginApiOptions = {}) {
  return createLoginApi({ serverUrl: "http://localhost:4000" }, options);
}

test("login returns success on 200", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const api = createApi({
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          data: {
            csrfToken: "csrf-token",
            session: { id: "s1", userId: "u1", email: "demo@mdcms.local", issuedAt: "2026-04-06T10:00:00.000Z", expiresAt: "2026-04-06T22:00:00.000Z" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await api.login("demo@mdcms.local", "Demo12345!");

  assert.equal(result.outcome, "success");
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "http://localhost:4000/api/v1/auth/login");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.credentials, "include");
  const body = JSON.parse(calls[0]?.init?.body as string);
  assert.equal(body.email, "demo@mdcms.local");
  assert.equal(body.password, "Demo12345!");
});

test("login returns invalid_credentials on 401", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ code: "AUTH_INVALID_CREDENTIALS", message: "Invalid." }), { status: 401 }),
  });
  const result = await api.login("bad@email.com", "wrong");
  assert.equal(result.outcome, "invalid_credentials");
});

test("login returns throttled on 429 with retryAfterSeconds", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "AUTH_BACKOFF_ACTIVE", message: "Too many attempts.", details: { retryAfterSeconds: 8 } }),
        { status: 429, headers: { "retry-after": "8" } },
      ),
  });
  const result = await api.login("demo@mdcms.local", "wrong");
  assert.equal(result.outcome, "throttled");
  if (result.outcome === "throttled") assert.equal(result.retryAfterSeconds, 8);
});

test("login returns error on network failure", async () => {
  const api = createApi({
    fetcher: async () => { throw new Error("Network error"); },
  });
  const result = await api.login("demo@mdcms.local", "pass");
  assert.equal(result.outcome, "error");
  if (result.outcome === "error") assert.equal(result.message, "Network error");
});

test("getSsoProviders returns providers on success", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ data: [{ id: "okta", name: "Okta" }, { id: "azure-ad", name: "Azure AD" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  const providers = await api.getSsoProviders();
  assert.equal(providers.length, 2);
  assert.equal(providers[0]?.id, "okta");
  assert.equal(providers[1]?.name, "Azure AD");
});

test("getSsoProviders returns empty array on failure", async () => {
  const api = createApi({
    fetcher: async () => new Response(null, { status: 500 }),
  });
  const providers = await api.getSsoProviders();
  assert.deepEqual(providers, []);
});
