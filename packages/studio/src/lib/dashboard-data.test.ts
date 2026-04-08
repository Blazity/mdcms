import assert from "node:assert/strict";

import { RuntimeError } from "@mdcms/shared";
import { test } from "bun:test";

import { loadDashboardData } from "./dashboard-data.js";
import type { StudioSchemaRouteApi } from "./schema-route-api.js";
import type { StudioContentListApi } from "./content-list-api.js";
import type { StudioContentOverviewApi } from "./content-overview-api.js";

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

const emptySyncResult = {
  schemaHash: "",
  syncedAt: "",
  affectedTypes: [] as string[],
};

function makeOverviewApi(
  counts: Record<string, { total: number; published: number; drafts: number }>,
): StudioContentOverviewApi {
  return {
    get: async (input) =>
      input.types.map((type) => ({
        type,
        total: counts[type]?.total ?? 0,
        published: counts[type]?.published ?? 0,
        drafts: counts[type]?.drafts ?? 0,
      })),
  };
}

const emptyOverviewApi = makeOverviewApi({});

test("returns loaded state with real data", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [
      makeSchemaEntry("BlogPost", true),
      makeSchemaEntry("Page"),
    ],
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async (query = {}) => {
      if (query.sort === "updatedAt")
        return paginatedResponse(42, [
          makeDoc(),
          makeDoc({ documentId: "doc-2", path: "blog/world" }),
        ]);
      return paginatedResponse(0);
    },
  };

  const overviewApi = makeOverviewApi({
    BlogPost: { total: 20, published: 15, drafts: 5 },
    Page: { total: 22, published: 15, drafts: 7 },
  });

  const result = await loadDashboardData(schemaApi, contentApi, overviewApi);

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
  assert.equal(result.data.recentDocuments.length, 2);
});

test("zero documents returns loaded with 0 counts, not a special empty state", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(0),
  };

  const result = await loadDashboardData(
    schemaApi,
    contentApi,
    emptyOverviewApi,
  );

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.totalDocuments, 0);
  assert.equal(result.data.publishedDocuments, 0);
  assert.equal(result.data.draftDocuments, 0);
  assert.equal(result.data.contentTypes.length, 0);
  assert.equal(result.data.recentDocuments.length, 0);
});

test("schema types with zero documents returns loaded with type stats", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [makeSchemaEntry("BlogPost")],
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(0),
  };

  const overviewApi = makeOverviewApi({
    BlogPost: { total: 0, published: 0, drafts: 0 },
  });

  const result = await loadDashboardData(schemaApi, contentApi, overviewApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.totalDocuments, 0);
  assert.equal(result.data.contentTypes.length, 1);
  assert.equal(result.data.contentTypes[0]?.type, "BlogPost");
  assert.equal(result.data.contentTypes[0]?.totalCount, 0);
});

test("returns forbidden on schema 403", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message: "Forbidden",
        statusCode: 403,
      });
    },
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(10),
  };

  const result = await loadDashboardData(
    schemaApi,
    contentApi,
    emptyOverviewApi,
  );
  assert.equal(result.status, "forbidden");
});

test("returns forbidden on content 403", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [],
    sync: async () => emptySyncResult,
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

  const result = await loadDashboardData(
    schemaApi,
    contentApi,
    emptyOverviewApi,
  );
  assert.equal(result.status, "forbidden");
});

test("returns forbidden on 401", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new RuntimeError({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        statusCode: 401,
      });
    },
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(0),
  };

  const result = await loadDashboardData(
    schemaApi,
    contentApi,
    emptyOverviewApi,
  );
  assert.equal(result.status, "forbidden");
});

test("returns error on 500", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new RuntimeError({
        code: "INTERNAL_ERROR",
        message: "Schema service down",
        statusCode: 500,
      });
    },
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(10),
  };

  const result = await loadDashboardData(
    schemaApi,
    contentApi,
    emptyOverviewApi,
  );
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.message, "Schema service down");
});

test("returns error on network failure", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => {
      throw new Error("fetch failed");
    },
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(10),
  };

  const result = await loadDashboardData(
    schemaApi,
    contentApi,
    emptyOverviewApi,
  );
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
    sync: async () => emptySyncResult,
  };

  const contentApi: StudioContentListApi = {
    list: async () => paginatedResponse(100),
  };

  const counts: Record<
    string,
    { total: number; published: number; drafts: number }
  > = {};
  for (let i = 0; i < 8; i++) {
    counts[`Type${i}`] = { total: 100, published: 80, drafts: 20 };
  }
  const overviewApi = makeOverviewApi(counts);

  const result = await loadDashboardData(schemaApi, contentApi, overviewApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.contentTypes.length, 5);
  assert.equal(result.data.contentTypes[4]?.type, "Type4");
});

test("recent documents include frontmatter and hasUnpublishedChanges", async () => {
  const schemaApi: StudioSchemaRouteApi = {
    list: async () => [makeSchemaEntry("BlogPost")],
    sync: async () => emptySyncResult,
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

  const overviewApi = makeOverviewApi({
    BlogPost: { total: 1, published: 0, drafts: 1 },
  });

  const result = await loadDashboardData(schemaApi, contentApi, overviewApi);

  assert.equal(result.status, "loaded");
  if (result.status !== "loaded") return;
  assert.equal(result.data.recentDocuments.length, 1);
  assert.equal(result.data.recentDocuments[0]?.hasUnpublishedChanges, true);
  assert.equal(
    result.data.recentDocuments[0]?.frontmatter.title,
    "Draft Post",
  );
});
