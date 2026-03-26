import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Callout } from "./components/mdx/Callout";
import { Chart } from "./components/mdx/Chart";
import config from "./mdcms.config";

test("studio-example registers the expected demo MDX components", async () => {
  assert.ok(Array.isArray(config.components));

  const names = config.components.map((component) => component.name);
  assert.deepEqual(names, ["Chart", "Callout", "PricingTable"]);

  const chart = config.components[0];
  const callout = config.components[1];
  const pricingTable = config.components[2];

  assert.equal(chart?.importPath, "./components/mdx/Chart");
  assert.equal(callout?.importPath, "./components/mdx/Callout");
  assert.equal(pricingTable?.importPath, "./components/mdx/PricingTable");

  assert.equal(chart?.propHints?.color?.widget, "color-picker");
  assert.equal(typeof chart?.load, "function");
  assert.equal(typeof callout?.load, "function");
  assert.equal(
    pricingTable?.propsEditor,
    "./components/mdx/PricingTable.editor",
  );
  assert.equal(typeof pricingTable?.load, "function");
  assert.equal(typeof pricingTable?.loadPropsEditor, "function");

  const chartPreview = await chart?.load?.();
  const pricingEditor = await pricingTable?.loadPropsEditor?.();

  assert.ok(chartPreview);
  assert.ok(pricingEditor);
});

test("demo MDX components tolerate empty preview props during insertion", () => {
  const chartMarkup = renderToStaticMarkup(createElement(Chart, {} as never));
  const calloutMarkup = renderToStaticMarkup(
    createElement(Callout, {} as never),
  );

  assert.match(chartMarkup, /Quarterly momentum/);
  assert.match(calloutMarkup, /Important update/);
  assert.match(calloutMarkup, /info/);
});
