import assert from "node:assert/strict";

import type { ContentDocumentResponse } from "@mdcms/shared";
import { test } from "bun:test";

import {
  mapContentDocument,
  deriveDocumentStatus,
  extractDocumentTitle,
  mapFiltersToQuery,
  PAGE_SIZE,
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

test("PAGE_SIZE is 20", () => {
  assert.equal(PAGE_SIZE, 20);
});
