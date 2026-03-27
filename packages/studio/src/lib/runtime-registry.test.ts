import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  buildStudioRuntimeRegistry,
  type StudioRegistryWarning,
} from "./runtime-registry.js";

function noop() {
  return null;
}

test("buildStudioRuntimeRegistry rejects normalized route path conflicts", () => {
  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        routes: [
          { id: "settings.index", path: "/settings", render: noop },
          { id: "settings.trailing", path: "/settings/", render: noop },
        ],
      }),
    /normalized route path/i,
  );

  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        routes: [
          { id: "content.by-type", path: "/content/:type", render: noop },
          { id: "content.by-kind", path: "/content/:kind", render: noop },
        ],
      }),
    /normalized route path/i,
  );
});

test("buildStudioRuntimeRegistry requires explicit slot widget priority and sorts deterministically", () => {
  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        slotWidgets: [
          {
            id: "toolbar.publish",
            slotId: "content.list.toolbar",
            render: noop,
          },
        ],
      }),
    /priority/i,
  );

  const registry = buildStudioRuntimeRegistry({
    slotWidgets: [
      {
        id: "toolbar.sort",
        slotId: "content.list.toolbar",
        priority: 10,
        render: noop,
      },
      {
        id: "toolbar.filter",
        slotId: "content.list.toolbar",
        priority: 20,
        render: noop,
      },
      {
        id: "toolbar.bulk",
        slotId: "content.list.toolbar",
        priority: 10,
        render: noop,
      },
    ],
  });

  assert.deepEqual(
    registry.slotWidgetsBySlot.get("content.list.toolbar")?.map(({ id }) => id),
    ["toolbar.filter", "toolbar.bulk", "toolbar.sort"],
  );
});

test("buildStudioRuntimeRegistry rejects duplicate surface registrations", () => {
  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        fieldKinds: [
          { kind: "slug", render: noop },
          { kind: "slug", render: noop },
        ],
      }),
    /field kind/i,
  );

  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        editorNodes: [
          { id: "mdx.component", render: noop },
          { id: "mdx.component", render: noop },
        ],
      }),
    /editor node/i,
  );

  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        actionOverrides: [
          { actionId: "content.publish", render: noop },
          { actionId: "content.publish", render: noop },
        ],
      }),
    /action override/i,
  );

  assert.throws(
    () =>
      buildStudioRuntimeRegistry({
        settingsPanels: [
          { id: "general", title: "General", render: noop },
          { id: "general", title: "General 2", render: noop },
        ],
      }),
    /settings panel/i,
  );
});

test("buildStudioRuntimeRegistry falls back to json field kind and warns when a field kind is unknown", () => {
  const warnings: StudioRegistryWarning[] = [];
  const registry = buildStudioRuntimeRegistry(
    {
      fieldKinds: [{ kind: "slug", render: noop }],
    },
    {
      warn: (warning) => {
        warnings.push(warning);
      },
    },
  );

  const knownKind = registry.resolveFieldKind("slug");
  const fallbackKind = registry.resolveFieldKind("portable-unknown");

  assert.equal(knownKind.kind, "slug");
  assert.equal(fallbackKind.kind, "json");
  assert.deepEqual(warnings, [
    {
      code: "UNKNOWN_FIELD_KIND",
      message:
        'Studio field kind "portable-unknown" is not registered. Falling back to the JSON editor.',
      details: {
        requestedKind: "portable-unknown",
        fallbackKind: "json",
      },
    },
  ]);
});
