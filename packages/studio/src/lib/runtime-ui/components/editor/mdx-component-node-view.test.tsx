import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createMdxComponentPreviewProps,
  MdxComponentNodeFrame,
} from "./mdx-component-node-view.js";

test("MdxComponentNodeFrame renders wrapper component chrome with nested slot", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MdxComponentNodeFrame,
      {
        componentName: "Callout",
        isVoid: false,
        propsSummary: 'type="warning"',
        previewState: "ready",
        previewSurface: createElement("div", { "data-test-preview": "ready" }),
      },
      createElement("div", { "data-test-slot": "children" }, "Child content"),
    ),
  );

  assert.match(markup, /data-mdcms-mdx-component-frame="Callout"/);
  assert.match(markup, /data-mdcms-mdx-component-kind="wrapper"/);
  assert.match(markup, /data-mdcms-mdx-preview-state="ready"/);
  assert.match(markup, /data-test-preview="ready"/);
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
      previewState: "empty",
    }),
  );

  assert.match(markup, /data-mdcms-mdx-component-frame="HeroBanner"/);
  assert.match(markup, /data-mdcms-mdx-component-kind="void"/);
  assert.match(markup, /data-mdcms-mdx-preview-state="empty"/);
  assert.match(markup, /Local preview unavailable/);
  assert.match(markup, /Self-closing component/);
  assert.doesNotMatch(markup, /data-test-slot="children"/);
});

test("createMdxComponentPreviewProps injects wrapper children into preview props", () => {
  const previewProps = createMdxComponentPreviewProps({
    props: { tone: "warning" },
    isVoid: false,
    childrenHtml: "<p><strong>Body</strong></p>",
  });

  assert.equal(previewProps.tone, "warning");
  assert.ok("children" in previewProps);

  const markup = renderToStaticMarkup(
    createElement("section", null, previewProps.children as never),
  );

  assert.match(markup, /<strong>Body<\/strong>/);
});
