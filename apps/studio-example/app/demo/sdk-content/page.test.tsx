import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

test("SDK content list page clearly identifies the SDK data source", async () => {
  process.env.MDCMS_DEMO_API_KEY = "mdcms_key_test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assert.equal(
      String(input),
      "http://localhost:4000/api/v1/content?type=post&draft=true&limit=50&offset=0",
    );
    assert.equal(
      (init?.headers as Headers).get("authorization"),
      "Bearer mdcms_key_test",
    );
    assert.equal(
      (init?.headers as Headers).get("x-mdcms-project"),
      "marketing-site",
    );
    assert.equal(
      (init?.headers as Headers).get("x-mdcms-environment"),
      "staging",
    );

    return new Response(
      JSON.stringify({
        data: [
          {
            documentId: "11111111-1111-1111-1111-111111111111",
            translationGroupId: "22222222-2222-2222-2222-222222222222",
            project: "marketing-site",
            environment: "staging",
            path: "blog/hello-world",
            type: "post",
            locale: "en",
            format: "md",
            isDeleted: false,
            hasUnpublishedChanges: false,
            version: 3,
            publishedVersion: 3,
            draftRevision: 5,
            frontmatter: {
              title: "Hello World",
              slug: "hello-world",
            },
            body: "Hello world",
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
  const element = await module.default();
  const markup = renderToStaticMarkup(element);

  assert.match(markup, /SDK Content Demo/i);
  assert.match(markup, /type=<code>post<\/code>/i);
  assert.match(markup, /Data source:\s*<strong>@mdcms\/sdk<\/strong>/i);
  assert.match(markup, /\/demo\/content/i);
  assert.match(markup, /11111111-1111-1111-1111-111111111111/);

  globalThis.fetch = originalFetch;
  delete process.env.MDCMS_DEMO_API_KEY;
});
