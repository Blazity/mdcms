"use client";

import { useEffect, useMemo, useState } from "react";

import type { StudioMountContext } from "@mdcms/shared";

import {
  MdxPropsEditorHost,
  type PropsEditorValue,
} from "../../../mdx-props-editor-host.js";
import { Badge } from "../ui/badge.js";
import { Label } from "../ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

function getDefaultComponentName(components: MdxCatalogComponent[]): string {
  if (components.length === 0) {
    return "";
  }

  return (
    components.find((component) => component.propsEditor)?.name ??
    components[0]!.name
  );
}

export function MdxPropsPanel({ context }: { context: StudioMountContext }) {
  const components = context.mdx?.catalog.components ?? [];
  const [selectedComponentName, setSelectedComponentName] = useState(() =>
    getDefaultComponentName(components),
  );
  const [valuesByComponent, setValuesByComponent] = useState<
    Record<string, PropsEditorValue>
  >({});

  useEffect(() => {
    const nextDefault = getDefaultComponentName(components);

    setSelectedComponentName((currentValue) => {
      if (
        currentValue.length > 0 &&
        components.some((component) => component.name === currentValue)
      ) {
        return currentValue;
      }

      return nextDefault;
    });
  }, [components]);

  const selectedComponent = useMemo(
    () =>
      components.find(
        (component) => component.name === selectedComponentName,
      ) ?? components[0],
    [components, selectedComponentName],
  );

  if (!selectedComponent) {
    return (
      <section data-mdcms-mdx-props-panel="empty" className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            MDX component props
          </p>
          <p className="text-xs text-foreground-muted">
            No local MDX components registered.
          </p>
        </div>
      </section>
    );
  }

  const selectedValue = valuesByComponent[selectedComponent.name] ?? {};

  return (
    <section
      data-mdcms-mdx-props-panel={selectedComponent.name}
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            MDX component props
          </p>
          <p className="text-xs text-foreground-muted">
            Runtime proof surface for custom editors and auto-form fallback.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {selectedComponent.propsEditor ? "Custom" : "Auto"}
        </Badge>
      </div>

      {components.length > 1 ? (
        <div className="space-y-2">
          <Label htmlFor="mdx-component-props-panel-select">Component</Label>
          <Select
            value={selectedComponent.name}
            onValueChange={setSelectedComponentName}
          >
            <SelectTrigger id="mdx-component-props-panel-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {components.map((component) => (
                <SelectItem key={component.name} value={component.name}>
                  {component.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {selectedComponent.description ? (
        <p className="text-xs text-foreground-muted">
          {selectedComponent.description}
        </p>
      ) : null}

      <div className="rounded-md border border-border bg-background-subtle p-3">
        <MdxPropsEditorHost
          component={selectedComponent}
          context={context}
          value={selectedValue}
          onChange={(nextValue) => {
            setValuesByComponent((currentValues) => ({
              ...currentValues,
              [selectedComponent.name]: {
                ...(currentValues[selectedComponent.name] ?? {}),
                ...nextValue,
              },
            }));
          }}
        />
      </div>
    </section>
  );
}
