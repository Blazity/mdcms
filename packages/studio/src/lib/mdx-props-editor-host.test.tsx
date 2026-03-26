import assert from "node:assert/strict";
import { test } from "node:test";

import type { StudioMountContext } from "@mdcms/shared";

import {
  createInitialMdxPropsEditorHostState,
  createMdxPropsEditorBindings,
  resolveMdxPropsEditorHostState,
  type PropsEditorComponentProps,
} from "./mdx-props-editor-host.js";

function createContext(
  resolvePropsEditor: NonNullable<
    StudioMountContext["mdx"]
  >["resolvePropsEditor"],
): StudioMountContext {
  return {
    apiBaseUrl: "http://localhost:4000",
    basePath: "/admin",
    auth: { mode: "cookie" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
    mdx: {
      catalog: {
        components: [],
      },
      resolvePropsEditor,
    },
  };
}

function createComponent(
  overrides: Partial<
    NonNullable<StudioMountContext["mdx"]>["catalog"]["components"][number]
  > = {},
): NonNullable<StudioMountContext["mdx"]>["catalog"]["components"][number] {
  return {
    name: "Chart",
    importPath: "@/components/mdx/Chart",
    extractedProps: {
      title: { type: "string", required: false },
    },
    ...overrides,
  };
}

test("createInitialMdxPropsEditorHostState starts in loading for components with a custom editor", () => {
  const state = createInitialMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
    }),
    context: createContext(async () => null),
    readOnly: false,
  });

  assert.deepEqual(state, {
    status: "loading",
  });
});

test("resolveMdxPropsEditorHostState returns ready with editor bindings", async () => {
  const changes: Array<Record<string, unknown>> = [];
  const Editor = (_props: PropsEditorComponentProps) => null;
  const state = await resolveMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
    }),
    context: createContext(async () => Editor),
    readOnly: false,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.editor, Editor);
  const bindings = createMdxPropsEditorBindings({
    value: { title: "Launch" },
    onChange: (nextValue) => {
      changes.push(nextValue);
    },
    readOnly: false,
  });

  assert.deepEqual(bindings.value, { title: "Launch" });
  assert.equal(bindings.readOnly, false);

  bindings.onChange({ title: "Updated" });

  assert.deepEqual(changes, [{ title: "Updated" }]);
});

test("resolveMdxPropsEditorHostState falls back to auto-form fields when no custom editor resolves", async () => {
  const state = await resolveMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
      propHints: {
        title: { widget: "textarea" },
      },
    }),
    context: createContext(async () => null),
    readOnly: false,
  });

  assert.deepEqual(state, {
    status: "auto-form",
    fields: [{ name: "title", control: "textarea", required: false }],
  });
});

test("resolveMdxPropsEditorHostState returns empty when no editor or auto-form controls exist", async () => {
  const state = await resolveMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
      extractedProps: undefined,
    }),
    context: createContext(async () => null),
    readOnly: false,
  });

  assert.deepEqual(state, {
    status: "empty",
  });
});

test("resolveMdxPropsEditorHostState returns error when the custom editor resolver rejects", async () => {
  const state = await resolveMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
    }),
    context: createContext(async () => {
      throw new Error("boom");
    }),
    readOnly: false,
  });

  assert.equal(state.status, "error");
  assert.match(state.message, /boom/);
});

test("resolveMdxPropsEditorHostState keeps custom editors on the ready path in read-only mode", async () => {
  const Editor = (_props: PropsEditorComponentProps) => null;
  const state = await resolveMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
    }),
    context: createContext(async () => Editor),
    readOnly: true,
  });

  assert.deepEqual(state, {
    status: "ready",
    editor: Editor,
  });
});

test("resolveMdxPropsEditorHostState returns forbidden when access is explicitly unavailable", async () => {
  const state = await resolveMdxPropsEditorHostState({
    component: createComponent({
      propsEditor: "@/components/mdx/Chart.editor",
    }),
    context: createContext(async () => {
      throw new Error("should not resolve");
    }),
    readOnly: true,
    forbidden: true,
  });

  assert.deepEqual(state, {
    status: "forbidden",
  });
});

test("createMdxPropsEditorBindings suppresses mutation in read-only mode", () => {
  const changes: Array<Record<string, unknown>> = [];
  const bindings = createMdxPropsEditorBindings({
    value: { title: "Launch" },
    onChange: (nextValue) => {
      changes.push(nextValue);
    },
    readOnly: true,
  });

  bindings.onChange({ title: "Updated" });

  assert.deepEqual(changes, []);
  assert.equal(bindings.readOnly, true);
});
