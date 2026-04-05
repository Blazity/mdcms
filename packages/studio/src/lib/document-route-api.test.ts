import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import {
  createStudioDocumentRouteApi,
  type StudioDocumentRouteApiOptions,
} from "./document-route-api.js";

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

function createDocumentRouteApi(options: StudioDocumentRouteApiOptions = {}) {
  return createStudioDocumentRouteApi(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    options,
  );
}

test("loadStudioDocumentDraft fetches draft content with scoped headers", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createDocumentRouteApi({
    fetcher: async (input, init) => {
      calls.push({ input, init });

      return new Response(
        JSON.stringify({
          data: {
            documentId: "11111111-1111-4111-8111-111111111111",
            translationGroupId: "22222222-2222-4222-8222-222222222222",
            project: "marketing-site",
            environment: "staging",
            type: "BlogPost",
            locale: "en",
            path: "blog/launch-notes",
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: true,
            version: 5,
            publishedVersion: 5,
            draftRevision: 12,
            frontmatter: {},
            body: "# Launch Notes",
            createdBy: "44444444-4444-4444-8444-444444444444",
            createdAt: "2026-03-04T09:00:00.000Z",
            updatedAt: "2026-03-04T10:00:00.000Z",
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

  const result = await api.loadDraft({
    type: "BlogPost",
    documentId: "11111111-1111-4111-8111-111111111111",
    locale: "en",
  });

  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "http://localhost:4000/api/v1/content/11111111-1111-4111-8111-111111111111?draft=true",
  );
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-project"), "marketing-site");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-environment"), "staging");
  assert.equal(readHeader(calls[0]?.init, "x-mdcms-locale"), "en");
  assert.equal(result.path, "blog/launch-notes");
});

test("cookie-authenticated mutations bootstrap CSRF from auth/session", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createDocumentRouteApi({
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

      assert.equal(
        String(input),
        "http://localhost:4000/api/v1/content/11111111-1111-4111-8111-111111111111",
      );
      assert.equal(readHeader(init, "x-mdcms-csrf-token"), "csrf-cookie-token");
      assert.equal(readHeader(init, "x-mdcms-schema-hash"), "schema-hash-123");
      assert.equal(readHeader(init, "authorization"), null);
      assert.deepEqual(readJsonBody(init), {
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: {},
        body: "# Updated",
      });

      return new Response(
        JSON.stringify({
          data: {
            documentId: "11111111-1111-4111-8111-111111111111",
            translationGroupId: "22222222-2222-4222-8222-222222222222",
            project: "marketing-site",
            environment: "staging",
            type: "BlogPost",
            locale: "en",
            path: "blog/launch-notes",
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: true,
            version: 5,
            publishedVersion: 5,
            draftRevision: 13,
            frontmatter: {},
            body: "# Updated",
            createdBy: "44444444-4444-4444-8444-444444444444",
            createdAt: "2026-03-04T09:00:00.000Z",
            updatedAt: "2026-03-05T10:00:00.000Z",
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

  const result = await api.updateDraft({
    documentId: "11111111-1111-4111-8111-111111111111",
    schemaHash: "schema-hash-123",
    payload: {
      type: "BlogPost",
      locale: "en",
      format: "md",
      frontmatter: {},
      body: "# Updated",
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(result.body, "# Updated");
});

test("token-authenticated mutations do not bootstrap CSRF", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createDocumentRouteApi({
    auth: { mode: "token", token: "mdcms_key_test" },
    fetcher: async (input, init) => {
      calls.push({ input, init });

      assert.equal(
        String(input),
        "http://localhost:4000/api/v1/content/11111111-1111-4111-8111-111111111111/publish",
      );
      assert.equal(readHeader(init, "authorization"), "Bearer mdcms_key_test");
      assert.equal(readHeader(init, "x-mdcms-csrf-token"), null);

      return new Response(
        JSON.stringify({
          data: {
            documentId: "11111111-1111-4111-8111-111111111111",
            translationGroupId: "22222222-2222-4222-8222-222222222222",
            project: "marketing-site",
            environment: "staging",
            type: "BlogPost",
            locale: "en",
            path: "blog/launch-notes",
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: false,
            version: 6,
            publishedVersion: 6,
            draftRevision: 13,
            frontmatter: {},
            body: "# Published",
            createdBy: "44444444-4444-4444-8444-444444444444",
            createdAt: "2026-03-04T09:00:00.000Z",
            updatedAt: "2026-03-06T10:00:00.000Z",
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

  const result = await api.publish({
    documentId: "11111111-1111-4111-8111-111111111111",
    changeSummary: "Polished introduction",
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(readJsonBody(calls[0]?.init), {
    changeSummary: "Polished introduction",
  });
  assert.equal(result.body, "# Published");
});

test("cookie-authenticated mutations preserve a path-prefixed studio serverUrl", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createStudioDocumentRouteApi(
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
          "http://localhost:4000/review-api/editor/api/v1/content/11111111-1111-4111-8111-111111111111",
        );
        assert.equal(
          readHeader(init, "x-mdcms-csrf-token"),
          "csrf-cookie-token",
        );

        return new Response(
          JSON.stringify({
            data: {
              documentId: "11111111-1111-4111-8111-111111111111",
              translationGroupId: "22222222-2222-4222-8222-222222222222",
              project: "marketing-site",
              environment: "staging",
              type: "BlogPost",
              locale: "en",
              path: "blog/launch-notes",
              format: "md",
              isDeleted: false,
              hasUnpublishedChanges: true,
              version: 5,
              publishedVersion: 5,
              draftRevision: 13,
              frontmatter: {},
              body: "# Updated",
              createdBy: "44444444-4444-4444-8444-444444444444",
              createdAt: "2026-03-04T09:00:00.000Z",
              updatedAt: "2026-03-05T10:00:00.000Z",
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

  await api.updateDraft({
    documentId: "11111111-1111-4111-8111-111111111111",
    payload: {
      type: "BlogPost",
      locale: "en",
      format: "md",
      frontmatter: {},
      body: "# Updated",
    },
  });

  assert.deepEqual(
    calls.map((call) => String(call.input)),
    [
      "http://localhost:4000/review-api/editor/api/v1/auth/session",
      "http://localhost:4000/review-api/editor/api/v1/content/11111111-1111-4111-8111-111111111111",
    ],
  );
});

test("version summary helper validates required fields and rejects malformed payloads", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createDocumentRouteApi({
    fetcher: async (input, init) => {
      calls.push({ input, init });

      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            data: [
              {
                documentId: "11111111-1111-4111-8111-111111111111",
                translationGroupId: "22222222-2222-4222-8222-222222222222",
                project: "marketing-site",
                environment: "staging",
                version: 3,
                path: "blog/launch-notes",
                type: "BlogPost",
                locale: "en",
                format: "md",
                publishedAt: "2026-03-06T10:00:00.000Z",
                publishedBy: "33333333-3333-4333-8333-333333333333",
                changeSummary: "Polished introduction",
              },
            ],
            pagination: {
              total: 1,
              limit: 20,
              offset: 0,
              hasMore: false,
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

      return new Response(
        JSON.stringify({
          data: [
            {
              documentId: "11111111-1111-4111-8111-111111111111",
              project: "marketing-site",
              environment: "staging",
              version: 3,
              path: "blog/launch-notes",
              type: "BlogPost",
              locale: "en",
              format: "md",
              publishedAt: "2026-03-06T10:00:00.000Z",
              publishedBy: "33333333-3333-4333-8333-333333333333",
            },
          ],
          pagination: {
            total: 1,
            limit: 20,
            offset: 0,
            hasMore: false,
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

  const summary = await api.listVersions({
    documentId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(summary.pagination.total, 1);
  assert.equal(summary.data[0]?.version, 3);
  assert.equal(
    summary.data[0]?.translationGroupId,
    "22222222-2222-4222-8222-222222222222",
  );

  await assert.rejects(
    () =>
      api.listVersions({
        documentId: "11111111-1111-4111-8111-111111111111",
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "DOCUMENT_ROUTE_RESPONSE_INVALID",
  );
});

test("version detail helper validates required fields and rejects malformed payloads", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const api = createDocumentRouteApi({
    fetcher: async (input, init) => {
      calls.push({ input, init });

      if (String(input).includes("/versions/2")) {
        return new Response(
          JSON.stringify({
            data: {
              documentId: "11111111-1111-4111-8111-111111111111",
              translationGroupId: "22222222-2222-4222-8222-222222222222",
              project: "marketing-site",
              environment: "staging",
              version: 2,
              path: "blog/launch-notes",
              type: "BlogPost",
              locale: "en",
              format: "md",
              publishedAt: "2026-03-05T10:00:00.000Z",
              publishedBy: "33333333-3333-4333-8333-333333333333",
              frontmatter: {},
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

      return new Response(
        JSON.stringify({
          data: {
            documentId: "11111111-1111-4111-8111-111111111111",
            translationGroupId: "22222222-2222-4222-8222-222222222222",
            project: "marketing-site",
            environment: "staging",
            version: 3,
            path: "blog/launch-notes",
            type: "BlogPost",
            locale: "en",
            format: "md",
            publishedAt: "2026-03-06T10:00:00.000Z",
            publishedBy: "33333333-3333-4333-8333-333333333333",
            frontmatter: {},
            body: "# Published",
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

  const version = await api.getVersion({
    documentId: "11111111-1111-4111-8111-111111111111",
    version: 3,
  });

  assert.equal(version.version, 3);
  assert.equal(version.body, "# Published");

  await assert.rejects(
    () =>
      api.getVersion({
        documentId: "11111111-1111-4111-8111-111111111111",
        version: 2,
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "DOCUMENT_ROUTE_RESPONSE_INVALID",
  );
});
