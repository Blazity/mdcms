import assert from "node:assert/strict";

import type { ContentDocumentResponse } from "@mdcms/shared";
import { test } from "bun:test";

import {
  mapTrashDocument,
  mapTrashFiltersToQuery,
  TRASH_PAGE_SIZE,
} from "./use-trash-list.js";

const baseDeletedDoc: ContentDocumentResponse = {
  documentId: "doc-1",
  translationGroupId: "tg-1",
  project: "marketing-site",
  environment: "production",
  path: "blog/hello-world",
  type: "BlogPost",
  locale: "en",
  format: "md",
  isDeleted: true,
  hasUnpublishedChanges: true,
  version: 1,
  publishedVersion: 1,
  draftRevision: 2,
  frontmatter: { title: "Hello World" },
  body: "# Hello",
  createdBy: "user-1",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-25T14:00:00.000Z",
};

test("TRASH_PAGE_SIZE is 20", () => {
  assert.equal(TRASH_PAGE_SIZE, 20);
});

test("mapTrashDocument transforms deleted API response to trash view model", () => {
  const mapped = mapTrashDocument(baseDeletedDoc);
  assert.equal(mapped.documentId, "doc-1");
  assert.equal(mapped.title, "Hello World");
  assert.equal(mapped.path, "blog/hello-world");
  assert.equal(mapped.locale, "en");
  assert.equal(mapped.type, "BlogPost");
  assert.equal(mapped.deletedAt, "2026-03-25T14:00:00.000Z");
  assert.equal(mapped.deletedBy, "user-1");
});

test("mapTrashDocument falls back to last path segment for title", () => {
  const doc = { ...baseDeletedDoc, frontmatter: {} };
  const mapped = mapTrashDocument(doc);
  assert.equal(mapped.title, "hello-world");
});

test("mapTrashFiltersToQuery returns empty object for no filters", () => {
  assert.deepEqual(mapTrashFiltersToQuery({}), {});
});

test("mapTrashFiltersToQuery maps type filter", () => {
  assert.deepEqual(mapTrashFiltersToQuery({ type: "BlogPost" }), {
    type: "BlogPost",
  });
});

test("mapTrashFiltersToQuery maps search query", () => {
  assert.deepEqual(mapTrashFiltersToQuery({ q: "hello" }), { q: "hello" });
});

test("mapTrashFiltersToQuery maps sort values", () => {
  assert.deepEqual(mapTrashFiltersToQuery({ sort: "updated" }), {
    sort: "updatedAt",
    order: "desc",
  });
  assert.deepEqual(mapTrashFiltersToQuery({ sort: "created" }), {
    sort: "createdAt",
    order: "desc",
  });
  assert.deepEqual(mapTrashFiltersToQuery({ sort: "path-asc" }), {
    sort: "path",
    order: "asc",
  });
  assert.deepEqual(mapTrashFiltersToQuery({ sort: "path-desc" }), {
    sort: "path",
    order: "desc",
  });
});

test("mapTrashFiltersToQuery combines type, q, and sort", () => {
  const result = mapTrashFiltersToQuery({
    type: "Page",
    q: "about",
    sort: "updated",
  });
  assert.deepEqual(result, {
    type: "Page",
    q: "about",
    sort: "updatedAt",
    order: "desc",
  });
});
