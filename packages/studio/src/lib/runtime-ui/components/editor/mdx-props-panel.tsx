"use client";

import type { StudioMountContext } from "@mdcms/shared";

import {
  MdxPropsEditorHost,
  type PropsEditorChangeHandler,
  type PropsEditorValue,
} from "../../../mdx-props-editor-host.js";
import { Badge } from "../ui/badge.js";
import { getMdxComponentKind } from "./mdx-component-catalog.js";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

export type MdxPropsPanelSelection = {
  component: MdxCatalogComponent | undefined;
  componentName: string;
  isVoid: boolean;
  props: PropsEditorValue;
  onPropsChange: PropsEditorChangeHandler;
  readOnly: boolean;
  forbidden: boolean;
};

export function MdxPropsPanel({
  context,
  selection,
}: {
  context: StudioMountContext;
  selection: MdxPropsPanelSelection | null;
}) {
  if (!selection) {
    return (
      <section data-mdcms-mdx-props-panel="idle" className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            MDX component props
          </p>
          <p className="text-xs text-foreground-muted">
            Select an MDX component block to inspect or edit its props.
          </p>
        </div>
      </section>
    );
  }

  if (!selection.component) {
    return (
      <section data-mdcms-mdx-props-panel="unregistered" className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            MDX component props
          </p>
          <p className="text-xs text-foreground-muted">
            {selection.componentName} is not registered in the local MDX
            component catalog.
          </p>
        </div>
      </section>
    );
  }

  const component = selection.component;
  const kind = selection.isVoid ? "void" : getMdxComponentKind(component);

  return (
    <section data-mdcms-mdx-props-panel={component.name} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            MDX component props
          </p>
          <p className="text-xs text-foreground-muted">Selected component</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {kind === "wrapper" ? "Wrapper" : "Void"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {component.propsEditor ? "Custom" : "Auto"}
          </Badge>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{component.name}</p>
        {component.description ? (
          <p className="text-xs text-foreground-muted">
            {component.description}
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border bg-background-subtle p-3">
        <MdxPropsEditorHost
          component={component}
          context={context}
          value={selection.props}
          onChange={selection.onPropsChange}
          readOnly={selection.readOnly}
          forbidden={selection.forbidden}
        />
      </div>
    </section>
  );
}
