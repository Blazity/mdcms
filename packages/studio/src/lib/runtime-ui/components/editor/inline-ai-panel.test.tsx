import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StudioAiRouteApi } from "../../../ai-route-api.js";
import { InlineAiPanel } from "./inline-ai-panel.js";

function noopApi(): StudioAiRouteApi {
  return {
    inlineTransform: async () => {
      throw new Error("not used in render test");
    },
    applyProposal: async () => {
      throw new Error("not used in render test");
    },
    rejectProposal: async () => {
      throw new Error("not used in render test");
    },
  };
}

test("InlineAiPanel renders all 8 inline actions for selection-aware tasks", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      api: noopApi(),
      options: {
        documentId: "doc_1",
        draftRevision: 4,
        schemaHash: "h_1",
      },
      selection: { id: "sel_1", text: "Welcome to the site." },
    }),
  );

  for (const id of [
    "rewrite",
    "shorten",
    "expand",
    "change_tone",
    "fix_grammar",
    "improve_clarity",
    "improve_seo",
    "insert_mdx_component",
  ]) {
    assert.match(
      markup,
      new RegExp(`data-testid="inline-ai-action-${id}"`),
      `expected action ${id} to render`,
    );
  }
  assert.match(markup, /Ask AI/);
});

test("InlineAiPanel hints to select content when selection is missing", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      api: noopApi(),
      options: {
        documentId: "doc_1",
        draftRevision: 4,
        schemaHash: "h_1",
      },
      selection: null,
    }),
  );

  assert.match(markup, /Select editor text first/);
});
