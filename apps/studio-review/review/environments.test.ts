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

  assert.equal(environments.length, 2);
  assert.equal(environments[0]?.name, "production");
  assert.equal(environments[1]?.name, "staging");
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
  const created = createReviewEnvironment("owner", { name: "preview" });
  const environments = listReviewEnvironments("owner");

  assert.equal(created.name, "preview");
  assert.equal(environments.length, 3);
  assert.equal(environments[2]?.name, "preview");
});

test("deleteReviewEnvironment removes non-default rows and rejects deleting production", () => {
  const deleted = deleteReviewEnvironment("owner", "env-staging");

  assert.deepEqual(deleted, {
    deleted: true,
    id: "env-staging",
  });
  assert.equal(listReviewEnvironments("owner").length, 1);

  assert.throws(
    () => deleteReviewEnvironment("owner", "env-production"),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 409,
  );
});
