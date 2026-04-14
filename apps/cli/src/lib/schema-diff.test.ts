import { test } from "node:test";
import assert from "node:assert/strict";

import { computeSchemaDiff, hashSchemaTypeSnapshot } from "./schema-diff.js";

test("returns empty diff when local and server types match", () => {
  const local = { post: { schemaHash: "h1" } };
  const server = [{ type: "post", schemaHash: "h1" }];
  const diff = computeSchemaDiff(local, server);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.modified, []);
});

test("detects added types (in local, missing on server)", () => {
  const local = { post: { schemaHash: "h1" }, author: { schemaHash: "h2" } };
  const server = [{ type: "post", schemaHash: "h1" }];
  const diff = computeSchemaDiff(local, server);
  assert.deepEqual(diff.added, ["author"]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.modified, []);
});

test("detects removed types (on server, missing in local)", () => {
  const local = { post: { schemaHash: "h1" } };
  const server = [
    { type: "post", schemaHash: "h1" },
    { type: "tag", schemaHash: "h3" },
  ];
  const diff = computeSchemaDiff(local, server);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, ["tag"]);
  assert.deepEqual(diff.modified, []);
});

test("detects modified types by hash difference", () => {
  const local = { post: { schemaHash: "h1-new" } };
  const server = [{ type: "post", schemaHash: "h1-old" }];
  const diff = computeSchemaDiff(local, server);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.modified, ["post"]);
});

test("hashSchemaTypeSnapshot is deterministic regardless of key order", () => {
  const a = {
    type: "post",
    fields: { a: 1, b: 2 },
    directory: "content/posts",
  };
  const b = {
    fields: { b: 2, a: 1 },
    directory: "content/posts",
    type: "post",
  };
  assert.equal(hashSchemaTypeSnapshot(a), hashSchemaTypeSnapshot(b));
});

test("hashSchemaTypeSnapshot changes when content changes", () => {
  const a = { type: "post", fields: { a: 1 } };
  const b = { type: "post", fields: { a: 2 } };
  assert.notEqual(hashSchemaTypeSnapshot(a), hashSchemaTypeSnapshot(b));
});

test("output arrays are sorted alphabetically", () => {
  const local = {
    zebra: { schemaHash: "new" },
    apple: { schemaHash: "new-a" },
  };
  const server = [
    { type: "mango", schemaHash: "m" },
    { type: "apple", schemaHash: "old-a" },
    { type: "banana", schemaHash: "b" },
  ];
  const diff = computeSchemaDiff(local, server);
  assert.deepEqual(diff.added, ["zebra"]);
  assert.deepEqual(diff.removed, ["banana", "mango"]);
  assert.deepEqual(diff.modified, ["apple"]);
});
