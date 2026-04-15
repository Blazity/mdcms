import assert from "node:assert/strict";

import type { ContentDocumentResponse } from "@mdcms/shared";
import { test } from "bun:test";

import {
  mapContentDocument,
  deriveDocumentStatus,
  extractDocumentTitle,
  mapFiltersToQuery,
  getContentTypeListQueryKey,
  getContentTypeListGroupingMode,
  getTranslationCoverageStatus,
  PAGE_SIZE,
  shouldEnableTranslationCoverage,
} from "./use-content-type-list.js";

const baseDoc: ContentDocumentResponse = {
  documentId: "doc-1",
  translationGroupId: "tg-1",
  project: "marketing-site",
  environment: "production",
  path: "blog/hello-world",
  type: "BlogPost",
  locale: "en",
  format: "md",
  isDeleted: false,
  hasUnpublishedChanges: false,
  version: 1,
  publishedVersion: 1,
  draftRevision: 0,
  frontmatter: { title: "Hello World" },
  body: "# Hello",
  createdBy: "user-1",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedBy: "user-1",
  updatedAt: "2026-03-20T00:00:00.000Z",
};

test("deriveDocumentStatus returns published when publishedVersion set and no changes", () => {
  assert.equal(deriveDocumentStatus(1, false), "published");
});

test("deriveDocumentStatus returns draft when publishedVersion is null", () => {
  assert.equal(deriveDocumentStatus(null, false), "draft");
  assert.equal(deriveDocumentStatus(null, true), "draft");
});

test("deriveDocumentStatus returns changed when published with unpublished changes", () => {
  assert.equal(deriveDocumentStatus(1, true), "changed");
});

test("extractDocumentTitle returns frontmatter title when present", () => {
  assert.equal(
    extractDocumentTitle({ title: "My Post" }, "blog/post"),
    "My Post",
  );
});

test("extractDocumentTitle falls back to last path segment", () => {
  assert.equal(extractDocumentTitle({}, "blog/my-post"), "my-post");
  assert.equal(
    extractDocumentTitle({ title: "" }, "blog/fallback"),
    "fallback",
  );
  assert.equal(extractDocumentTitle({ title: 42 }, "a/b/c"), "c");
});

test("mapContentDocument transforms API response to view model", () => {
  const mapped = mapContentDocument(baseDoc);
  assert.equal(mapped.documentId, "doc-1");
  assert.equal(mapped.translationGroupId, "tg-1");
  assert.equal(mapped.title, "Hello World");
  assert.equal(mapped.path, "blog/hello-world");
  assert.equal(mapped.locale, "en");
  assert.equal(mapped.status, "published");
  assert.equal(mapped.updatedAt, "2026-03-20T00:00:00.000Z");
  assert.equal(mapped.createdBy, "user-1");
  assert.equal(mapped.updatedBy, "user-1");
});

test("mapContentDocument keeps creator and updater distinct", () => {
  const mapped = mapContentDocument({
    ...baseDoc,
    createdBy: "creator-1",
    updatedBy: "editor-2",
  });

  assert.equal(mapped.createdBy, "creator-1");
  assert.equal(mapped.updatedBy, "editor-2");
});

test("mapFiltersToQuery maps status filter to API params", () => {
  assert.deepEqual(mapFiltersToQuery({ status: "all" }), {});
  assert.deepEqual(mapFiltersToQuery({ status: "published" }), {
    published: true,
    hasUnpublishedChanges: false,
  });
  assert.deepEqual(mapFiltersToQuery({ status: "draft" }), {
    published: false,
  });
  assert.deepEqual(mapFiltersToQuery({ status: "changed" }), {
    published: true,
    hasUnpublishedChanges: true,
  });
});

test("mapFiltersToQuery maps sort values to API params", () => {
  assert.deepEqual(mapFiltersToQuery({ sort: "updated" }), {
    sort: "updatedAt",
    order: "desc",
  });
  assert.deepEqual(mapFiltersToQuery({ sort: "created" }), {
    sort: "createdAt",
    order: "desc",
  });
  assert.deepEqual(mapFiltersToQuery({ sort: "path-asc" }), {
    sort: "path",
    order: "asc",
  });
  assert.deepEqual(mapFiltersToQuery({ sort: "path-desc" }), {
    sort: "path",
    order: "desc",
  });
});

test("mapFiltersToQuery includes q when present", () => {
  const result = mapFiltersToQuery({ q: "hello" });
  assert.equal(result.q, "hello");
});

test("getContentTypeListQueryKey returns the canonical type-scoped query prefix", () => {
  assert.deepEqual(
    getContentTypeListQueryKey("marketing-site", "production", "BlogPost"),
    ["content-list", "marketing-site", "production", "BlogPost"],
  );
});

test("getContentTypeListGroupingMode returns a stable grouping discriminator", () => {
  assert.equal(getContentTypeListGroupingMode(true), "translationGroup");
  assert.equal(getContentTypeListGroupingMode(false), "document");
});

test("shouldEnableTranslationCoverage requires both a localized type and supported locales", () => {
  assert.equal(
    shouldEnableTranslationCoverage({
      enableTranslationCoverage: true,
      supportedLocaleCount: 2,
    }),
    true,
  );
  assert.equal(
    shouldEnableTranslationCoverage({
      enableTranslationCoverage: false,
      supportedLocaleCount: 2,
    }),
    false,
  );
  assert.equal(
    shouldEnableTranslationCoverage({
      enableTranslationCoverage: true,
      supportedLocaleCount: 0,
    }),
    false,
  );
});

test("getTranslationCoverageStatus reports loading during background coverage refetches", () => {
  assert.equal(
    getTranslationCoverageStatus({
      enableTranslationCoverage: true,
      isLoading: false,
      isFetching: true,
      hasError: false,
    }),
    "loading",
  );
});

test("PAGE_SIZE is 20", () => {
  assert.equal(PAGE_SIZE, 20);
});
