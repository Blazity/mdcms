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
    assert.ok(
      markup.includes(`data-testid="inline-ai-action-${id}"`),
      `expected action ${id} to render`,
    );
  }
  // Frontmatter and MDX-insertion actions are intentionally absent —
  // SPEC-014 routes those through the properties panel and slash menu.
  assert.doesNotMatch(markup, /inline-ai-action-improve_seo/);
  assert.doesNotMatch(markup, /inline-ai-action-insert_mdx_component/);

  // The Option-A picker fires actions on click and has no Generate
  // CTA or detail textarea — guard against accidental regressions.
  assert.doesNotMatch(markup, />Generate</);
  assert.doesNotMatch(markup, />Ask AI</);
  assert.doesNotMatch(markup, /<input/i);
  assert.doesNotMatch(markup, /<textarea/i);

  // Eyebrow header reads as a system label, not a CTA.
  assert.match(markup, /AI · edit selection/);
});

test("InlineAiPanel hints to select content when selection is missing", () => {
  const markup = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      transform: idleTransform(),
      hasSelection: false,
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
      onSubmit: () => {},
      hideProposalResult: true,
    }),
  );

  // With hideProposalResult set, the in-popover proposal view is
  // suppressed (the editor renders it inline) and the action list
  // is shown instead.
  assert.doesNotMatch(masked, /Proposed/);
  assert.match(masked, /data-testid="inline-ai-action-rewrite"/);

  const visible = renderToStaticMarkup(
    createElement(InlineAiPanel, {
      transform,
      hasSelection: true,
      onSubmit: () => {},
    }),
  );

  assert.match(visible, /Proposal ready/);
});
