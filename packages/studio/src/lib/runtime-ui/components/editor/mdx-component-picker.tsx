"use client";

import type { StudioMountContext } from "@mdcms/shared";

import { Badge } from "../ui/badge.js";
import { getMdxComponentKind } from "./mdx-component-catalog.js";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

export type MdxComponentPickerProps = {
  components: readonly MdxCatalogComponent[];
  query?: string;
  forbidden?: boolean;
  onSelect: (component: MdxCatalogComponent) => void;
};

export function MdxComponentPicker({
  components,
  query = "",
  forbidden = false,
  onSelect,
}: MdxComponentPickerProps) {
  if (components.length === 0) {
    return (
      <section
        data-mdcms-mdx-picker="catalog"
        data-mdcms-mdx-picker-state="empty"
        className="rounded-md border border-border bg-background p-3 text-sm text-foreground-muted"
      >
        No local MDX components registered.
      </section>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredComponents = components.filter((component) => {
    if (normalizedQuery.length === 0) {
      return true;
    }

    return [component.name, component.description ?? ""].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });

  return (
    <section
      data-mdcms-mdx-picker="catalog"
      className="space-y-3 rounded-md border border-border bg-background p-3 shadow-sm"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Insert component</p>
        <p className="text-xs text-foreground-muted">
          Pick from the local MDX component catalog.
        </p>
      </div>

      {forbidden ? (
        <p
          data-mdcms-mdx-picker-state="forbidden"
          className="text-xs text-foreground-muted"
        >
          Component insertion is unavailable in read-only mode.
        </p>
      ) : null}

      {filteredComponents.length === 0 ? (
        <p
          data-mdcms-mdx-picker-state="filtered-empty"
          className="text-xs text-foreground-muted"
        >
          No components match the current filter.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredComponents.map((component) => {
            const kind = getMdxComponentKind(component);

            return (
              <button
                key={component.name}
                type="button"
                disabled={forbidden}
                data-mdcms-mdx-picker-item={component.name}
                onClick={() => {
                  if (!forbidden) {
                    onSelect(component);
                  }
                }}
                className="flex w-full items-start justify-between rounded-md border border-border px-3 py-2 text-left hover:bg-background-subtle disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">
                    {component.name}
                  </span>
                  {component.description ? (
                    <span className="block text-xs text-foreground-muted">
                      {component.description}
                    </span>
                  ) : null}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {kind === "wrapper" ? "Wrapper" : "Void"}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
