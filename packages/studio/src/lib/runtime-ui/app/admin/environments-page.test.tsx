import assert from "node:assert/strict";

import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EnvironmentSummary } from "@mdcms/shared";

import {
  EnvironmentManagementPageView,
  type EnvironmentManagementState,
} from "./environments-page.js";

function createEnvironmentSummary(
  overrides: Partial<EnvironmentSummary> = {},
): EnvironmentSummary {
  return {
    id: "env-production",
    project: "marketing-site",
    name: "production",
    extends: null,
    isDefault: true,
    createdAt: "2026-03-19T10:00:00.000Z",
    ...overrides,
  };
}

function renderMarkup(state: EnvironmentManagementState): string {
  return renderToStaticMarkup(
    createElement(EnvironmentManagementPageView, {
      state,
    }),
  );
}

test("EnvironmentManagementPageView renders loading and empty states deterministically", () => {
  const loadingMarkup = renderMarkup({
    status: "loading",
    project: "marketing-site",
    message: "Loading environments.",
  });
  const emptyMarkup = renderMarkup({
    status: "ready",
    project: "marketing-site",
    environments: [],
  });

  assert.match(loadingMarkup, /data-mdcms-environments-page-state="loading"/);
  assert.match(loadingMarkup, /Loading environments/i);
  assert.match(emptyMarkup, /data-mdcms-environments-page-state="empty"/);
  assert.match(emptyMarkup, /No environments were returned/i);
  assert.match(emptyMarkup, /New Environment/);
});

test("EnvironmentManagementPageView renders live environment summaries and only allows deleting non-default environments", () => {
  const markup = renderMarkup({
    status: "ready",
    project: "marketing-site",
    environments: [
      createEnvironmentSummary({
        createdAt: "2026-03-19T10:00:00.000Z",
      }),
      createEnvironmentSummary({
        id: "env-staging",
        name: "staging",
        extends: "production",
        isDefault: false,
        createdAt: "2026-03-20T11:30:45.000Z",
      }),
    ],
  });

  assert.match(markup, /data-mdcms-environments-page-state="ready"/);
  assert.match(markup, /data-mdcms-environment-row="production"/);
  assert.match(markup, /data-mdcms-environment-row="staging"/);
  assert.match(markup, />Default</);
  assert.match(markup, /Extends production/);
  assert.match(markup, /2026-03-19T10:00:00.000Z/);
  assert.match(markup, /2026-03-20T11:30:45.000Z/);
  assert.match(markup, /Delete staging/);
  assert.doesNotMatch(markup, /Delete production/);
  assert.doesNotMatch(markup, /promot/i);
  assert.doesNotMatch(markup, /document count/i);
});

test("EnvironmentManagementPageView renders forbidden and error states", () => {
  const forbiddenMarkup = renderMarkup({
    status: "forbidden",
    project: "marketing-site",
    message: "Forbidden.",
  });
  const errorMarkup = renderMarkup({
    status: "error",
    project: "marketing-site",
    message: "Environment request failed.",
  });

  assert.match(
    forbiddenMarkup,
    /data-mdcms-environments-page-state="forbidden"/,
  );
  assert.match(errorMarkup, /data-mdcms-environments-page-state="error"/);
});
