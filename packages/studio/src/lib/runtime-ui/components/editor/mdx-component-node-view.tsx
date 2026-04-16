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

import { GripVertical, Settings, Trash2 } from "lucide-react";

import { isMdxExpressionValue } from "../../../mdx-component-extension.js";
import { cn } from "../../lib/utils.js";

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
  selected?: boolean;
  previewState?: "ready" | "empty" | "error";
  previewSurface?: ReactNode;
  readOnly?: boolean;
  forbidden?: boolean;
  onEditProps?: () => void;
  onDelete?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      data-mdcms-mdx-component-frame={props.componentName}
      data-mdcms-mdx-component-kind={props.isVoid ? "void" : "wrapper"}
      className={cn(
        "group/mdx-block relative my-4 rounded-md border-l-[3px] pl-3 transition-colors duration-150",
        props.selected
          ? "border-l-primary bg-accent-subtle"
          : "border-l-primary/20 hover:border-l-primary/50",
      )}
    >
      {/* Drag handle */}
      <div className="absolute -left-7 top-1.5 flex opacity-0 transition-opacity duration-150 group-hover/mdx-block:opacity-100">
        <span className="cursor-grab rounded p-0.5 text-foreground-muted hover:bg-background-subtle hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </span>
      </div>

      {/* Chip row */}
      <div className="flex items-center justify-between py-1.5">
        <span className="text-mono-label select-none text-foreground-muted">
          {"<"}{props.componentName}{" />"}
        </span>

        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-150",
            props.selected
              ? "opacity-100"
              : "opacity-0 group-hover/mdx-block:opacity-100",
          )}
        >
          {props.forbidden ? (
            <span className="text-xs text-foreground-muted">
              Unavailable
            </span>
          ) : props.readOnly ? (
            <span className="text-xs text-foreground-muted">
              Read-only
            </span>
          ) : null}
          {props.onEditProps ? (
            <button
              type="button"
              onClick={props.onEditProps}
              aria-label={`Edit ${props.componentName} props`}
              title="Edit props"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:bg-background-subtle hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {props.onDelete ? (
            <button
              type="button"
              onClick={props.onDelete}
              aria-label={`Delete ${props.componentName}`}
              title="Delete component"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Content area */}
      <div className="pb-3">
        {/* Preview surface */}
        <div
          data-mdcms-mdx-preview-state={props.previewState ?? "empty"}
        >
          {props.previewSurface}
          {props.previewState === "error" ? (
            <p className="text-xs text-destructive">
              Preview failed to render.
            </p>
          ) : null}
        </div>

        {/* Wrapper children */}
        {props.isVoid ? null : (
          <div
            data-mdcms-mdx-content-label={props.componentName}
            className={props.previewState === "ready" ? "mt-2 border-t border-border pt-2" : undefined}
          >
            {props.children}
          </div>
        )}
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

  const handleEditProps = () => {
    const pos = props.getPos();
    if (typeof pos === "number") {
      props.editor.commands.setNodeSelection(pos);
    }
  };

  const handleDelete = () => {
    props.deleteNode();
  };

  const isEditable = !props.readOnly && !props.forbidden;

  return (
    <NodeViewWrapper as="div">
      <MdxComponentNodeFrame
        componentName={componentName}
        isVoid={isVoid}
        propsSummary={propsSummary}
        previewState={previewState}
        selected={props.selected}
        onEditProps={isEditable ? handleEditProps : undefined}
        onDelete={isEditable ? handleDelete : undefined}
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
        {isVoid ? null : (
          <div ref={contentContainerRef}>
            <NodeViewContent
              as="div"
              data-placeholder="Type content here..."
              className="prose prose-sm max-w-none min-h-[3rem] rounded-md bg-background px-3 py-3 text-sm before:pointer-events-none before:float-left before:h-0 before:text-sm before:text-foreground-muted/60 before:content-[attr(data-placeholder)] has-[>:first-child:not(.is-empty)]:before:content-none"
            />
          </div>
        )}
      </MdxComponentNodeFrame>
    </NodeViewWrapper>
  );
}
