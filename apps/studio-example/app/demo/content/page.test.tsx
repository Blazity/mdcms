import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

test("raw content list page clearly identifies the raw API data source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [],
        pagination: {
          total: 0,
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

  const module = await import("./page");
  const element = await module.default();
  const markup = renderToStaticMarkup(element);

  assert.match(markup, /Raw Content API Demo/i);
  assert.match(markup, /Data source:\s*<strong>Direct API fetch<\/strong>/i);
  assert.match(markup, /\/demo\/sdk-content/i);

  globalThis.fetch = originalFetch;
});
