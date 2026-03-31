import assert from "node:assert/strict";

import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StudioMountContext } from "@mdcms/shared";
import {
  createStudioSchemaLoadingState,
  type StudioSchemaReadyState,
  type StudioSchemaState,
} from "../../../schema-state.js";
import { SchemaPageView, createSchemaPageLoadInput } from "./schema-page.js";

function createReadyState(
  overrides: Partial<StudioSchemaReadyState> = {},
): StudioSchemaReadyState {
  return {
    status: "ready",
    project: "marketing-site",
    environment: "staging",
    localSchemaHash: "local-hash",
    serverSchemaHash: "server-hash",
    isMismatch: false,
    canSync: false,
    entries: [],
    reload: async () => createReadyState(),
    sync: async () => createReadyState(),
    ...overrides,
  };
}

function renderMarkup(state: StudioSchemaState): string {
  return renderToStaticMarkup(
    createElement(SchemaPageView, {
      state,
    }),
  );
}

test("createSchemaPageLoadInput maps the mounted project and environment", () => {
  const context: StudioMountContext = {
    apiBaseUrl: "https://cms.example.com",
    basePath: "/admin",
    auth: { mode: "token", token: "mdcms_key_test" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: false,
        message: "Schema sync required before Studio can write drafts.",
      },
    },
  };

  assert.deepEqual(createSchemaPageLoadInput(context), {
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "https://cms.example.com",
    },
    auth: { mode: "token", token: "mdcms_key_test" },
  });
});

test("SchemaPageView renders the loading state deterministically", () => {
  const markup = renderMarkup(createStudioSchemaLoadingState());

  assert.match(markup, /data-mdcms-schema-page-state="loading"/);
  assert.match(markup, /Loading schema state/i);
  assert.match(markup, /Schema/i);
});

test("SchemaPageView renders an empty read-only browser state", () => {
  const markup = renderMarkup(createReadyState());

  assert.match(markup, /data-mdcms-schema-page-state="empty"/);
  assert.match(markup, /No schema entries/i);
  assert.match(markup, /marketing-site/);
  assert.match(markup, /staging/);
});

test("SchemaPageView renders live schema entries with simple constraint metadata", () => {
  const markup = renderMarkup(
    createReadyState({
      entries: [
        {
          type: "BlogPost",
          directory: "content/blog",
          localized: true,
          schemaHash: "server-hash",
          syncedAt: "2026-03-31T12:00:00.000Z",
          resolvedSchema: {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
            fields: {
              author: {
                kind: "string",
                required: true,
                nullable: false,
                reference: {
                  targetType: "Author",
                },
              },
              status: {
                kind: "enum",
                required: true,
                nullable: false,
                options: ["draft", "published"],
                checks: [
                  {
                    kind: "enum",
                    values: ["draft", "published"],
                  },
                ],
              },
              tags: {
                kind: "array",
                required: false,
                nullable: false,
                default: [],
                item: {
                  kind: "string",
                  required: true,
                  nullable: false,
                },
              },
            },
          },
        },
      ],
    }),
  );

  assert.match(markup, /data-mdcms-schema-page-state="ready"/);
  assert.match(markup, /data-mdcms-schema-entry-type="BlogPost"/);
  assert.match(markup, /content\/blog/);
  assert.match(markup, /Localized/);
  assert.match(markup, /data-mdcms-schema-field-name="author"/);
  assert.match(markup, /data-mdcms-schema-field-kind="string"/);
  assert.match(markup, /reference: Author/);
  assert.match(markup, /data-mdcms-schema-field-name="status"/);
  assert.match(markup, /options: draft, published/);
  assert.match(markup, /checks: 1/);
  assert.match(markup, /data-mdcms-schema-field-name="tags"/);
  assert.match(markup, /default: \[\]/);
  assert.match(markup, /item: string/);
  assert.doesNotMatch(markup, /Schema Builder/);
  assert.doesNotMatch(markup, /edit/i);
});

test("SchemaPageView renders forbidden and error states", () => {
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
    message: "Failed to load schema state.",
  });

  assert.match(forbiddenMarkup, /data-mdcms-schema-page-state="forbidden"/);
  assert.match(forbiddenMarkup, /Forbidden\./);
  assert.match(errorMarkup, /data-mdcms-schema-page-state="error"/);
  assert.match(errorMarkup, /Failed to load schema state\./);
});
