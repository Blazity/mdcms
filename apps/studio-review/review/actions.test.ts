import assert from "node:assert/strict";

import { test } from "bun:test";

import { getReviewAction, listReviewActions } from "./actions";

test("listReviewActions filters the review catalog by scenario capabilities", () => {
  assert.deepEqual(
    listReviewActions("editor").map((action) => action.id),
    ["content.list", "content.publish", "schema.list"],
  );
  assert.deepEqual(
    listReviewActions("viewer").map((action) => action.id),
    ["content.list"],
  );
  assert.deepEqual(
    listReviewActions("owner").map((action) => action.id),
    [
      "content.list",
      "content.publish",
      "schema.list",
      "users.list",
      "settings.read",
    ],
  );
});

test("getReviewAction returns only actions visible in the selected scenario", () => {
  assert.equal(getReviewAction("viewer", "content.publish"), undefined);
  assert.equal(
    getReviewAction("editor", "content.publish")?.path,
    "/api/v1/content/:id/publish",
  );
});
