"use client";

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { StudioMountContext } from "@mdcms/shared";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

import { isMdxExpressionValue } from "../../../mdx-component-extension.js";

export function formatMdxComponentPropsSummary(
  props: Record<string, unknown> | undefined,
): string {
  const entries = Object.entries(props ?? {}).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    return "No props set yet";
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
  previewState?: "ready" | "empty" | "error";
  previewSurface?: ReactNode;
  readOnly?: boolean;
  forbidden?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-mdcms-mdx-component-frame={props.componentName}
      data-mdcms-mdx-component-kind={props.isVoid ? "void" : "wrapper"}
      className="my-4 rounded-lg border border-dashed border-border bg-background-subtle"
    >
      <div className="border-b border-border px-3 py-2">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            {props.componentName}
          </div>
          <div className="font-mono text-xs text-foreground-muted">
            {props.propsSummary}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div
          data-mdcms-mdx-preview-state={props.previewState ?? "empty"}
          className="relative min-h-[4.5rem] rounded-md border border-border bg-background px-3 py-3"
        >
          {props.previewSurface}
          {props.previewState === "empty" ? (
            <p className="text-xs text-foreground-muted">
              Local preview unavailable.
            </p>
          ) : null}
          {props.previewState === "error" ? (
            <p className="text-xs text-destructive">
              Preview failed to render.
            </p>
          ) : null}
        </div>

        {props.isVoid ? (
          <p className="text-xs text-foreground-muted">
            Self-closing component
          </p>
        ) : (
          <div className="space-y-1.5">
            <p
              data-mdcms-mdx-content-label={props.componentName}
              className="text-xs font-medium text-foreground-muted"
            >
              Inner content
            </p>
            <p className="text-xs text-foreground-muted">
              Edit nested markdown directly in this block.
            </p>
            {props.children}
          </div>
        )}

        {props.forbidden ? (
          <p className="text-xs text-foreground-muted">
            Editing is unavailable.
          </p>
        ) : props.readOnly ? (
          <p className="text-xs text-foreground-muted">Read-only preview.</p>
        ) : null}
      </div>
    </div>
  );
}

export function createMdxComponentPreviewProps(input: {
  props: Record<string, unknown>;
  isVoid: boolean;
  childrenHtml?: string;
}): Record<string, unknown> {
  if (input.isVoid) {
    return input.props;
  }

  const childrenHtml = input.childrenHtml?.trim() ?? "";

  if (childrenHtml.length === 0) {
    return input.props;
  }

  return {
    ...input.props,
    children: createElement("div", {
      dangerouslySetInnerHTML: {
        __html: childrenHtml,
      },
    }),
  };
}

function getMdxComponentPreviewChildrenHtml(
  container: HTMLDivElement | null,
): string | undefined {
  if (!container) {
    return undefined;
  }

  if (container.firstElementChild instanceof HTMLElement) {
    return container.firstElementChild.innerHTML;
  }

  return container.innerHTML;
}

export function MdxComponentNodeView(
  props: ReactNodeViewProps & {
    context?: StudioMountContext;
    readOnly?: boolean;
    forbidden?: boolean;
  },
) {
  const componentName =
    typeof props.node.attrs.componentName === "string"
      ? props.node.attrs.componentName
      : "Component";
  const isVoid = props.node.attrs.isVoid === true;
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewState, setPreviewState] = useState<"ready" | "empty" | "error">(
    "empty",
  );
  const mdxProps =
    (props.node.attrs.props as Record<string, unknown> | undefined) ?? {};
  const serializedPreviewProps = JSON.stringify(mdxProps);
  const serializedChildren = JSON.stringify(props.node.content.toJSON());
  const propsSummary = formatMdxComponentPropsSummary(mdxProps);

  useEffect(() => {
    const container = previewContainerRef.current;

    if (!container || !props.context) {
      setPreviewState("empty");
      return;
    }

    if (props.context.hostBridge.resolveComponent(componentName) == null) {
      setPreviewState("empty");
      return;
    }

    try {
      const previewProps = createMdxComponentPreviewProps({
        props: mdxProps,
        isVoid,
        childrenHtml: getMdxComponentPreviewChildrenHtml(
          contentContainerRef.current,
        ),
      });
      const cleanup = props.context.hostBridge.renderMdxPreview({
        container,
        componentName,
        props: previewProps,
        key: `mdx-component:${componentName}:${serializedPreviewProps}:${serializedChildren}`,
      });

      setPreviewState("ready");

      return () => {
        cleanup();
      };
    } catch {
      setPreviewState("error");
      return;
    }
  }, [
    componentName,
    isVoid,
    mdxProps,
    props.context,
    serializedChildren,
    serializedPreviewProps,
  ]);

  return (
    <NodeViewWrapper as="div">
      <MdxComponentNodeFrame
        componentName={componentName}
        isVoid={isVoid}
        propsSummary={propsSummary}
        previewState={previewState}
        previewSurface={
          <div
            ref={previewContainerRef}
            data-mdcms-mdx-preview-surface={componentName}
            className={previewState === "ready" ? "min-h-[3rem]" : "hidden"}
          />
        }
        readOnly={props.readOnly}
        forbidden={props.forbidden}
      >
        <div ref={contentContainerRef}>
          <NodeViewContent
            as="div"
            data-placeholder="Type content here..."
            className="prose prose-sm max-w-none min-h-[3rem] rounded-md border border-border bg-background px-3 py-3 text-sm before:pointer-events-none before:float-left before:h-0 before:text-sm before:text-foreground-muted/60 before:content-[attr(data-placeholder)] has-[>:first-child:not(.is-empty)]:before:content-none"
          />
        </div>
      </MdxComponentNodeFrame>
    </NodeViewWrapper>
  );
}
