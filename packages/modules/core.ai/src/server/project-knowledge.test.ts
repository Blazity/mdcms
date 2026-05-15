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
});
