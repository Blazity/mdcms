import assert from "node:assert/strict";

import {
  RuntimeError,
  createEmptyCurrentPrincipalCapabilities,
} from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioCurrentPrincipalCapabilitiesApi,
  type StudioCurrentPrincipalCapabilitiesApiOptions,
} from "./current-principal-capabilities-api.js";

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

function createCapabilitiesApi(
  options: StudioCurrentPrincipalCapabilitiesApiOptions = {},
) {
  return createStudioCurrentPrincipalCapabilitiesApi(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    options,
  );
}

test("get fetches current principal capabilities with scoped headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createCapabilitiesApi({
    fetcher: async (input, init) => {
      calls.push({ input, init });

      return new Response(
        JSON.stringify({
          data: {
            project: "marketing-site",
            environment: "staging",
            capabilities: {
              ...createEmptyCurrentPrincipalCapabilities(),
              schema: {
                read: true,
                write: false,
              },
            },
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

  const result = await api.get();

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/me/capabilities",
  );
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "staging");
  assert.equal(readHeader(calls[0]?.init, "authorization"), null);
  assert.equal(calls[0]?.init?.credentials, undefined);
  assert.equal(result.project, "marketing-site");
  assert.equal(result.environment, "staging");
  assert.equal(result.capabilities.schema.read, true);
  assert.equal(result.capabilities.schema.write, false);
});

test("token-authenticated get attaches the bearer token", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createCapabilitiesApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });

      return new Response(
        JSON.stringify({
          data: {
            project: "marketing-site",
            environment: "staging",
            capabilities: {
              ...createEmptyCurrentPrincipalCapabilities(),
              schema: {
                read: true,
                write: true,
              },
            },
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

  const result = await api.get();

  assert.equal(calls.length, 1);
  assert.equal(
    readHeader(calls[0]?.init, "authorization"),
    "Bearer mdcms_key_test",
  );
  assert.equal(calls[0]?.init?.credentials, undefined);
  assert.equal(result.capabilities.schema.write, true);
});

test("get surfaces invalid responses as runtime errors", async () => {
  const api = createCapabilitiesApi({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          data: {
            project: "marketing-site",
            environment: "staging",
            capabilities: {
              schema: {
                read: true,
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
  });

  await assert.rejects(
    () => api.get(),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "CURRENT_PRINCIPAL_CAPABILITIES_RESPONSE_INVALID",
  );
});
