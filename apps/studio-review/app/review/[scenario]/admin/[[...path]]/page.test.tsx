import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminStudioClient } from "../admin-studio-client";
import { resolveStudioReviewAppRoot } from "../resolve-studio-review-app-root";
import {
  createReviewScenarioServerUrl,
  resolveReviewRequestOrigin,
} from "../studio-config";
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

test("resolveReviewRequestOrigin prefers forwarded Vercel headers", () => {
  const requestHeaders = new Headers({
    "x-forwarded-proto": "https",
    "x-forwarded-host": "mdcms-studio-review.vercel.app",
    host: "ignored.example.com",
  });

  assert.equal(
    resolveReviewRequestOrigin(requestHeaders),
    "https://mdcms-studio-review.vercel.app",
  );
});

test("createReviewScenarioServerUrl scopes review api routes to a provided origin", () => {
  assert.equal(
    createReviewScenarioServerUrl({
      scenario: "editor",
      origin: "https://mdcms-studio-review.vercel.app",
    }),
    "https://mdcms-studio-review.vercel.app/review-api/editor",
  );
});

test("AdminStudioClient renders the provided server url into the Studio shell", () => {
  const markup = renderToStaticMarkup(
    <AdminStudioClient
      scenario="editor"
      basePath="/review/editor/admin"
      serverUrl="https://mdcms-studio-review.vercel.app/review-api/editor"
      preparedComponents={[]}
    />,
  );

  assert.match(
    markup,
    /data-mdcms-server-url="https:\/\/mdcms-studio-review\.vercel\.app\/review-api\/editor"/,
  );
  assert.doesNotMatch(markup, /127\.0\.0\.1:4273/);
});
