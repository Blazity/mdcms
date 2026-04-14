import assert from "node:assert/strict";

import { test } from "bun:test";

import type { StudioContentListApi } from "../../content-list-api.js";

import {
  buildContentTranslationCoverageMap,
  formatContentTranslationCoverageLabel,
  loadContentTranslationCoverageMap,
} from "./content-translation-coverage.js";

test("buildContentTranslationCoverageMap counts unique locales per translation group", () => {
  const coverage = buildContentTranslationCoverageMap(
    [
      { translationGroupId: "tg-1", locale: "en" },
      { translationGroupId: "tg-1", locale: "fr" },
      { translationGroupId: "tg-1", locale: "fr" },
      { translationGroupId: "tg-2", locale: "en" },
    ],
    4,
  );

  assert.deepEqual(coverage, {
    "tg-1": { translatedLocales: 2, totalLocales: 4 },
    "tg-2": { translatedLocales: 1, totalLocales: 4 },
  });
});

test("buildContentTranslationCoverageMap prefers grouped locale metadata when present", () => {
  const coverage = buildContentTranslationCoverageMap(
    [
      {
        translationGroupId: "tg-1",
        locale: "fr",
        localesPresent: ["en", "fr"],
      },
      {
        translationGroupId: "tg-2",
        locale: "en",
        localesPresent: ["en"],
      },
    ],
    2,
  );

  assert.deepEqual(coverage, {
    "tg-1": { translatedLocales: 2, totalLocales: 2 },
    "tg-2": { translatedLocales: 1, totalLocales: 2 },
  });
});

test("formatContentTranslationCoverageLabel renders the translated locale count", () => {
  assert.equal(
    formatContentTranslationCoverageLabel({
      translatedLocales: 2,
      totalLocales: 4,
    }),
    "2/4 locales translated",
  );
});

test("loadContentTranslationCoverageMap paginates through the full type list", async () => {
  const calls: Array<Record<string, unknown> | undefined> = [];
  const api: StudioContentListApi = {
    list: async (query = {}) => {
      calls.push(query);

      if ((query.offset ?? 0) === 0) {
        return {
          data: [
            {
              documentId: "doc-1",
              translationGroupId: "tg-1",
              project: "marketing-site",
              environment: "production",
              path: "blog/hello-world",
              type: "BlogPost",
              locale: "fr",
              format: "md",
              isDeleted: false,
              hasUnpublishedChanges: false,
              version: 1,
              publishedVersion: 1,
              draftRevision: 0,
              frontmatter: { title: "Hello World" },
              body: "# Hello",
              localesPresent: ["en", "fr"],
              publishedLocales: ["en", "fr"],
              createdBy: "user-1",
              createdAt: "2026-03-01T00:00:00.000Z",
              updatedBy: "user-1",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
          ],
          pagination: {
            total: 2,
            limit: 100,
            offset: 0,
            hasMore: true,
          },
        };
      }

      return {
        data: [
          {
            documentId: "doc-3",
            translationGroupId: "tg-2",
            project: "marketing-site",
            environment: "production",
            path: "blog/hallo",
            type: "BlogPost",
            locale: "de",
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: false,
            version: 1,
            publishedVersion: 1,
            draftRevision: 0,
            frontmatter: { title: "Hallo" },
            body: "# Hallo",
            localesPresent: ["de"],
            publishedLocales: ["de"],
            createdBy: "user-1",
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedBy: "user-1",
            updatedAt: "2026-03-20T00:00:00.000Z",
          },
        ],
        pagination: {
          total: 2,
          limit: 100,
          offset: 100,
          hasMore: false,
        },
      };
    },
  };

  const coverage = await loadContentTranslationCoverageMap(api, {
    type: "BlogPost",
    totalLocales: 4,
  });

  assert.deepEqual(coverage, {
    "tg-1": { translatedLocales: 2, totalLocales: 4 },
    "tg-2": { translatedLocales: 1, totalLocales: 4 },
  });
  assert.deepEqual(calls, [
    {
      type: "BlogPost",
      draft: true,
      isDeleted: false,
      groupBy: "translationGroup",
      limit: 100,
      offset: 0,
    },
    {
      type: "BlogPost",
      draft: true,
      isDeleted: false,
      groupBy: "translationGroup",
      limit: 100,
      offset: 100,
    },
  ]);
});

test("loadContentTranslationCoverageMap stops after the configured maxPages guard", async () => {
  let calls = 0;
  const api: StudioContentListApi = {
    list: async () => {
      calls += 1;

      if (calls > 3) {
        throw new Error("pagination guard did not stop further requests");
      }

      return {
        data: [
          {
            documentId: `doc-${calls}`,
            translationGroupId: "tg-1",
            project: "marketing-site",
            environment: "production",
            path: `blog/post-${calls}`,
            type: "BlogPost",
            locale: `locale-${calls}`,
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: false,
            version: 1,
            publishedVersion: 1,
            draftRevision: 0,
            frontmatter: { title: `Post ${calls}` },
            body: "# Post",
            createdBy: "user-1",
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedBy: "user-1",
            updatedAt: "2026-03-20T00:00:00.000Z",
          },
        ],
        pagination: {
          total: 1,
          limit: 1,
          offset: calls - 1,
          hasMore: true,
        },
      };
    },
  };

  const coverage = await loadContentTranslationCoverageMap(api, {
    type: "BlogPost",
    totalLocales: 5,
    maxPages: 3,
  } as never);

  assert.equal(calls, 3);
  assert.deepEqual(coverage, {
    "tg-1": {
      translatedLocales: 3,
      totalLocales: 5,
    },
  });
});
