import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StudioNavigationProvider } from "../../navigation.js";
import { AppSidebar } from "./app-sidebar.js";

function renderSidebar(input?: {
  canReadSchema?: boolean;
  pathname?: string;
  basePath?: string;
}): string {
  return renderToStaticMarkup(
    createElement(
      StudioNavigationProvider,
      {
        value: {
          pathname: input?.pathname ?? "/admin",
          params: {},
          basePath: input?.basePath,
          push: () => {},
          replace: () => {},
          back: () => {},
        },
      },
      createElement(AppSidebar, {
        canReadSchema: input?.canReadSchema ?? true,
        collapsed: false,
        onToggle: () => {},
      }),
    ),
  );
}

test("AppSidebar shows the Schema route when schema.read is allowed", () => {
  const markup = renderSidebar({
    canReadSchema: true,
  });

  assert.match(markup, /href="\/admin\/schema"/);
});

test("AppSidebar hides the Schema route when schema.read is not allowed", () => {
  const markup = renderSidebar({
    canReadSchema: false,
  });

  assert.doesNotMatch(markup, /href="\/admin\/schema"/);
});

test("AppSidebar keeps review deployment links scoped to the active scenario base path", () => {
  const markup = renderSidebar({
    canReadSchema: true,
    pathname: "/review/editor/admin/schema",
    basePath: "/review/editor/admin",
  });

  assert.match(markup, /href="\/review\/editor\/admin\/schema"/);
  assert.doesNotMatch(markup, /href="\/admin\/schema"/);
  assert.match(markup, /bg-accent-subtle/);
});
