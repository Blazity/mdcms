import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import { loadDashboardData } from "./dashboard-data.js";
import type { StudioSchemaRouteApi } from "./schema-route-api.js";
import type { StudioContentListApi } from "./content-list-api.js";

function paginatedResponse(
  total: number,
  data: Array<Record<string, unknown>> = [],
) {
  return {
    data: data as any,
    pagination: { total, limit: 1, offset: 0, hasMore: total > 1 },
  };
}

function makeSchemaEntry(type: string, localized = false) {
  return {
    type,
    directory: `content/${type.toLowerCase()}`,
    localized,
    schemaHash: "hash-1",
    syncedAt: "2026-03-01T00:00:00.000Z",
    resolvedSchema: {
      type,
      directory: `content/${type.toLowerCase()}`,
      localized,
      fields: {},
    },
  };
}

function makeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    documentId: "doc-1",
    translationGroupId: "tg-1",
    project: "proj",
    environment: "prod",
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
    ...overrides,
  };
}

test("returns loaded state with real data", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [
      makeSchemaEntry("BlogPost", true),
      makeSchemaEntry("Page"),
    ],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const calls: string[] = [];
  const contentApi: StudioContentListApi = {
    list: async (query = {}) => {
      const key = `type=${query.type ?? ""},published=${query.published ?? ""},sort=${query.sort ?? ""}`;
      calls.push(key);

      // Global total
      if (!query.type && !query.published && !query.sort) {
        return paginatedResponse(42);
      }
      // Global published
      if (!query.type && query.published === true) {
        return paginatedResponse(30);
      }
      // Recent documents
      if (query.sort === "updatedAt") {
        return paginatedResponse(42, [
          makeDoc(),
          makeDoc({ documentId: "doc-2", path: "blog/world" }),
        ]);
      }
      // BlogPost total
      if (query.type === "BlogPost" && !query.published) {
        return paginatedResponse(20);
      }
      // BlogPost published
      if (query.type === "BlogPost" && query.published === true) {
        return paginatedResponse(15);
      }
      // Page total
      if (query.type === "Page" && !query.published) {
        return paginatedResponse(22);
      }
      // Page published
      if (query.type === "Page" && query.published === true) {
        return paginatedResponse(15);
      }

      return paginatedResponse(0);
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;

  assert.equal(result.data.totalDocuments, 42);
  assert.equal(result.data.publishedDocuments, 30);
  assert.equal(result.data.draftDocuments, 12);
  assert.equal(result.data.contentTypes.length, 2);

  assert.equal(result.data.contentTypes[0]?.type, "BlogPost");
  assert.equal(result.data.contentTypes[0]?.totalCount, 20);
  assert.equal(result.data.contentTypes[0]?.publishedCount, 15);
  assert.equal(result.data.contentTypes[0]?.localized, true);

  assert.equal(result.data.contentTypes[1]?.type, "Page");
  assert.equal(result.data.contentTypes[1]?.totalCount, 22);
  assert.equal(result.data.contentTypes[1]?.publishedCount, 15);
  assert.equal(result.data.contentTypes[1]?.localized, false);

  assert.equal(result.data.recentDocuments.length, 2);
  assert.equal(result.data.recentDocuments[0]?.documentId, "doc-1");
  assert.equal(result.data.recentDocuments[0]?.frontmatter.title, "Hello");
});

test("returns empty state when no documents and no schema types", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(0),
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "empty");
});

test("returns loaded state when schema types exist but no documents", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [makeSchemaEntry("BlogPost")],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(0),
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  // Has schema types, so not "empty" — it's loaded with zero documents
  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;

  assert.equal(result.data.totalDocuments, 0);
  assert.equal(result.data.contentTypes.length, 1);
  assert.equal(result.data.contentTypes[0]?.type, "BlogPost");
  assert.equal(result.data.contentTypes[0]?.totalCount, 0);
});

test("schema 403 degrades gracefully — content widgets still load", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new RuntimeError({
        code: "FORBIDDEN_ORIGIN",
        message: "Forbidden",
        statusCode: 403,
      });
    },
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async (query = {}) => {
      if (query.sort === "updatedAt") {
        return paginatedResponse(10, [makeDoc()]);
      }
      if (query.published === true) return paginatedResponse(8);
      return paginatedResponse(10);
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.totalDocuments, 10);
  assert.equal(result.data.publishedDocuments, 8);
  assert.equal(result.data.contentTypes.length, 0);
  assert.equal(result.data.recentDocuments.length, 1);
});

test("schema 401 degrades gracefully — content widgets still load", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new RuntimeError({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        statusCode: 401,
      });
    },
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(5),
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.totalDocuments, 5);
  assert.equal(result.data.contentTypes.length, 0);
});

test("content 403 degrades gracefully — shows empty state", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message: "No content:read grant",
        statusCode: 403,
      });
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  // Both schema and content are empty → empty state, NOT forbidden
  assert.equal(result.status, "empty");
});

test("content 401 degrades gracefully — shows empty state", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => {
      throw new RuntimeError({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        statusCode: 401,
      });
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "empty");
});

test("content 403 with schema types shows loaded with empty content", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [makeSchemaEntry("BlogPost")],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message: "No content:read grant",
        statusCode: 403,
      });
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.totalDocuments, 0);
  assert.equal(result.data.contentTypes.length, 1);
  assert.equal(result.data.contentTypes[0]?.totalCount, 0);
  assert.equal(result.data.recentDocuments.length, 0);
});

test("returns error state when content API returns 500", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "Something broke",
        statusCode: 500,
      });
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.message, "Something broke");
});

test("returns error state on generic content Error", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => {
      throw new Error("Network failure");
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.message, "Network failure");
});

test("schema 500 propagates as error — not swallowed", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "Schema service down",
        statusCode: 500,
      });
    },
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(10),
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.message, "Schema service down");
});

test("schema network error propagates as error — not swallowed", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new Error("fetch failed");
    },
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(10),
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.message, "fetch failed");
});

test("caps content types at 5", async () => {
  const types = Array.from({ length: 8 }, (_, i) =>
    makeSchemaEntry(`Type${i}`),
  );

  const schemaApi: StudioSchemaRouteApi = {
    list: async () => types,
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(100),
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;

  assert.equal(result.data.contentTypes.length, 5);
  assert.equal(result.data.contentTypes[4]?.type, "Type4");
});

test("recent documents include frontmatter and hasUnpublishedChanges", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [makeSchemaEntry("BlogPost")],
    sync: async () => ({ schemaHash: "", syncedAt: "", affectedTypes: [] }),
  };

  const draftDoc = makeDoc({
    documentId: "doc-draft",
    hasUnpublishedChanges: true,
    frontmatter: { title: "Draft Post" },
  });

  const contentApi: StudioContentListApi = {
    list: async (query = {}) => {
      if (query.sort === "updatedAt") {
        return paginatedResponse(1, [draftDoc]);
      }
      return paginatedResponse(1);
    },
  };

  const result = await loadDashboardData(schemaApi, contentApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;

  assert.equal(result.data.recentDocuments.length, 1);
  assert.equal(result.data.recentDocuments[0]?.hasUnpublishedChanges, true);
  assert.equal(result.data.recentDocuments[0]?.frontmatter.title, "Draft Post");
});
