import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioUsersApi,
  type InviteUserInput,
  type InviteResult,
  type PendingInvite,
  type UserWithGrants,
  type StudioUsersApiOptions,
} from "./users-api.js";

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

function createApi(options: StudioUsersApiOptions = {}) {
  return createStudioUsersApi(
    { serverUrl: "http://localhost:4000" },
    options,
  );
}

const validUser: UserWithGrants = {
  id: "user-1",
  name: "Alice Smith",
  email: "alice@example.com",
  image: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  grants: [
    {
      id: "grant-1",
      role: "editor",
      scopeKind: "project",
      project: "marketing-site",
      environment: null,
      pathPrefix: null,
      createdAt: "2026-03-01T00:00:00.000Z",
    },
  ],
};

const validListResponse = {
  data: [validUser],
};

/* -------------------------------------------------------------------------- */
/*  list                                                                      */
/* -------------------------------------------------------------------------- */

test("list fetches users with cookie auth", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validListResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.list();

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users",
  );
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "user-1");
  assert.equal(result[0]?.name, "Alice Smith");
});

test("list attaches bearer token in token auth mode", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validListResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.list();

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, "Alice Smith");
});

test("list does not send project or environment headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validListResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await api.list();

  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), null);
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), null);
});

test("list returns multiple users", async () => {
  const secondUser: UserWithGrants = {
    id: "user-2",
    name: "Bob Jones",
    email: "bob@example.com",
    image: "https://example.com/bob.jpg",
    createdAt: "2026-03-15T00:00:00.000Z",
    grants: [],
  };

  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: [validUser, secondUser] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  const result = await api.list();

  assert.equal(result.length, 2);
  assert.equal(result[0]?.id, "user-1");
  assert.equal(result[1]?.id, "user-2");
  assert.equal(result[1]?.name, "Bob Jones");
  assert.equal(result[1]?.image, "https://example.com/bob.jpg");
});

test("list returns empty array when server returns empty data", async () => {
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
      error instanceof RuntimeError &&
      error.code === "UNAUTHORIZED" &&
      error.statusCode === 401,
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
      error instanceof RuntimeError &&
      error.code === "FORBIDDEN_ORIGIN" &&
      error.statusCode === 403,
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
      error.code === "INTERNAL_ERROR" &&
      error.statusCode === 500,
  );
});

test("list uses fallback error code when server returns no code", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ message: "Bad request" }), { status: 400 }),
  });

  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_REQUEST_FAILED" &&
      error.statusCode === 400,
  );
});

test("list throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

test("list throws USERS_RESPONSE_INVALID when data is not an array", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: "not-an-array" }), { status: 200 }),
  });

  await assert.rejects(
    () => api.list(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID",
  );
});

test("list preserves a path-prefixed serverUrl", async () => {
  const calls: Array<{ input: string | URL | Request }> = [];
  const api = createStudioUsersApi(
    { serverUrl: "http://localhost:4000/review-api/editor" },
    {
      auth: { mode: "token", token: "mdcms_key_test" },
      fetcher: async (input) => {
        calls.push({ input });
        return new Response(JSON.stringify(validListResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  await api.list();

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/review-api/editor/api/v1/auth/users",
  );
});

/* -------------------------------------------------------------------------- */
/*  get                                                                       */
/* -------------------------------------------------------------------------- */

const validGetResponse = { data: validUser };

test("get sends GET to correct URL with userId in path and returns user", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validGetResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.get("user-1");

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/user-1",
  );
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(result.id, "user-1");
  assert.equal(result.name, "Alice Smith");
  assert.equal(result.grants.length, 1);
});

test("get encodes userId in the URL path", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validGetResponse), {
        status: 200,
      });
    },
  });

  await api.get("user/with spaces");

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/user%2Fwith%20spaces",
  );
});

test("get uses cookie auth (credentials: include)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validGetResponse), {
        status: 200,
      });
    },
  });

  await api.get("user-1");

  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
});

test("get uses token auth (Bearer header)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validGetResponse), {
        status: 200,
      });
    },
  });

  await api.get("user-1");

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
});

test("get throws RuntimeError on non-ok response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "NOT_FOUND", message: "User not found" }),
        { status: 404 },
      ),
  });

  await assert.rejects(
    () => api.get("user-1"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "NOT_FOUND" &&
      error.statusCode === 404,
  );
});

test("get throws RuntimeError with fallback code when server returns no code", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 }),
  });

  await assert.rejects(
    () => api.get("user-1"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_REQUEST_FAILED" &&
      error.statusCode === 404,
  );
});

test("get throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.get("user-1"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

test("get throws USERS_RESPONSE_INVALID when data is not an object", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: "not-an-object" }), { status: 200 }),
  });

  await assert.rejects(
    () => api.get("user-1"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID",
  );
});

/* -------------------------------------------------------------------------- */
/*  invite                                                                    */
/* -------------------------------------------------------------------------- */

const validInviteInput: InviteUserInput = {
  email: "newuser@example.com",
  grants: [
    {
      role: "editor",
      scopeKind: "project",
      project: "marketing-site",
    },
  ],
};

const validInviteResult: InviteResult = {
  id: "invite-1",
  token: "invite_token_abc123",
  email: "newuser@example.com",
  expiresAt: "2026-04-16T00:00:00.000Z",
};

const validInviteResponse = { data: validInviteResult };

test("invite sends POST with correct URL, CSRF header, content-type, JSON body, and returns invite result", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validInviteResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.invite(validInviteInput, "csrf-tok");

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/invite",
  );
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(readHeader(calls[0]?.init, "content-type"), "application/json");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-csrf-token"), "csrf-tok");
  assert.deepEqual(JSON.parse(calls[0]?.init?.body as string), validInviteInput);

  assert.equal(result.token, "invite_token_abc123");
  assert.equal(result.id, "invite-1");
  assert.equal(result.email, "newuser@example.com");
});

test("invite uses cookie auth (credentials: include)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validInviteResponse), {
        status: 200,
      });
    },
  });

  await api.invite(validInviteInput, "csrf-tok");

  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
});

test("invite uses token auth (Bearer header)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validInviteResponse), {
        status: 200,
      });
    },
  });

  await api.invite(validInviteInput, "csrf-tok");

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
});

test("invite throws RuntimeError on non-ok response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "UNAUTHORIZED", message: "Unauthorized" }),
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => api.invite(validInviteInput, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "UNAUTHORIZED" &&
      error.statusCode === 401,
  );
});

test("invite throws RuntimeError with fallback code when server returns no code", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ message: "Bad request" }), { status: 400 }),
  });

  await assert.rejects(
    () => api.invite(validInviteInput, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_REQUEST_FAILED" &&
      error.statusCode === 400,
  );
});

test("invite throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.invite(validInviteInput, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

test("invite throws USERS_RESPONSE_INVALID when data has no token field", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: { id: "invite-1" } }), { status: 200 }),
  });

  await assert.rejects(
    () => api.invite(validInviteInput, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID",
  );
});

/* -------------------------------------------------------------------------- */
/*  listInvites                                                               */
/* -------------------------------------------------------------------------- */

const validPendingInvite: PendingInvite = {
  id: "invite-1",
  email: "pending@example.com",
  grants: [
    {
      role: "editor",
      scopeKind: "project",
      project: "marketing-site",
    },
  ],
  createdAt: "2026-04-01T00:00:00.000Z",
  expiresAt: "2026-04-08T00:00:00.000Z",
};

const validListInvitesResponse = { data: [validPendingInvite] };

test("listInvites fetches pending invites with cookie auth", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validListInvitesResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.listInvites();

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/invites",
  );
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.email, "pending@example.com");
});

test("listInvites throws RuntimeError on non-ok response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "UNAUTHORIZED", message: "Unauthorized" }),
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => api.listInvites(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "UNAUTHORIZED" &&
      error.statusCode === 401,
  );
});

test("listInvites throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.listInvites(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

/* -------------------------------------------------------------------------- */
/*  revokeInvite                                                              */
/* -------------------------------------------------------------------------- */

const validRevokeInviteResponse = { data: { revoked: true } };

test("revokeInvite sends DELETE with correct URL, CSRF header, and returns { revoked: true }", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validRevokeInviteResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.revokeInvite("invite-1", "csrf-tok");

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/invites/invite-1",
  );
  assert.equal(calls[0]?.init?.method, "DELETE");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-csrf-token"), "csrf-tok");
  assert.deepEqual(result, { revoked: true });
});

test("revokeInvite uses token auth (Bearer header)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validRevokeInviteResponse), {
        status: 200,
      });
    },
  });

  await api.revokeInvite("invite-1", "csrf-tok");

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
});

test("revokeInvite throws RuntimeError on non-ok response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "NOT_FOUND", message: "Invitation not found" }),
        { status: 404 },
      ),
  });

  await assert.rejects(
    () => api.revokeInvite("invite-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "NOT_FOUND" &&
      error.statusCode === 404,
  );
});

test("revokeInvite throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.revokeInvite("invite-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

/* -------------------------------------------------------------------------- */
/*  updateGrants                                                              */
/* -------------------------------------------------------------------------- */

const validUpdateGrants: InviteUserInput["grants"] = [
  {
    role: "admin",
    scopeKind: "global",
  },
];

const updatedUser: UserWithGrants = {
  ...validUser,
  grants: [
    {
      id: "grant-2",
      role: "admin",
      scopeKind: "global",
      project: null,
      environment: null,
      pathPrefix: null,
      createdAt: "2026-04-09T00:00:00.000Z",
    },
  ],
};

const validUpdateGrantsResponse = { data: updatedUser };

test("updateGrants sends PATCH with correct URL, CSRF header, content-type, JSON body, and returns updated user", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validUpdateGrantsResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.updateGrants("user-1", validUpdateGrants, "csrf-tok");

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/user-1/grants",
  );
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.equal(readHeader(calls[0]?.init, "content-type"), "application/json");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-csrf-token"), "csrf-tok");
  assert.deepEqual(
    JSON.parse(calls[0]?.init?.body as string),
    { grants: validUpdateGrants },
  );

  assert.equal(result.id, "user-1");
  assert.equal(result.grants.length, 1);
  assert.equal(result.grants[0]?.role, "admin");
});

test("updateGrants encodes userId in the URL path", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validUpdateGrantsResponse), {
        status: 200,
      });
    },
  });

  await api.updateGrants("user/with spaces", validUpdateGrants, "csrf-tok");

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/user%2Fwith%20spaces/grants",
  );
});

test("updateGrants uses cookie auth (credentials: include)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validUpdateGrantsResponse), {
        status: 200,
      });
    },
  });

  await api.updateGrants("user-1", validUpdateGrants, "csrf-tok");

  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
});

test("updateGrants uses token auth (Bearer header)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validUpdateGrantsResponse), {
        status: 200,
      });
    },
  });

  await api.updateGrants("user-1", validUpdateGrants, "csrf-tok");

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
});

test("updateGrants throws RuntimeError on non-ok response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "UNAUTHORIZED", message: "Unauthorized" }),
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => api.updateGrants("user-1", validUpdateGrants, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "UNAUTHORIZED" &&
      error.statusCode === 401,
  );
});

test("updateGrants throws RuntimeError with fallback code when server returns no code", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ message: "Bad request" }), { status: 400 }),
  });

  await assert.rejects(
    () => api.updateGrants("user-1", validUpdateGrants, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_REQUEST_FAILED" &&
      error.statusCode === 400,
  );
});

test("updateGrants throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.updateGrants("user-1", validUpdateGrants, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

test("updateGrants throws USERS_RESPONSE_INVALID when data is not an object", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: "not-an-object" }), { status: 200 }),
  });

  await assert.rejects(
    () => api.updateGrants("user-1", validUpdateGrants, "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID",
  );
});

/* -------------------------------------------------------------------------- */
/*  remove                                                                    */
/* -------------------------------------------------------------------------- */

const validRemoveResponse = { data: { removed: true } };

test("remove sends DELETE to correct URL with userId in path, CSRF header, and returns { removed: true }", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validRemoveResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await api.remove("user-1", "csrf-tok");

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/user-1",
  );
  assert.equal(calls[0]?.init?.method, "DELETE");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-csrf-token"), "csrf-tok");

  assert.deepEqual(result, { removed: true });
});

test("remove encodes userId in the URL path", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validRemoveResponse), {
        status: 200,
      });
    },
  });

  await api.remove("user/with spaces", "csrf-tok");

  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/auth/users/user%2Fwith%20spaces",
  );
});

test("remove uses cookie auth (credentials: include)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "cookie" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validRemoveResponse), {
        status: 200,
      });
    },
  });

  await api.remove("user-1", "csrf-tok");

  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
});

test("remove uses token auth (Bearer header)", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(validRemoveResponse), {
        status: 200,
      });
    },
  });

  await api.remove("user-1", "csrf-tok");

  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
});

test("remove throws RuntimeError on non-ok response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({ code: "UNAUTHORIZED", message: "Unauthorized" }),
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => api.remove("user-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "UNAUTHORIZED" &&
      error.statusCode === 401,
  );
});

test("remove throws RuntimeError with fallback code when server returns no code", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ message: "Not found" }), { status: 404 }),
  });

  await assert.rejects(
    () => api.remove("user-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_REQUEST_FAILED" &&
      error.statusCode === 404,
  );
});

test("remove throws USERS_RESPONSE_INVALID on malformed response", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  });

  await assert.rejects(
    () => api.remove("user-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID" &&
      error.statusCode === 500,
  );
});

test("remove throws USERS_RESPONSE_INVALID when data has removed !== true", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: { removed: false } }), { status: 200 }),
  });

  await assert.rejects(
    () => api.remove("user-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID",
  );
});

test("remove throws USERS_RESPONSE_INVALID when data is not an object", async () => {
  const api = createApi({
    fetcher: async () =>
      new Response(JSON.stringify({ data: "not-an-object" }), { status: 200 }),
  });

  await assert.rejects(
    () => api.remove("user-1", "csrf-tok"),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "USERS_RESPONSE_INVALID",
  );
});
