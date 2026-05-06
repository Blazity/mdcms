import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { UseInlineAiTransformResult } from "../../hooks/use-inline-ai-transform.js";
import { InlineAiPanel } from "./inline-ai-panel.js";

function idleTransform(): UseInlineAiTransformResult {
  return {
    state: { status: "idle" },
    request: async () => {},
    accept: async () => {},
    reject: async () => {},
    reset: () => {},
  };
}

test("InlineAiPanel renders the 6 selection-anchored copy edits", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      transform: idleTransform(),
      hasSelection: true,
      activeAction: "rewrite",
      onActiveActionChange: () => {},
      detail: "",
      onDetailChange: () => {},
      onSubmit: () => {},
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
      transform: idleTransform(),
      hasSelection: false,
      activeAction: "rewrite",
      onActiveActionChange: () => {},
      detail: "",
      onDetailChange: () => {},
      onSubmit: () => {},
    }),
  );

  assert.match(markup, /Select editor text first/);
});

test("InlineAiPanel hides the proposal preview when hideProposalResult is set", () => {
  const proposal = {
    proposalId: "p_1",
    kind: "replace_selection" as const,
    project: "demo",
    environment: "draft",
    documentId: "doc_1",
    baseDraftRevision: 4,
    type: "post",
    locale: "en",
    summary: "Tighter intro.",
    operations: [
      {
        op: "replace_selection" as const,
        selectionId: "sel_1",
        originalText: "Hello",
        replacementText: "Hi.",
      },
    ],
    validation: { status: "valid" as const },
    expiresAt: "2026-05-01T00:05:00.000Z",
    provider: {
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "copy_improvement.v1",
    },
  };

  const transform: UseInlineAiTransformResult = {
    state: {
      status: "proposal",
      proposal,
      intent: { action: "rewrite" },
    },
    request: async () => {},
    accept: async () => {},
    reject: async () => {},
    reset: () => {},
  };

  const masked = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      transform,
      hasSelection: true,
      activeAction: "rewrite",
      onActiveActionChange: () => {},
      detail: "",
      onDetailChange: () => {},
      onSubmit: () => {},
      hideProposalResult: true,
    }),
  );

  assert.doesNotMatch(masked, /Tighter intro/);
  assert.doesNotMatch(masked, /Proposed replacement/);

  const visible = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      transform,
      hasSelection: true,
      activeAction: "rewrite",
      onActiveActionChange: () => {},
      detail: "",
      onDetailChange: () => {},
      onSubmit: () => {},
    }),
  );

  assert.match(visible, /Tighter intro/);
});
