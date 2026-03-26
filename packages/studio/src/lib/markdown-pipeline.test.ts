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

test("markdown pipeline preserves wrapper MDX blocks with nested markdown children", () => {
  const source = [
    '<Callout type="warning">',
    "This is **important** content.",
    "",
    "- One",
    "- Two",
    "</Callout>",
  ].join("\n");

  const parsed = parseMarkdownToDocument(source);

  assert.equal(parsed.type, "doc");
  assert.ok(Array.isArray(parsed.content));
  assert.deepEqual(parsed.content?.[0], {
    type: "mdxComponent",
    attrs: {
      componentName: "Callout",
      isVoid: false,
      props: {
        type: "warning",
      },
    },
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "This is " },
          { type: "text", marks: [{ type: "bold" }], text: "important" },
          { type: "text", text: " content." },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "One" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Two" }] },
            ],
          },
        ],
      },
    ],
  });

  const serialized = serializeDocumentToMarkdown(parsed);

  assert.match(serialized, /<Callout type="warning">/);
  assert.match(serialized, /\*\*important\*\*/);
  assert.match(serialized, /- One/);
  assert.match(serialized, /<\/Callout>/);
});

test("markdown pipeline keeps wrapper MDX serialization stable after first pass", () => {
  const source = [
    '<Callout type="warning">',
    "Paragraph",
    "",
    "1. First",
    "2. Second",
    "</Callout>",
  ].join("\n");

  const first = roundTripMarkdown(source).markdown;
  const second = roundTripMarkdown(first).markdown;

  assert.equal(second, first);
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
