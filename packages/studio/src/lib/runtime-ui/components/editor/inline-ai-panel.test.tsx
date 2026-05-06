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

test("InlineAiPanel renders the 6 selection-anchored copy edits", () => {
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
  ]) {
    assert.match(
      markup,
      new RegExp(`data-testid="inline-ai-action-${id}"`),
      `expected action ${id} to render`,
    );
  }
  // Frontmatter and MDX-insertion actions are intentionally absent —
  // SPEC-014 routes those through the properties panel and slash menu.
  assert.doesNotMatch(markup, /inline-ai-action-improve_seo/);
  assert.doesNotMatch(markup, /inline-ai-action-insert_mdx_component/);
  // Generate is the panel CTA wording; "Ask AI" is intentionally
  // avoided because the action edits selected text rather than asking
  // a question.
  assert.match(markup, />Generate</);
  assert.doesNotMatch(markup, />Ask AI</);
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
