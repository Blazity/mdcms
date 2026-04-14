import assert from "node:assert/strict";

import { beforeEach, test } from "bun:test";

import {
  createReviewEnvironment,
  deleteReviewEnvironment,
  listReviewEnvironments,
  resetReviewEnvironmentStore,
} from "./environments";

beforeEach(() => {
  resetReviewEnvironmentStore();
});

test("listReviewEnvironments allows owner scenarios and returns seeded rows", () => {
  const environments = listReviewEnvironments("owner");

  assert.equal(environments.meta.definitionsStatus, "ready");
  assert.equal(environments.data.length, 2);
  assert.equal(environments.data[0]?.name, "production");
  assert.equal(environments.data[1]?.name, "staging");
});

test("listReviewEnvironments forbids non-admin scenarios", () => {
  assert.throws(
    () => listReviewEnvironments("editor"),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 403,
  );
});

test("createReviewEnvironment persists newly created review rows", () => {
  const before = listReviewEnvironments("owner");
  const created = createReviewEnvironment("owner", { name: "preview" });
  const environments = listReviewEnvironments("owner");

  assert.equal(created.name, "preview");
  assert.equal(environments.data.length, 3);
  assert.equal(environments.data[2]?.name, "preview");
  assert.notEqual(
    before.meta.configSnapshotHash,
    environments.meta.configSnapshotHash,
  );
  assert.notEqual(before.meta.syncedAt, environments.meta.syncedAt);
});

test("createReviewEnvironment forbids non-admin scenarios", () => {
  assert.throws(
    () => createReviewEnvironment("editor", { name: "preview" }),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 403,
  );
});

test("deleteReviewEnvironment removes non-default rows and rejects deleting production", () => {
  const before = listReviewEnvironments("owner");
  const deleted = deleteReviewEnvironment("owner", "env-staging");
  const after = listReviewEnvironments("owner");

  assert.deepEqual(deleted, {
    deleted: true,
    id: "env-staging",
  });
  assert.equal(after.data.length, 1);
  assert.notEqual(
    before.meta.configSnapshotHash,
    after.meta.configSnapshotHash,
  );
  assert.notEqual(before.meta.syncedAt, after.meta.syncedAt);

  assert.throws(
    () => deleteReviewEnvironment("owner", "env-production"),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 409,
  );
});

test("deleteReviewEnvironment forbids non-admin scenarios", () => {
  assert.throws(
    () => deleteReviewEnvironment("editor", "env-staging"),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 403,
  );
});
