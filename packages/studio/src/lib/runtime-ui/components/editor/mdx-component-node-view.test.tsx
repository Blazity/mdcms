import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MdxComponentNodeFrame } from "./mdx-component-node-view.js";

test("MdxComponentNodeFrame renders wrapper component chrome with nested slot", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MdxComponentNodeFrame,
      {
        componentName: "Callout",
        isVoid: false,
        propsSummary: 'type="warning"',
      },
      createElement("div", { "data-test-slot": "children" }, "Child content"),
    ),
  );

  assert.match(markup, /data-mdcms-mdx-component-frame="Callout"/);
  assert.match(markup, /data-mdcms-mdx-component-kind="wrapper"/);
  assert.match(markup, />Callout</);
  assert.match(markup, /type=&quot;warning&quot;/);
  assert.match(markup, /data-test-slot="children"/);
});

test("MdxComponentNodeFrame renders void component chrome without child slot", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentNodeFrame, {
      componentName: "HeroBanner",
      isVoid: true,
      propsSummary: 'title="Launch"',
    }),
  );

  assert.match(markup, /data-mdcms-mdx-component-frame="HeroBanner"/);
  assert.match(markup, /data-mdcms-mdx-component-kind="void"/);
  assert.match(markup, /Self-closing component/);
  assert.doesNotMatch(markup, /data-test-slot="children"/);
});
