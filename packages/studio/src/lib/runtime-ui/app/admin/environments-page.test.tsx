import assert from "node:assert/strict";

import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RuntimeError, type EnvironmentSummary } from "@mdcms/shared";

import { ThemeProvider } from "../../adapters/next-themes.js";
import { StudioMountInfoProvider } from "./mount-info-context.js";
import { StudioSessionProvider } from "./session-context.js";
import {
  EnvironmentManagementPageView,
  type EnvironmentManagementState,
  resolveDeleteFailureState,
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

function renderMarkup(
  state: EnvironmentManagementState,
  props: Partial<Parameters<typeof EnvironmentManagementPageView>[0]> = {},
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
              setEnvironment: () => {},
              apiBaseUrl: "http://localhost:4000",
              auth: { mode: "cookie" },
              environments: [],
              hostBridge: null,
            },
          },
          createElement(EnvironmentManagementPageView, {
            state,
            ...props,
          }),
        ),
      ),
    ),
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

  assert.match(loadingMarkup, /class="min-h-screen"/);
  assert.match(loadingMarkup, /sticky top-0/);
  assert.match(loadingMarkup, /p-6 space-y-6/);
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

test("EnvironmentManagementPageView keeps delete conflicts inside the modal", () => {
  const markup = renderMarkup(
    {
      status: "ready",
      project: "marketing-site",
      environments: [
        createEnvironmentSummary(),
        createEnvironmentSummary({
          id: "env-staging",
          name: "staging",
          extends: "production",
          isDefault: false,
        }),
      ],
    },
    {
      deleteTarget: createEnvironmentSummary({
        id: "env-staging",
        name: "staging",
        extends: "production",
        isDefault: false,
      }),
      deleteError:
        'Environment "staging" cannot be deleted while content or schema state still exists.',
    },
  );

  assert.match(markup, /data-mdcms-delete-error/);
  assert.match(markup, /Delete Environment/);
  assert.match(
    markup,
    /Environment &quot;staging&quot; cannot be deleted while content or schema state still exists\./,
  );
  assert.doesNotMatch(markup, /data-mdcms-page-action-error/);
});

test("resolveDeleteFailureState reloads after not-found delete failures", () => {
  const notFound = resolveDeleteFailureState(
    new RuntimeError({
      code: "NOT_FOUND",
      message: "Environment not found.",
      statusCode: 404,
    }),
  );
  const conflict = resolveDeleteFailureState(
    new RuntimeError({
      code: "CONFLICT",
      message: "Environment is not empty.",
      statusCode: 409,
    }),
  );

  assert.deepEqual(notFound, {
    message: "Environment not found.",
    shouldCloseDialog: true,
    shouldReload: true,
    renderInDialog: false,
  });
  assert.deepEqual(conflict, {
    message: "Environment is not empty.",
    shouldCloseDialog: false,
    shouldReload: false,
    renderInDialog: true,
  });
});
