import { RuntimeError } from "@mdcms/shared";

export type StudioRenderable = () => unknown;

export type StudioRouteDefinition = {
  id: string;
  path: string;
  render: StudioRenderable;
};

export type StudioNavItemDefinition = {
  id: string;
  label: string;
  to: string;
  order?: number;
};

export type StudioSlotWidgetDefinition = {
  id: string;
  slotId: string;
  priority?: number;
  render: StudioRenderable;
};

export type StudioFieldKindDefinition = {
  kind: string;
  render: StudioRenderable;
};

export type StudioEditorNodeDefinition = {
  id: string;
  render: StudioRenderable;
};

export type StudioActionOverrideDefinition = {
  actionId: string;
  render: StudioRenderable;
};

export type StudioSettingsPanelDefinition = {
  id: string;
  title: string;
  render: StudioRenderable;
};

export type StudioRegistryWarning = {
  code: "UNKNOWN_FIELD_KIND";
  message: string;
  details: {
    requestedKind: string;
    fallbackKind: string;
  };
};

export type BuildStudioRuntimeRegistryInput = {
  routes?: StudioRouteDefinition[];
  navItems?: StudioNavItemDefinition[];
  slotWidgets?: StudioSlotWidgetDefinition[];
  fieldKinds?: StudioFieldKindDefinition[];
  editorNodes?: StudioEditorNodeDefinition[];
  actionOverrides?: StudioActionOverrideDefinition[];
  settingsPanels?: StudioSettingsPanelDefinition[];
};

export type BuildStudioRuntimeRegistryOptions = {
  warn?: (warning: StudioRegistryWarning) => void;
};

export type StudioRuntimeRegistry = {
  routes: StudioRouteDefinition[];
  navItems: StudioNavItemDefinition[];
  slotWidgetsBySlot: Map<string, StudioSlotWidgetDefinition[]>;
  fieldKinds: Map<string, StudioFieldKindDefinition>;
  editorNodes: Map<string, StudioEditorNodeDefinition>;
  actionOverrides: Map<string, StudioActionOverrideDefinition>;
  settingsPanels: Map<string, StudioSettingsPanelDefinition>;
  resolveFieldKind: (kind: string) => StudioFieldKindDefinition;
};

const JSON_FIELD_KIND: StudioFieldKindDefinition = {
  kind: "json",
  render: () => null,
};

function assertNonEmptyId(
  value: string,
  details: Record<string, unknown>,
  noun: string,
) {
  if (value.trim().length > 0) {
    return;
  }

  throw new RuntimeError({
    code: "INVALID_STUDIO_RUNTIME_REGISTRY",
    message: `Studio ${noun} id must be a non-empty string.`,
    statusCode: 500,
    details,
  });
}

function sortByNumericOrderThenId<T extends { id: string; order?: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.id.localeCompare(right.id);
  });
}

export function normalizeStudioRoutePath(path: string): string {
  const segments = path
    .trim()
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? ":*" : segment));

  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

function buildRoutes(
  routes: readonly StudioRouteDefinition[],
): StudioRouteDefinition[] {
  const seen = new Map<string, string>();

  for (const route of routes) {
    assertNonEmptyId(route.id, { routeId: route.id }, "route");

    const normalizedPath = normalizeStudioRoutePath(route.path);
    const conflictingRouteId = seen.get(normalizedPath);

    if (conflictingRouteId) {
      throw new RuntimeError({
        code: "DUPLICATE_STUDIO_ROUTE_PATH",
        message: `Studio route "${route.id}" conflicts with "${conflictingRouteId}" after normalized route path matching.`,
        statusCode: 500,
        details: {
          routeId: route.id,
          conflictingRouteId,
          normalizedPath,
        },
      });
    }

    seen.set(normalizedPath, route.id);
  }

  return [...routes];
}

function buildSlotWidgets(
  slotWidgets: readonly StudioSlotWidgetDefinition[],
): Map<string, StudioSlotWidgetDefinition[]> {
  const grouped = new Map<string, StudioSlotWidgetDefinition[]>();

  for (const widget of slotWidgets) {
    assertNonEmptyId(widget.id, { widgetId: widget.id }, "slot widget");

    if (!Number.isFinite(widget.priority)) {
      throw new RuntimeError({
        code: "INVALID_STUDIO_RUNTIME_REGISTRY",
        message: `Studio slot widget "${widget.id}" must declare an explicit numeric priority.`,
        statusCode: 500,
        details: {
          widgetId: widget.id,
          slotId: widget.slotId,
        },
      });
    }

    const bucket = grouped.get(widget.slotId) ?? [];
    bucket.push(widget as StudioSlotWidgetDefinition & { priority: number });
    grouped.set(widget.slotId, bucket);
  }

  for (const [slotId, widgets] of grouped) {
    widgets.sort((left, right) => {
      const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.id.localeCompare(right.id);
    });

    grouped.set(slotId, widgets);
  }

  return grouped;
}

function buildUniqueMap<
  T extends Record<string, unknown>,
  K extends keyof T & string,
>(items: readonly T[], key: K, noun: string): Map<string, T> {
  const result = new Map<string, T>();

  for (const item of items) {
    const itemKey = item[key];

    if (typeof itemKey !== "string") {
      throw new RuntimeError({
        code: "INVALID_STUDIO_RUNTIME_REGISTRY",
        message: `Studio ${noun} is missing a string ${key}.`,
        statusCode: 500,
        details: {
          noun,
          key,
        },
      });
    }

    assertNonEmptyId(itemKey, { [key]: itemKey }, noun);

    if (result.has(itemKey)) {
      throw new RuntimeError({
        code: "INVALID_STUDIO_RUNTIME_REGISTRY",
        message: `Duplicate Studio ${noun} "${itemKey}" is not allowed.`,
        statusCode: 500,
        details: {
          [key]: itemKey,
        },
      });
    }

    result.set(itemKey, item);
  }

  return result;
}

export function buildStudioRuntimeRegistry(
  input: BuildStudioRuntimeRegistryInput,
  options: BuildStudioRuntimeRegistryOptions = {},
): StudioRuntimeRegistry {
  const routes = buildRoutes(input.routes ?? []);
  const navItems = sortByNumericOrderThenId(input.navItems ?? []);
  const slotWidgetsBySlot = buildSlotWidgets(input.slotWidgets ?? []);
  const fieldKinds = buildUniqueMap(
    input.fieldKinds ?? [],
    "kind",
    "field kind",
  );
  const editorNodes = buildUniqueMap(
    input.editorNodes ?? [],
    "id",
    "editor node",
  );
  const actionOverrides = buildUniqueMap(
    input.actionOverrides ?? [],
    "actionId",
    "action override",
  );
  const settingsPanels = buildUniqueMap(
    input.settingsPanels ?? [],
    "id",
    "settings panel",
  );

  return {
    routes,
    navItems,
    slotWidgetsBySlot,
    fieldKinds,
    editorNodes,
    actionOverrides,
    settingsPanels,
    resolveFieldKind: (kind) => {
      const registeredKind = fieldKinds.get(kind);

      if (registeredKind) {
        return registeredKind;
      }

      options.warn?.({
        code: "UNKNOWN_FIELD_KIND",
        message: `Studio field kind "${kind}" is not registered. Falling back to the JSON editor.`,
        details: {
          requestedKind: kind,
          fallbackKind: JSON_FIELD_KIND.kind,
        },
      });

      return JSON_FIELD_KIND;
    },
  };
}
