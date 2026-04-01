import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StudioNavigationProvider } from "../../navigation.js";
import { AppSidebar } from "./app-sidebar.js";

function renderSidebar(canReadSchema: boolean): string {
  return renderToStaticMarkup(
    createElement(
      StudioNavigationProvider,
      {
        value: {
          pathname: "/admin",
          params: {},
          push: () => {},
          replace: () => {},
          back: () => {},
        },
      },
      createElement(AppSidebar, {
        canReadSchema,
        collapsed: false,
        onToggle: () => {},
      }),
    ),
  );
}

test("AppSidebar shows the Schema route when schema.read is allowed", () => {
  const markup = renderSidebar(true);

  assert.match(markup, /href="\/admin\/schema"/);
});

test("AppSidebar hides the Schema route when schema.read is not allowed", () => {
  const markup = renderSidebar(false);

  assert.doesNotMatch(markup, /href="\/admin\/schema"/);
});
