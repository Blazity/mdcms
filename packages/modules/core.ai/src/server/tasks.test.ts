import assert from "node:assert/strict";
import { test } from "bun:test";

import { buildChatSystemPrompt, buildChatUserPrompt } from "./tasks.js";

test("buildChatUserPrompt includes the active draft body and frontmatter", () => {
  const prompt = buildChatUserPrompt({
    message: "Delete the performance benchmarks section",
    locale: "en",
    activeDocument: {
      path: "posts/releases/mdcms-milestone-2-0-technical.md",
      type: "post",
      locale: "en",
      body: "## Performance Benchmarks\n\n- Build Time: Reduced from 3 min 45 s.",
      frontmatter: { title: "MDCMS Milestone 2.0" },
    },
  });

  assert.match(prompt, /Active draft:/);
  assert.match(prompt, /Active draft body:/);
  assert.match(prompt, /## Performance Benchmarks/);
  assert.match(prompt, /Active draft frontmatter:/);
  assert.match(prompt, /MDCMS Milestone 2\.0/);
});

test("buildChatUserPrompt renders referenced documents as compact fetchable cards", () => {
  const prompt = buildChatUserPrompt({
    message: "Use the related article as context",
    locale: "en",
    activeDocument: {
      path: "posts/releases/current.md",
      type: "post",
      locale: "en",
      body: "Current draft body.",
      frontmatter: { title: "Current" },
    },
    additionalContextDocs: [
      {
        documentId: "doc_related",
        path: "posts/releases/related.md",
        type: "post",
        locale: "en",
        draftRevision: 12,
        frontmatter: {
          title: "Related Article",
          description: "Useful background",
          internalNotes: "do not include all frontmatter",
        },
        body: [
          "# Related Article",
          "",
          "Opening context that is useful enough for a short excerpt.",
          "",
          "## Background",
          "",
          "Relevant body text.",
          "",
          "## Migration Notes",
          "",
          "More details.",
          "",
          "FULL_BODY_SENTINEL_THIS_SHOULD_NOT_BE_INCLUDED",
        ].join("\n"),
      } as never,
    ],
  });

  assert.match(prompt, /Referenced documents \(read-only context cards\):/);
  assert.match(prompt, /documentId: doc_related/);
  assert.match(prompt, /draftRevision: 12/);
  assert.match(prompt, /title: Related Article/);
  assert.match(prompt, /description: Useful background/);
  assert.match(
    prompt,
    /Headings: Related Article > Background > Migration Notes/,
  );
  assert.match(prompt, /Use get_entry\(\{ documentId \}\)/);
  assert.doesNotMatch(prompt, /FULL_BODY_SENTINEL_THIS_SHOULD_NOT_BE_INCLUDED/);
  assert.doesNotMatch(prompt, /internalNotes/);
});

test("buildChatSystemPrompt allows bounded document lookup tools when registered", () => {
  const prompt = buildChatSystemPrompt({
    hasActiveDocument: true,
    hasAttachedSelection: false,
    capabilities: {
      canEditDocument: true,
      canCreateDocument: true,
      canDeleteDocument: false,
    },
    registeredToolNames: ["find_entries", "get_entry"],
    projectKnowledge: {
      project: "demo",
      environment: "draft",
      registeredTypes: [],
      supportedLocales: ["en"],
    },
  });

  assert.match(prompt, /find_entries/);
  assert.match(prompt, /get_entry/);
  assert.doesNotMatch(prompt, /no such tool yet/);
  assert.match(prompt, /Unbounded autonomous crawling/);
});
