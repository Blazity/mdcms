import assert from "node:assert/strict";

import { IMPLICIT_DEFAULT_LOCALE } from "@mdcms/shared";
import { test } from "bun:test";

import { buildCreatePayload } from "./use-create-document.js";

test("buildCreatePayload uses mdx format and default locale", () => {
  const payload = buildCreatePayload("BlogPost", {
    path: "blog/new-post",
    title: "New Post",
  });

  assert.equal(payload.type, "BlogPost");
  assert.equal(payload.path, "blog/new-post");
  assert.equal(payload.format, "mdx");
  assert.equal(payload.locale, IMPLICIT_DEFAULT_LOCALE);
  assert.deepEqual(payload.frontmatter, { title: "New Post" });
  assert.equal(payload.body, "");
});

test("buildCreatePayload includes locale when provided", () => {
  const payload = buildCreatePayload("BlogPost", {
    path: "blog/new-post",
    title: "New Post",
    locale: "fr",
  });

  assert.equal(payload.locale, "fr");
  assert.equal(payload.type, "BlogPost");
});
