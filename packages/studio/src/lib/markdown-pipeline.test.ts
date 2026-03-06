import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError } from "@mdcms/shared";

import {
  extractMarkdownFromEditor,
  parseMarkdownToDocument,
  roundTripMarkdown,
  serializeDocumentToMarkdown,
} from "./markdown-pipeline.js";

test("markdown pipeline parses markdown into a TipTap document", () => {
  const document = parseMarkdownToDocument("# Launch Notes\n\nHello world.");

  assert.equal(document.type, "doc");
  assert.ok(Array.isArray(document.content));
});

test("markdown pipeline round-trip is stable after first serialization", () => {
  const input = [
    "# Launch Notes",
    "",
    "- Alpha",
    "- Beta",
    "",
    "```ts",
    "const value = 42;",
    "```",
    "",
    "Paragraph text.",
  ].join("\n");

  const first = roundTripMarkdown(input).markdown;
  const second = roundTripMarkdown(first).markdown;

  assert.equal(second, first);
});

test("markdown pipeline can serialize parsed document back to markdown", () => {
  const source = "## Heading\n\nBody copy";
  const parsed = parseMarkdownToDocument(source);
  const serialized = serializeDocumentToMarkdown(parsed);

  assert.equal(typeof serialized, "string");
  assert.equal(serialized.length > 0, true);
});

test("markdown pipeline throws explicit error when serializer is unavailable", () => {
  assert.throws(
    () => extractMarkdownFromEditor({} as never),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeError);
      assert.equal(error.code, "MARKDOWN_SERIALIZATION_UNAVAILABLE");
      return true;
    },
  );
});

test("markdown pipeline throws explicit error when serializer returns non-string", () => {
  assert.throws(
    () =>
      extractMarkdownFromEditor({
        getMarkdown: () => 42,
      } as never),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeError);
      assert.equal(error.code, "MARKDOWN_SERIALIZATION_FAILED");
      return true;
    },
  );
});
