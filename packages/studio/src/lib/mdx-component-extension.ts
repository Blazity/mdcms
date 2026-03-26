import {
  Node,
  mergeAttributes,
  type JSONContent,
  type MarkdownToken,
} from "@tiptap/core";

type MdxComponentToken = {
  type: "mdxComponent";
  raw: string;
  componentName: string;
  props: Record<string, unknown>;
  isVoid: boolean;
  content: string;
  tokens?: MarkdownToken[];
};

type OpeningTagMatch = {
  componentName: string;
  propsSource: string;
  isVoid: boolean;
  raw: string;
  endIndex: number;
};

type ClosingTagMatch = {
  componentName: string;
  raw: string;
  startIndex: number;
  endIndex: number;
};

function isUppercaseComponentName(value: string): boolean {
  return /^[A-Z][A-Za-z0-9._-]*$/.test(value);
}

function readQuotedValue(input: string, index: number): [string, number] {
  const quote = input[index];
  let cursor = index + 1;
  let value = "";

  while (cursor < input.length) {
    const current = input[cursor];

    if (current === "\\" && cursor + 1 < input.length) {
      value += input.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }

    if (current === quote) {
      return [value, cursor + 1];
    }

    value += current;
    cursor += 1;
  }

  throw new Error("Unterminated quoted JSX attribute value.");
}

function readBracedValue(input: string, index: number): [string, number] {
  let cursor = index + 1;
  let depth = 1;
  let value = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (cursor < input.length) {
    const current = input[cursor];
    const previous = input[cursor - 1];

    if (current === "'" && !inDoubleQuote && previous !== "\\") {
      inSingleQuote = !inSingleQuote;
      value += current;
      cursor += 1;
      continue;
    }

    if (current === '"' && !inSingleQuote && previous !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      value += current;
      cursor += 1;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (current === "{") {
        depth += 1;
      } else if (current === "}") {
        depth -= 1;

        if (depth === 0) {
          return [value, cursor + 1];
        }
      }
    }

    value += current;
    cursor += 1;
  }

  throw new Error("Unterminated braced JSX attribute value.");
}

function parseMdxExpressionValue(input: string): unknown {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return true;
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseMdxJsxAttributes(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let cursor = 0;

  while (cursor < input.length) {
    while (cursor < input.length && /\s/.test(input[cursor]!)) {
      cursor += 1;
    }

    if (cursor >= input.length) {
      break;
    }

    const nameStart = cursor;

    while (cursor < input.length && /[A-Za-z0-9._:-]/.test(input[cursor]!)) {
      cursor += 1;
    }

    const attributeName = input.slice(nameStart, cursor);

    if (attributeName.length === 0) {
      throw new Error(
        `Invalid JSX attribute syntax near "${input.slice(cursor)}".`,
      );
    }

    while (cursor < input.length && /\s/.test(input[cursor]!)) {
      cursor += 1;
    }

    if (input[cursor] !== "=") {
      result[attributeName] = true;
      continue;
    }

    cursor += 1;

    while (cursor < input.length && /\s/.test(input[cursor]!)) {
      cursor += 1;
    }

    const current = input[cursor];

    if (current === '"' || current === "'") {
      const [rawValue, nextCursor] = readQuotedValue(input, cursor);
      result[attributeName] = rawValue;
      cursor = nextCursor;
      continue;
    }

    if (current === "{") {
      const [rawValue, nextCursor] = readBracedValue(input, cursor);
      result[attributeName] = parseMdxExpressionValue(rawValue);
      cursor = nextCursor;
      continue;
    }

    throw new Error(
      `Unsupported JSX attribute value for "${attributeName}" near "${input.slice(cursor)}".`,
    );
  }

  return result;
}

function formatAttributeValue(value: unknown): string {
  if (typeof value === "string") {
    return `${JSON.stringify(value)}`;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    Array.isArray(value) ||
    typeof value === "object"
  ) {
    return `{${JSON.stringify(value)}}`;
  }

  return `{${JSON.stringify(String(value))}}`;
}

export function serializeMdxJsxAttributes(
  input: Record<string, unknown>,
): string {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${formatAttributeValue(value)}`)
    .join(" ");
}

function readOpeningTag(input: string, offset = 0): OpeningTagMatch | null {
  if (input[offset] !== "<" || input[offset + 1] === "/") {
    return null;
  }

  let cursor = offset + 1;

  while (cursor < input.length && /\s/.test(input[cursor]!)) {
    cursor += 1;
  }

  const nameStart = cursor;

  while (cursor < input.length && /[A-Za-z0-9._-]/.test(input[cursor] ?? "")) {
    cursor += 1;
  }

  const componentName = input.slice(nameStart, cursor);

  if (!isUppercaseComponentName(componentName)) {
    return null;
  }

  const propsStart = cursor;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let braceDepth = 0;

  while (cursor < input.length) {
    const current = input[cursor]!;
    const previous = input[cursor - 1];

    if (current === "'" && !inDoubleQuote && previous !== "\\") {
      inSingleQuote = !inSingleQuote;
      cursor += 1;
      continue;
    }

    if (current === '"' && !inSingleQuote && previous !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      cursor += 1;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (current === "{") {
        braceDepth += 1;
      } else if (current === "}") {
        braceDepth -= 1;
      } else if (current === ">" && braceDepth === 0) {
        const raw = input.slice(offset, cursor + 1);
        const beforeClose = input.slice(propsStart, cursor).trimEnd();
        const isVoid = beforeClose.endsWith("/");
        const propsSource = isVoid
          ? beforeClose.slice(0, -1).trim()
          : beforeClose.trim();

        return {
          componentName,
          propsSource,
          isVoid,
          raw,
          endIndex: cursor + 1,
        };
      }
    }

    cursor += 1;
  }

  return null;
}

function readClosingTag(input: string, offset: number): ClosingTagMatch | null {
  if (input.slice(offset, offset + 2) !== "</") {
    return null;
  }

  let cursor = offset + 2;

  while (cursor < input.length && /\s/.test(input[cursor]!)) {
    cursor += 1;
  }

  const nameStart = cursor;

  while (cursor < input.length && /[A-Za-z0-9._-]/.test(input[cursor] ?? "")) {
    cursor += 1;
  }

  const componentName = input.slice(nameStart, cursor);

  if (!isUppercaseComponentName(componentName)) {
    return null;
  }

  while (cursor < input.length && /\s/.test(input[cursor]!)) {
    cursor += 1;
  }

  if (input[cursor] !== ">") {
    return null;
  }

  return {
    componentName,
    raw: input.slice(offset, cursor + 1),
    startIndex: offset,
    endIndex: cursor + 1,
  };
}

function findMatchingClosingTag(
  input: string,
  componentName: string,
  searchStart: number,
): ClosingTagMatch | null {
  let depth = 0;
  let cursor = searchStart;

  while (cursor < input.length) {
    const nextOpen = input.indexOf(`<${componentName}`, cursor);
    const nextClose = input.indexOf(`</${componentName}`, cursor);

    if (nextClose === -1) {
      return null;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const nestedOpening = readOpeningTag(input, nextOpen);

      if (nestedOpening) {
        if (!nestedOpening.isVoid) {
          depth += 1;
        }

        cursor = nestedOpening.endIndex;
        continue;
      }
    }

    const closingTag = readClosingTag(input, nextClose);

    if (!closingTag) {
      cursor = nextClose + 2;
      continue;
    }

    if (depth === 0) {
      return closingTag;
    }

    depth -= 1;
    cursor = closingTag.endIndex;
  }

  return null;
}

export function tokenizeMdxComponentBlock(
  input: string,
): Omit<MdxComponentToken, "type"> | null {
  const openingTag = readOpeningTag(input, 0);

  if (!openingTag) {
    return null;
  }

  const props = parseMdxJsxAttributes(openingTag.propsSource);

  if (openingTag.isVoid) {
    return {
      componentName: openingTag.componentName,
      isVoid: true,
      props,
      raw: openingTag.raw,
      content: "",
    };
  }

  const closingTag = findMatchingClosingTag(
    input,
    openingTag.componentName,
    openingTag.endIndex,
  );

  if (!closingTag) {
    return null;
  }

  return {
    componentName: openingTag.componentName,
    isVoid: false,
    props,
    raw: input.slice(0, closingTag.endIndex),
    content: input.slice(openingTag.endIndex, closingTag.startIndex).trim(),
  };
}

function renderMdxComponentMarkdown(
  node: JSONContent,
  childrenMarkdown: string,
) {
  const componentName = node.attrs?.componentName;
  const isVoid = node.attrs?.isVoid === true;
  const props =
    (node.attrs?.props as Record<string, unknown> | undefined) ?? {};

  if (typeof componentName !== "string" || componentName.trim().length === 0) {
    return "";
  }

  const serializedProps = serializeMdxJsxAttributes(props);
  const attrSegment = serializedProps.length > 0 ? ` ${serializedProps}` : "";

  if (isVoid) {
    return `<${componentName}${attrSegment} />`;
  }

  if (childrenMarkdown.trim().length === 0) {
    return `<${componentName}${attrSegment}></${componentName}>`;
  }

  return `<${componentName}${attrSegment}>\n${childrenMarkdown}\n</${componentName}>`;
}

export const MdxComponentExtension = Node.create({
  name: "mdxComponent",
  group: "block",
  // A single generic node type covers both wrapper and self-closing MDX
  // components. Void components simply keep `isVoid: true` and empty content.
  content: "block*",
  isolating: true,
  selectable: true,
  priority: 1000,

  addAttributes() {
    return {
      componentName: {
        default: "",
      },
      props: {
        default: {},
      },
      isVoid: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: "mdx-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    const componentName =
      typeof HTMLAttributes.componentName === "string"
        ? HTMLAttributes.componentName
        : "";

    return [
      "mdx-component",
      mergeAttributes(HTMLAttributes, {
        "data-mdcms-mdx-component": componentName,
        "data-mdcms-mdx-void":
          HTMLAttributes.isVoid === true ? "true" : "false",
      }),
      0,
    ];
  },

  markdownTokenName: "mdxComponent",

  parseMarkdown(token, helpers) {
    const mdxToken = token as unknown as MdxComponentToken;

    return helpers.createNode(
      "mdxComponent",
      {
        componentName: mdxToken.componentName,
        props: mdxToken.props ?? {},
        isVoid: mdxToken.isVoid === true,
      },
      mdxToken.isVoid ? [] : helpers.parseChildren(mdxToken.tokens ?? []),
    );
  },

  renderMarkdown(node, helpers) {
    return renderMdxComponentMarkdown(
      node,
      helpers.renderChildren(node.content ?? [], "\n\n"),
    );
  },

  markdownTokenizer: {
    name: "mdxComponent",
    level: "block",
    start(src) {
      const match = src.match(/^<[A-Z][A-Za-z0-9._-]*/m);
      return match?.index ?? -1;
    },
    tokenize(src, _tokens, lexer) {
      const token = tokenizeMdxComponentBlock(src);

      if (!token) {
        return undefined;
      }

      const contentTokens =
        token.isVoid || token.content.trim().length === 0
          ? []
          : lexer.blockTokens(token.content);

      return {
        type: "mdxComponent",
        raw: token.raw,
        componentName: token.componentName,
        props: token.props,
        isVoid: token.isVoid,
        content: token.content,
        tokens: contentTokens,
      } satisfies MdxComponentToken;
    },
  },
});
