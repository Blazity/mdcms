import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

test("post preview route renders draft content by slug", async () => {
  process.env.MDCMS_DEMO_API_KEY = "mdcms_key_test";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));

    assert.equal(url.pathname, "/api/v1/content");
    assert.equal(url.searchParams.get("type"), "post");
    assert.equal(url.searchParams.get("draft"), "true");
    assert.equal(url.searchParams.get("slug"), "hello-mdcms");
    assert.equal(
      (init?.headers as Headers).get("authorization"),
      "Bearer mdcms_key_test",
    );

    return new Response(
      JSON.stringify({
        data: [
          {
            documentId: "11111111-1111-1111-1111-111111111111",
            translationGroupId: "22222222-2222-2222-2222-222222222222",
            project: "marketing-site",
            environment: "staging",
            path: "content/posts/hello-mdcms",
            type: "post",
            locale: "en",
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: true,
            version: 3,
            publishedVersion: 2,
            draftRevision: 5,
            frontmatter: {
              title: "Hello MDCMS",
              slug: "hello-mdcms",
            },
            body: "# Hello MDCMS\n\nThis draft is rendered.",
            createdBy: "33333333-3333-3333-3333-333333333333",
            createdAt: "2026-03-27T08:00:00.000Z",
            updatedAt: "2026-03-27T09:00:00.000Z",
          },
        ],
        pagination: {
          total: 1,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  const module = await import("./page");
  const element = await module.default({
    params: Promise.resolve({ slug: "hello-mdcms" }),
  });
  const markup = renderToStaticMarkup(element);

  assert.match(markup, /Post Preview/);
  assert.match(markup, /Hello MDCMS/);
  assert.match(markup, /This draft is rendered/);
  assert.match(
    markup,
    /\/admin\/content\/post\/11111111-1111-1111-1111-111111111111/,
  );

  globalThis.fetch = originalFetch;
  delete process.env.MDCMS_DEMO_API_KEY;
});
