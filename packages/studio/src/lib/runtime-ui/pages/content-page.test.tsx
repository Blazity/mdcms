import assert from "node:assert/strict";

import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  StudioContentOverviewState,
  StudioContentOverviewReadyState,
} from "../../content-overview-state.js";
import { StudioMountInfoProvider } from "../app/admin/mount-info-context.js";
import { StudioSessionProvider } from "../app/admin/session-context.js";
import { StudioNavigationProvider } from "../navigation.js";
import { ThemeProvider } from "../adapters/next-themes.js";
import { ContentPageView } from "./content-page.js";

function createReadyState(
  overrides: Partial<StudioContentOverviewReadyState> = {},
): StudioContentOverviewReadyState {
  return {
    status: "ready",
    project: "marketing-site",
    environment: "staging",
    entries: [
      {
        type: "BlogPost",
        directory: "content/blog",
        localized: true,
        locales: ["en-US", "fr"],
        canNavigate: true,
        metrics: [
          { id: "documents", label: "Documents", value: 7 },
          { id: "published", label: "Published", value: 5 },
          { id: "withDrafts", label: "With drafts", value: 2 },
        ],
      },
    ],
    ...overrides,
  };
}

function renderMarkup(
  state: StudioContentOverviewState,
  options?: { basePath?: string },
): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      null,
      createElement(
        StudioSessionProvider,
        {
          value: { status: "unauthenticated" },
        },
        createElement(
          StudioMountInfoProvider,
          {
            value: {
              project: "marketing-site",
              environment: "staging",
              setProject: () => {},
              setEnvironment: () => {},
              apiBaseUrl: "http://localhost:4000",
              auth: { mode: "cookie" },
              environments: [],
              hostBridge: null,
            },
          },
          createElement(
            StudioNavigationProvider,
            {
              value: {
                pathname: "/content",
                params: {},
                basePath: options?.basePath ?? "/admin",
                push: () => {},
                replace: () => {},
                back: () => {},
              },
            },
            createElement(ContentPageView, { state }),
          ),
        ),
      ),
    ),
  );
}

test("ContentPageView renders loading and empty states deterministically", () => {
  const loadingMarkup = renderMarkup({
    status: "loading",
    message: "Loading content overview.",
  });
  const emptyMarkup = renderMarkup(createReadyState({ entries: [] }));

  assert.match(loadingMarkup, /class="min-h-screen"/);
  assert.match(loadingMarkup, />Content</);
  assert.match(loadingMarkup, /data-mdcms-content-page-state="loading"/);
  assert.match(loadingMarkup, /data-slot="skeleton"/);
  assert.match(emptyMarkup, /data-mdcms-content-page-state="empty"/);
  assert.match(emptyMarkup, /No schema types were returned/);
});

test("ContentPageView renders populated live overview cards with subtitle, compact stats, and locale badges", () => {
  const markup = renderMarkup(
    createReadyState({
      entries: [
        {
          type: "BlogPost",
          directory: "content/blog",
          localized: true,
          locales: ["en-US", "fr", "de", "ja"],
          canNavigate: true,
          metrics: [
            { id: "documents", label: "Documents", value: 7 },
            { id: "published", label: "Published", value: 5 },
            { id: "withDrafts", label: "With drafts", value: 2 },
          ],
        },
        {
          type: "Author",
          directory: "content/authors",
          localized: false,
          canNavigate: true,
          metrics: [
            { id: "documents", label: "Documents", value: 3 },
            { id: "published", label: "Published", value: 3 },
            { id: "withDrafts", label: "With drafts", value: 0 },
          ],
        },
      ],
    }),
  );

  assert.match(markup, /data-mdcms-content-page-state="ready"/);
  assert.match(markup, /data-mdcms-content-card-type="BlogPost"/);
  assert.match(markup, /Browse and manage your content by type/);
  assert.match(markup, />Localized</);
  assert.match(markup, /en-US, fr, de, ja/);
  assert.match(markup, />Single locale</);
  assert.match(markup, /7.*total/);
  assert.match(markup, /5.*published/);
  assert.match(markup, /2.*drafts/);
  assert.match(markup, /href="\/admin\/content\/BlogPost"/);
});

test("ContentPageView uses the configured Studio base path for card navigation", () => {
  const markup = renderMarkup(createReadyState(), {
    basePath: "/review/editor/admin",
  });

  assert.match(markup, /href="\/review\/editor\/admin\/content\/BlogPost"/);
});

test("ContentPageView renders permission-constrained cards with disabled navigation", () => {
  const markup = renderMarkup({
    status: "permission-constrained",
    project: "marketing-site",
    environment: "staging",
    message:
      "You can inspect schema types here, but you do not have permission to read content counts.",
    entries: [
      {
        type: "BlogPost",
        directory: "content/blog",
        localized: true,
        locales: ["en-US", "fr"],
        canNavigate: false,
        metrics: [],
      },
    ],
  });

  assert.match(
    markup,
    /data-mdcms-content-page-state="permission-constrained"/,
  );
  assert.match(markup, /do not have permission to read content counts/i);
  assert.match(markup, /en-US, fr/);
  assert.match(markup, /data-mdcms-content-card-disabled="true"/);
  assert.doesNotMatch(markup, /href="\/admin\/content\/BlogPost"/);
});

test("ContentPageView renders forbidden and error states", () => {
  const forbiddenMarkup = renderMarkup({
    status: "forbidden",
    project: "marketing-site",
    environment: "staging",
    message: "Forbidden.",
  });
  const errorMarkup = renderMarkup({
    status: "error",
    project: "marketing-site",
    environment: "staging",
    message: "Content overview failed.",
  });

  assert.match(forbiddenMarkup, /data-mdcms-content-page-state="forbidden"/);
  assert.match(errorMarkup, /data-mdcms-content-page-state="error"/);
});
