import { RuntimeError } from "@mdcms/shared";
import { Editor, type JSONContent } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

const FALLBACK_MARKDOWN_ATTR = "mdcmsMarkdownSource";

function createMarkdownEditor(content: string | JSONContent): Editor {
  return new Editor({
    content,
    extensions: [StarterKit, Markdown],
  });
}

function canUseTiptapRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function createFallbackDocument(markdown: string): JSONContent {
  return {
    type: "doc",
    attrs: {
      [FALLBACK_MARKDOWN_ATTR]: markdown,
    },
    content: markdown.length
      ? [
          {
            type: "paragraph",
            content: [{ type: "text", text: markdown }],
          },
        ]
      : [],
  };
}

function extractTextContent(node: JSONContent | undefined): string {
  if (!node) {
    return "";
  }

  const fromText = typeof node.text === "string" ? node.text : "";
  const fromChildren = Array.isArray(node.content)
    ? node.content.map((child) => extractTextContent(child)).join("")
    : "";

  return `${fromText}${fromChildren}`;
}

function assertMarkdownString(markdown: unknown, source: string): string {
  if (typeof markdown === "string") {
    return markdown;
  }

  throw new RuntimeError({
    code: "MARKDOWN_SERIALIZATION_FAILED",
    message: `TipTap markdown serializer (${source}) returned a non-string value.`,
    statusCode: 500,
  });
}

export function extractMarkdownFromEditor(editor: Editor): string {
  const maybeGetMarkdown = (editor as unknown as { getMarkdown?: () => string })
    .getMarkdown;

  if (typeof maybeGetMarkdown === "function") {
    return assertMarkdownString(
      maybeGetMarkdown.call(editor),
      "editor.getMarkdown",
    );
  }

  const markdownStorage = (
    editor as unknown as {
      storage?: { markdown?: { getMarkdown?: () => string } };
    }
  ).storage?.markdown;

  if (typeof markdownStorage?.getMarkdown === "function") {
    return assertMarkdownString(
      markdownStorage.getMarkdown(),
      "editor.storage.markdown.getMarkdown",
    );
  }

  throw new RuntimeError({
    code: "MARKDOWN_SERIALIZATION_UNAVAILABLE",
    message: "TipTap markdown serializer is unavailable in this runtime.",
    statusCode: 500,
  });
}

export function parseMarkdownToDocument(markdown: string): JSONContent {
  if (!canUseTiptapRuntime()) {
    return createFallbackDocument(markdown);
  }

  const editor = createMarkdownEditor(markdown);

  try {
    return editor.getJSON();
  } finally {
    editor.destroy();
  }
}

export function serializeDocumentToMarkdown(document: JSONContent): string {
  if (!canUseTiptapRuntime()) {
    const fromAttr = document.attrs?.[FALLBACK_MARKDOWN_ATTR];
    if (typeof fromAttr === "string") {
      return fromAttr;
    }

    return extractTextContent(document);
  }

  const editor = createMarkdownEditor(document);

  try {
    return extractMarkdownFromEditor(editor);
  } finally {
    editor.destroy();
  }
}

export function roundTripMarkdown(markdown: string): {
  document: JSONContent;
  markdown: string;
} {
  const document = parseMarkdownToDocument(markdown);
  const serialized = serializeDocumentToMarkdown(document);

  return {
    document,
    markdown: serialized,
  };
}
