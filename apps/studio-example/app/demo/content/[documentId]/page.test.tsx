import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

test("raw content detail page clearly identifies the raw API data source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          documentId: "11111111-1111-1111-1111-111111111111",
          type: "post",
          locale: "en",
          path: "content/posts/hello-mdcms",
          format: "md",
          frontmatter: {
            title: "Hello MDCMS",
          },
          body: "Hello world",
          draftRevision: 5,
          publishedVersion: 3,
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );

  const module = await import("./page");
  const element = await module.default({
    params: Promise.resolve({
      documentId: "11111111-1111-1111-1111-111111111111",
    }),
  });
  const markup = renderToStaticMarkup(element);

  assert.match(markup, /Raw Content API Document/i);
  assert.match(markup, /Data source:\s*<strong>Direct API fetch<\/strong>/i);
  assert.match(
    markup,
    /\/demo\/sdk-content\/11111111-1111-1111-1111-111111111111/i,
  );

  globalThis.fetch = originalFetch;
});
