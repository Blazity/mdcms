import { Fragment, createElement, type ReactNode } from "react";

import { parseMarkdownToDocument } from "@mdcms/studio/markdown-pipeline";

import { Callout } from "../components/mdx/Callout";
import { Chart } from "../components/mdx/Chart";
import { PricingTable } from "../components/mdx/PricingTable";

type RenderNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{
    type?: string;
    attrs?: Record<string, unknown>;
  }>;
  content?: RenderNode[];
};

const mdxComponents = {
  Callout,
  Chart,
  PricingTable,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getContent(node: RenderNode): RenderNode[] {
  return Array.isArray(node.content) ? node.content : [];
}

function getMdxProps(attrs: Record<string, unknown> | undefined) {
  return isRecord(attrs?.props) ? attrs.props : {};
}

function getHeadingLevel(attrs: Record<string, unknown> | undefined) {
  const level = attrs?.level;

  return typeof level === "number" && level >= 1 && level <= 6 ? level : 2;
}

function renderInlineNodes(nodes: RenderNode[]): ReactNode[] {
  return nodes.map((node, index) => renderInlineNode(node, index));
}

function renderInlineNode(node: RenderNode, key: number): ReactNode {
  if (node.type === "hardBreak") {
    return <br key={key} />;
  }

  if (node.type !== "text") {
    return <Fragment key={key}>{renderBlockNodes(getContent(node))}</Fragment>;
  }

  let value: ReactNode = node.text ?? "";

  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") {
      value = <strong>{value}</strong>;
    } else if (mark.type === "italic") {
      value = <em>{value}</em>;
    } else if (mark.type === "code") {
      value = <code>{value}</code>;
    } else if (mark.type === "link" && typeof mark.attrs?.href === "string") {
      value = (
        <a href={mark.attrs.href} rel="noreferrer">
          {value}
        </a>
      );
    }
  }

  return <Fragment key={key}>{value}</Fragment>;
}

function renderListItem(node: RenderNode, key: number): ReactNode {
  const content = getContent(node);

  if (content.length === 1 && content[0]?.type === "paragraph") {
    return <li key={key}>{renderInlineNodes(getContent(content[0]))}</li>;
  }

  return <li key={key}>{renderBlockNodes(content)}</li>;
}

function renderMdxComponent(node: RenderNode, key: number): ReactNode {
  const componentName = node.attrs?.componentName;

  if (typeof componentName !== "string" || !(componentName in mdxComponents)) {
    return (
      <div key={key} data-mdcms-rendered-mdx-state="unsupported">
        Unsupported MDX component
      </div>
    );
  }

  const Component = mdxComponents[componentName as keyof typeof mdxComponents];
  const props = getMdxProps(node.attrs);
  const children = renderBlockNodes(getContent(node));

  return createElement(
    Component as never,
    {
      ...props,
      key,
    } as never,
    children.length > 0 ? children : undefined,
  );
}

function renderBlockNode(node: RenderNode, key: number): ReactNode {
  switch (node.type) {
    case "heading": {
      const tag = `h${getHeadingLevel(node.attrs)}`;

      return createElement(tag, { key }, renderInlineNodes(getContent(node)));
    }
    case "paragraph":
      return <p key={key}>{renderInlineNodes(getContent(node))}</p>;
    case "bulletList":
      return <ul key={key}>{getContent(node).map(renderListItem)}</ul>;
    case "orderedList":
      return <ol key={key}>{getContent(node).map(renderListItem)}</ol>;
    case "listItem":
      return renderListItem(node, key);
    case "blockquote":
      return (
        <blockquote key={key}>{renderBlockNodes(getContent(node))}</blockquote>
      );
    case "codeBlock":
      return (
        <pre key={key}>
          <code>
            {getContent(node)
              .map((child) => child.text ?? "")
              .join("")}
          </code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "mdxComponent":
      return renderMdxComponent(node, key);
    default:
      return (
        <Fragment key={key}>{renderBlockNodes(getContent(node))}</Fragment>
      );
  }
}

function renderBlockNodes(nodes: RenderNode[]): ReactNode[] {
  return nodes.map((node, index) => renderBlockNode(node, index));
}

export function RenderedContent({ body }: { body: string }) {
  const document = parseMarkdownToDocument(body) as RenderNode;

  return (
    <div data-mdcms-rendered-content="true">
      {renderBlockNodes(getContent(document))}
    </div>
  );
}
