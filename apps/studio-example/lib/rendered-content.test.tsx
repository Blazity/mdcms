import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RenderedContent } from "./rendered-content";

test("RenderedContent renders markdown blocks as document markup", () => {
  const markup = renderToStaticMarkup(
    <RenderedContent
      body={"# Hello MDCMS\n\nThis is **rendered** content.\n\n- one\n- two"}
    />,
  );

  assert.match(markup, /<h1>Hello MDCMS<\/h1>/);
  assert.match(markup, /<strong>rendered<\/strong>/);
  assert.match(markup, /<ul>/);
  assert.match(markup, /<li>one<\/li>/);
});

test("RenderedContent renders registered MDX demo components", () => {
  const markup = renderToStaticMarkup(
    <RenderedContent
      body={
        '# Component demo\n\n<Chart title="Preview chart" color="#16a34a" />\n\n<Callout tone="warning" title="Heads up">Nested content</Callout>'
      }
    />,
  );

  assert.match(markup, /Preview chart/);
  assert.match(markup, /Embedded chart/);
  assert.match(markup, /Heads up/);
  assert.match(markup, /Nested content/);
});
