"use client";

import type { ReactNode } from "react";

import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

import { isMdxExpressionValue } from "../../../mdx-component-extension.js";
import { Badge } from "../ui/badge.js";

function formatPropsSummary(
  props: Record<string, unknown> | undefined,
): string {
  const entries = Object.entries(props ?? {}).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    return "No props";
  }

  return entries
    .map(([name, value]) => {
      if (isMdxExpressionValue(value)) {
        return `${name}={${value.__mdxExpression}}`;
      }

      if (typeof value === "string") {
        return `${name}="${value}"`;
      }

      return `${name}={${JSON.stringify(value)}}`;
    })
    .join(" ");
}

export function MdxComponentNodeFrame(props: {
  componentName: string;
  isVoid: boolean;
  propsSummary: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-mdcms-mdx-component-frame={props.componentName}
      data-mdcms-mdx-component-kind={props.isVoid ? "void" : "wrapper"}
      className="my-4 rounded-lg border border-dashed border-border bg-background-subtle"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            {props.componentName}
          </div>
          <div className="font-mono text-xs text-foreground-muted">
            {props.propsSummary}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {props.isVoid ? "Void" : "Wrapper"}
        </Badge>
      </div>

      <div className="px-3 py-3">
        {props.isVoid ? (
          <p className="text-xs text-foreground-muted">
            Self-closing component
          </p>
        ) : (
          props.children
        )}
      </div>
    </div>
  );
}

export function MdxComponentNodeView(props: ReactNodeViewProps) {
  const componentName =
    typeof props.node.attrs.componentName === "string"
      ? props.node.attrs.componentName
      : "Component";
  const isVoid = props.node.attrs.isVoid === true;
  const propsSummary = formatPropsSummary(
    props.node.attrs.props as Record<string, unknown> | undefined,
  );

  return (
    <NodeViewWrapper as="div">
      <MdxComponentNodeFrame
        componentName={componentName}
        isVoid={isVoid}
        propsSummary={propsSummary}
      >
        <NodeViewContent
          as="div"
          className="prose prose-sm max-w-none min-h-[3rem] rounded-md border border-border bg-background px-3 py-3 text-sm"
        />
      </MdxComponentNodeFrame>
    </NodeViewWrapper>
  );
}
