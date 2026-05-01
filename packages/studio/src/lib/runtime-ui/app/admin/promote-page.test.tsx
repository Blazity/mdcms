import assert from "node:assert/strict";

import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ThemeProvider } from "../../adapters/next-themes.js";
import { StudioMountInfoProvider } from "./mount-info-context.js";
import { StudioSessionProvider } from "./session-context.js";
import PromotePage from "./promote-page.js";

function renderPromote(): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      null,
      createElement(
        StudioSessionProvider,
        { value: { status: "unauthenticated" } },
        createElement(
          StudioMountInfoProvider,
          {
            value: {
              project: "marketing-site",
              environment: "production",
              setEnvironment: () => {},
              apiBaseUrl: "http://localhost:4000",
              auth: { mode: "cookie" },
              environments: [],
              hostBridge: null,
            },
          },
          createElement(PromotePage),
        ),
      ),
    ),
  );
}

test("PromotePage renders the page header and explicit-overwrite warning", () => {
  const markup = renderPromote();

  // Page chrome (breadcrumb + title).
  assert.match(markup, /Promote content/);
  // Per SPEC-009, the page must surface the no-merge / explicit-overwrite
  // semantics so operators understand promote replaces target content.
  assert.match(markup, /target content is replaced/i);
  assert.match(markup, /atomically/);
});

test("PromotePage renders without an active project as missing-route", () => {
  const markup = renderToStaticMarkup(
    createElement(
      ThemeProvider,
      null,
      createElement(
        StudioSessionProvider,
        { value: { status: "unauthenticated" } },
        createElement(
          StudioMountInfoProvider,
          {
            value: {
              project: null,
              environment: null,
              setEnvironment: () => {},
              apiBaseUrl: "http://localhost:4000",
              auth: { mode: "cookie" },
              environments: [],
              hostBridge: null,
            },
          },
          createElement(PromotePage),
        ),
      ),
    ),
  );

  // Without a project the page must show the missing-route message —
  // not the loading state, which only happens *after* the route check
  // passes. A loose regex would let a regression that breaks the
  // missing-route branch quietly pass.
  assert.match(markup, /requires an active project/i);
  assert.doesNotMatch(markup, /Loading environments/i);
});
