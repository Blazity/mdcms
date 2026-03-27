import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StudioMountContext } from "@mdcms/shared";

import { MdxComponentPicker } from "./mdx-component-picker.js";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

const components: MdxCatalogComponent[] = [
  {
    name: "Callout",
    importPath: "@/components/mdx/Callout",
    description: "A wrapper callout",
    extractedProps: {
      children: { type: "rich-text", required: false },
    },
  },
  {
    name: "HeroBanner",
    importPath: "@/components/mdx/HeroBanner",
    description: "A hero banner",
    extractedProps: {
      title: { type: "string", required: true },
    },
  },
];

test("MdxComponentPicker renders catalog components with kind badges", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentPicker, {
      components,
      onSelect: () => {},
    }),
  );

  assert.match(markup, /data-mdcms-mdx-picker-item="Callout"/);
  assert.match(markup, /data-mdcms-mdx-picker-item="HeroBanner"/);
  assert.match(markup, />Wrapper</);
  assert.match(markup, />Void</);
});

test("MdxComponentPicker filters components by query", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxComponentPicker, {
      components,
      query: "hero",
      onSelect: () => {},
    }),
  );

  assert.doesNotMatch(markup, /data-mdcms-mdx-picker-item="Callout"/);
  assert.match(markup, /data-mdcms-mdx-picker-item="HeroBanner"/);
});

test("MdxComponentPicker renders empty and forbidden states deterministically", () => {
  const emptyMarkup = renderToStaticMarkup(
    createElement(MdxComponentPicker, {
      components: [],
      onSelect: () => {},
    }),
  );
  const forbiddenMarkup = renderToStaticMarkup(
    createElement(MdxComponentPicker, {
      components,
      forbidden: true,
      onSelect: () => {},
    }),
  );

  assert.match(emptyMarkup, /data-mdcms-mdx-picker-state="empty"/);
  assert.match(forbiddenMarkup, /data-mdcms-mdx-picker-state="forbidden"/);
  assert.match(forbiddenMarkup, /disabled=""/);
});
