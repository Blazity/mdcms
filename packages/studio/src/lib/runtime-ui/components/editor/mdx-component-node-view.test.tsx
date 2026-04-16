import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createMdxComponentPreviewProps,
  formatMdxComponentPropsSummary,
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
  assert.match(markup, /&lt;Callout \/&gt;/);
  assert.match(markup, /data-test-slot="children"/);
  assert.doesNotMatch(markup, />Wrapper</);
  assert.doesNotMatch(markup, /type=&quot;warning&quot;/);
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
  assert.match(markup, /&lt;HeroBanner \/&gt;/);
  assert.doesNotMatch(markup, /Local preview unavailable/);
  assert.doesNotMatch(markup, /Self-closing component/);
  assert.doesNotMatch(markup, /data-test-slot="children"/);
  assert.doesNotMatch(markup, />Void</);
});

test("formatMdxComponentPropsSummary distinguishes empty props from non-editable components", () => {
  assert.equal(formatMdxComponentPropsSummary({}), "No props set yet");
  assert.equal(formatMdxComponentPropsSummary(undefined), "No props set yet");
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

test("MdxComponentNodeFrame renders content-label data attribute for wrapper components", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MdxComponentNodeFrame,
      {
        componentName: "Callout",
        isVoid: false,
        propsSummary: 'type="warning"',
        previewState: "empty",
      },
      createElement("div", { "data-test-slot": "children" }, "Child content"),
    ),
  );

  assert.match(markup, /data-mdcms-mdx-content-label="Callout"/);
  assert.doesNotMatch(markup, />Inner content</);
  assert.doesNotMatch(markup, /Edit nested markdown directly in this block/);
});

test("MdxComponentNodeFrame does not render content label for void components", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentNodeFrame, {
      componentName: "HeroBanner",
      isVoid: true,
      propsSummary: 'title="Launch"',
      previewState: "empty",
    }),
  );

  assert.doesNotMatch(markup, /data-mdcms-mdx-content-label/);
});

test("MdxComponentNodeFrame renders action buttons when callbacks are provided", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentNodeFrame, {
      componentName: "Alert",
      isVoid: true,
      propsSummary: "",
      previewState: "empty",
      onEditProps: () => {},
      onDelete: () => {},
    }),
  );

  assert.match(markup, /aria-label="Edit Alert props"/);
  assert.match(markup, /aria-label="Delete Alert"/);
});

test("MdxComponentNodeFrame omits action buttons when callbacks are not provided", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentNodeFrame, {
      componentName: "Alert",
      isVoid: true,
      propsSummary: "",
      previewState: "empty",
    }),
  );

  assert.doesNotMatch(markup, /aria-label="Edit Alert props"/);
  assert.doesNotMatch(markup, /aria-label="Delete Alert"/);
});

test("MdxComponentNodeFrame applies selected styles when selected", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentNodeFrame, {
      componentName: "Banner",
      isVoid: true,
      propsSummary: "",
      selected: true,
      previewState: "empty",
    }),
  );

  assert.match(markup, /border-l-primary bg-accent-subtle/);
});

test("MdxComponentNodeFrame applies unselected styles when not selected", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentNodeFrame, {
      componentName: "Banner",
      isVoid: true,
      propsSummary: "",
      selected: false,
      previewState: "empty",
    }),
  );

  assert.match(markup, /border-l-primary\/20/);
  assert.doesNotMatch(markup, /bg-accent-subtle/);
});
