import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { renderProjectKnowledgeBlock } from "./project-knowledge.js";

describe("renderProjectKnowledgeBlock", () => {
  test("renders the header even when types and locales are empty", () => {
    const block = renderProjectKnowledgeBlock({
      project: "marketing-site",
      environment: "staging",
      registeredTypes: [],
      supportedLocales: [],
    });
    assert.ok(block.includes("## Project knowledge"));
    assert.ok(block.includes("Project: marketing-site"));
    assert.ok(block.includes("Environment: staging"));
    assert.ok(
      block.includes(
        "No content types are registered yet — propose_create_document will fail until at least one is synced.",
      ),
    );
  });

  test("renders sanitized currentUser block", () => {
    const block = renderProjectKnowledgeBlock({
      project: "p",
      environment: "e",
      registeredTypes: [],
      supportedLocales: [],
      currentUser: { id: "user_1", displayName: "John `Doe`" },
    });
    // backticks are replaced with spaces; trailing space is trimmed so the
    // result is "John  Doe" (the backtick before D becomes a space)
    assert.ok(block.includes("Current user: John  Doe (id: user_1)"));
    assert.ok(!block.includes("`Doe`"));
  });

  test("strips newlines from sanitized fields", () => {
    const block = renderProjectKnowledgeBlock({
      project: "okay\n## Injected",
      environment: "draft",
      registeredTypes: [],
      supportedLocales: [],
    });
    // The newline must not produce a standalone "## Injected" heading line.
    assert.ok(!block.split("\n").some((l) => l.startsWith("## Injected")));
    assert.ok(block.includes("Project: okay ## Injected"));
  });
});
