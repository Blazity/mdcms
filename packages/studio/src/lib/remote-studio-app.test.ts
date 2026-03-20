import assert from "node:assert/strict";
import { test } from "node:test";

import { matchStudioRoute, stripStudioBasePath } from "./remote-studio-app.js";

test("stripStudioBasePath resolves internal routes under an explicit base path", () => {
  assert.equal(stripStudioBasePath("/admin", "/admin"), "/");
  assert.equal(
    stripStudioBasePath("/admin/content/posts", "/admin"),
    "/content/posts",
  );
  assert.equal(
    stripStudioBasePath("/cms/admin/content/posts", "/cms/admin"),
    "/content/posts",
  );
});

test("matchStudioRoute resolves static and parameterized routes", () => {
  assert.equal(
    matchStudioRoute("/content", [
      { id: "dashboard", path: "/" },
      { id: "content.index", path: "/content" },
      { id: "content.type", path: "/content/:type" },
      { id: "content.document", path: "/content/:type/:documentId" },
    ])?.id,
    "content.index",
  );

  assert.equal(
    matchStudioRoute("/content/posts", [
      { id: "dashboard", path: "/" },
      { id: "content.index", path: "/content" },
      { id: "content.type", path: "/content/:type" },
      { id: "content.document", path: "/content/:type/:documentId" },
    ])?.id,
    "content.type",
  );

  assert.equal(
    matchStudioRoute("/content/posts/entry-1", [
      { id: "dashboard", path: "/" },
      { id: "content.index", path: "/content" },
      { id: "content.type", path: "/content/:type" },
      { id: "content.document", path: "/content/:type/:documentId" },
    ])?.id,
    "content.document",
  );
});
