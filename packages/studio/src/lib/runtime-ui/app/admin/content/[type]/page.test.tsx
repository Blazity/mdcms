import assert from "node:assert/strict";

import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getContentTypeTableColumns,
  TranslationCoverageSummary,
} from "./page.js";

test("TranslationCoverageSummary renders nothing for the idle state", () => {
  const markup = renderToStaticMarkup(
    createElement(TranslationCoverageSummary, {
      status: "idle",
    }),
  );

  assert.equal(markup, "");
  assert.doesNotMatch(markup, /data-mdcms-translation-coverage-state/);
  assert.doesNotMatch(markup, /Loading/i);
  assert.doesNotMatch(markup, /Translation status unavailable/i);
});

test("TranslationCoverageSummary renders the loading state deterministically", () => {
  const markup = renderToStaticMarkup(
    createElement(TranslationCoverageSummary, {
      status: "loading",
    }),
  );

  assert.match(markup, /data-mdcms-translation-coverage-state="loading"/);
  assert.match(markup, /Loading locale coverage/i);
});

test("TranslationCoverageSummary renders the translated locale count", () => {
  const markup = renderToStaticMarkup(
    createElement(TranslationCoverageSummary, {
      status: "ready",
      coverage: {
        translatedLocales: 2,
        totalLocales: 4,
      },
    }),
  );

  assert.match(markup, /data-mdcms-translation-coverage-state="ready"/);
  assert.match(markup, /2\/4 locales translated/);
});

test("TranslationCoverageSummary renders an error fallback when coverage is unavailable", () => {
  const markup = renderToStaticMarkup(
    createElement(TranslationCoverageSummary, {
      status: "error",
    }),
  );

  assert.match(markup, /data-mdcms-translation-coverage-state="error"/);
  assert.match(markup, /Translation status unavailable/i);
});

test("content type table adds a dedicated Translations column for localized lists", () => {
  assert.deepEqual(
    getContentTypeTableColumns(true).map((column) => column.label),
    ["Title / Path", "Translations", "Status", "Updated", "Author", ""],
  );
});

test("content type table keeps the original columns for non-localized lists", () => {
  assert.deepEqual(
    getContentTypeTableColumns(false).map((column) => column.label),
    ["Title / Path", "Status", "Updated", "Author", ""],
  );
});
