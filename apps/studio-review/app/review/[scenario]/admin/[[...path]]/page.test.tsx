import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";

import { AdminStudioClient } from "../admin-studio-client";
import { resolveStudioReviewAppRoot } from "../resolve-studio-review-app-root";
import AdminReviewPage from "./page";

test("resolveStudioReviewAppRoot is stable from the workspace root", () => {
  assert.equal(
    resolveStudioReviewAppRoot("/workspace"),
    resolve("/workspace", "apps/studio-review"),
  );
});

test("resolveStudioReviewAppRoot does not duplicate the app path", () => {
  assert.equal(
    resolveStudioReviewAppRoot("/workspace/apps/studio-review"),
    "/workspace/apps/studio-review",
  );
});

test("review admin page prepares scenario-scoped Studio config", async () => {
  const element = await AdminReviewPage({
    params: Promise.resolve({
      scenario: "editor",
      path: ["content", "post", "11111111-1111-4111-8111-111111111111"],
    }),
  });

  assert.equal(element.type, AdminStudioClient);
  assert.equal(element.props.scenario, "editor");
  assert.equal(element.props.basePath, "/review/editor/admin");
  assert.ok(Array.isArray(element.props.preparedComponents));
  assert.equal(element.props.preparedComponents.length, 3);
});
