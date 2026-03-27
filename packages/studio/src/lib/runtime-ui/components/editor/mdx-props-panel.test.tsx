import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StudioMountContext } from "@mdcms/shared";

import {
  MdxPropsPanel,
  type MdxPropsPanelSelection,
} from "./mdx-props-panel.js";

function createContext(): StudioMountContext {
  return {
    apiBaseUrl: "http://localhost:4000",
    basePath: "/admin",
    auth: { mode: "cookie" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
    mdx: {
      catalog: {
        components: [
          {
            name: "HeroBanner",
            importPath: "@/components/mdx/HeroBanner",
            description: "A hero banner",
            extractedProps: {
              title: { type: "string", required: true },
            },
          },
        ],
      },
      resolvePropsEditor: async () => null,
    },
  };
}

function createSelection(
  overrides: Partial<MdxPropsPanelSelection> = {},
): MdxPropsPanelSelection {
  const component = createContext().mdx!.catalog.components[0]!;

  return {
    component,
    componentName: component.name,
    isVoid: true,
    props: { title: "Launch" },
    readOnly: false,
    forbidden: false,
    onPropsChange: () => {},
    ...overrides,
  };
}

test("MdxPropsPanel renders an idle state until an MDX component node is selected", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxPropsPanel, {
      context: createContext(),
      selection: null,
    }),
  );

  assert.match(markup, /data-mdcms-mdx-props-panel="idle"/);
  assert.match(markup, /Select an MDX component block/);
});

test("MdxPropsPanel renders the selected component instead of an arbitrary catalog chooser", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxPropsPanel, {
      context: createContext(),
      selection: createSelection(),
    }),
  );

  assert.match(markup, /data-mdcms-mdx-props-panel="HeroBanner"/);
  assert.match(markup, /Selected component/);
  assert.match(markup, /data-mdcms-mdx-auto-form="HeroBanner"/);
});

test("MdxPropsPanel renders an unresolved state when the selected component is missing from the local catalog", () => {
  const markup = renderToStaticMarkup(
    createElement(MdxPropsPanel, {
      context: createContext(),
      selection: createSelection({
        component: undefined,
        componentName: "UnknownWidget",
      }),
    }),
  );

  assert.match(markup, /data-mdcms-mdx-props-panel="unregistered"/);
  assert.match(markup, /UnknownWidget/);
});
