import assert from "node:assert/strict";

import { test } from "bun:test";

import { getReviewContentDocumentRecord } from "./content-documents";

test("getReviewContentDocumentRecord returns the scenario-specific routed document", () => {
  const record = getReviewContentDocumentRecord(
    "editor",
    "11111111-1111-4111-8111-111111111111",
  );

  assert.ok(record);
  assert.equal(record.document.type, "post");
  assert.equal(record.versions.length >= 1, true);
});

test("getReviewContentDocumentRecord exposes fixtures for legacy content list document ids", () => {
  const record = getReviewContentDocumentRecord("editor", "1");

  assert.ok(record);
  assert.equal(record.document.documentId, "1");
  assert.equal(record.document.type, "BlogPost");
  assert.equal(record.versions.length >= 1, true);
});
