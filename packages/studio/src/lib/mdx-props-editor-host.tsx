import {
  Component,
  Fragment,
  createElement,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { StudioMountContext } from "@mdcms/shared";
import {
  createMdxAutoFormFields,
  type MdxAutoFormField,
} from "@mdcms/shared/mdx";

type MdxCatalogComponent = NonNullable<
  StudioMountContext["mdx"]
>["catalog"]["components"][number];

export type PropsEditorValue = Record<string, unknown>;
export type PropsEditorChangeHandler = (nextValue: PropsEditorValue) => void;
export type PropsEditorComponentProps = {
  value: PropsEditorValue;
  onChange: PropsEditorChangeHandler;
  readOnly: boolean;
};
export type PropsEditorComponent = (
  props: PropsEditorComponentProps,
) => ReactNode;

export type MdxPropsEditorHostState =
  | { status: "loading" }
  | { status: "ready"; editor: PropsEditorComponent }
  | { status: "auto-form"; fields: MdxAutoFormField[] }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "forbidden" };

type MdxPropsEditorHostStateInput = {
  component: MdxCatalogComponent;
  context: StudioMountContext;
  readOnly: boolean;
};

type PropsEditorRenderBoundaryProps = {
  componentName: string;
  children: ReactNode;
};

type PropsEditorRenderBoundaryState = {
  hasError: boolean;
};

class PropsEditorRenderBoundary extends Component<
  PropsEditorRenderBoundaryProps,
  PropsEditorRenderBoundaryState
> {
  override state: PropsEditorRenderBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): PropsEditorRenderBoundaryState {
    return {
      hasError: true,
    };
  }

  override componentDidUpdate(prevProps: PropsEditorRenderBoundaryProps): void {
    if (
      prevProps.componentName !== this.props.componentName &&
      this.state.hasError
    ) {
      this.setState({ hasError: false });
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <span
          data-mdcms-mdx-props-editor-state={`${this.props.componentName}:error`}
        >
          Custom editor failed to render.
        </span>
      );
    }

    return this.props.children;
  }
}

export type MdxPropsEditorHostProps = {
  component: MdxCatalogComponent;
  context: StudioMountContext;
  initialValue?: PropsEditorValue;
  readOnly?: boolean;
};

export function createMdxPropsEditorBindings(input: {
  value: PropsEditorValue;
  onChange: PropsEditorChangeHandler;
  readOnly: boolean;
}): PropsEditorComponentProps {
  return {
    value: input.value,
    readOnly: input.readOnly,
    onChange: (nextValue) => {
      if (input.readOnly) {
        return;
      }

      input.onChange(nextValue);
    },
  };
}

export function createInitialMdxPropsEditorHostState(
  input: MdxPropsEditorHostStateInput,
): MdxPropsEditorHostState {
  if (input.readOnly) {
    return { status: "forbidden" };
  }

  if (!input.component.propsEditor || !input.context.mdx) {
    return createFallbackState(input.component);
  }

  return { status: "loading" };
}

export async function resolveMdxPropsEditorHostState(
  input: MdxPropsEditorHostStateInput,
): Promise<MdxPropsEditorHostState> {
  const initialState = createInitialMdxPropsEditorHostState(input);

  if (initialState.status !== "loading") {
    return initialState;
  }

  try {
    const resolvedEditor = await input.context.mdx?.resolvePropsEditor(
      input.component.name,
    );

    if (!resolvedEditor) {
      return createFallbackState(input.component);
    }

    if (typeof resolvedEditor !== "function") {
      return {
        status: "error",
        message: `Custom editor for "${input.component.name}" must resolve to a function component.`,
      };
    }

    return {
      status: "ready",
      editor: resolvedEditor as PropsEditorComponent,
    };
  } catch (error) {
    return {
      status: "error",
      message: formatPropsEditorError(error),
    };
  }
}

export function MdxPropsEditorHost({
  component,
  context,
  initialValue,
  readOnly = false,
}: MdxPropsEditorHostProps) {
  const [state, setState] = useState<MdxPropsEditorHostState>(() =>
    createInitialMdxPropsEditorHostState({
      component,
      context,
      readOnly,
    }),
  );
  const [value, setValue] = useState<PropsEditorValue>(
    () => initialValue ?? {},
  );

  useEffect(() => {
    setValue(initialValue ?? {});
  }, [component.name, initialValue]);

  useEffect(() => {
    let cancelled = false;
    const input = {
      component,
      context,
      readOnly,
    };
    const initialState = createInitialMdxPropsEditorHostState(input);

    setState(initialState);

    if (initialState.status !== "loading") {
      return;
    }

    void resolveMdxPropsEditorHostState(input).then((resolvedState) => {
      if (!cancelled) {
        setState(resolvedState);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [component, context, readOnly]);

  switch (state.status) {
    case "loading":
      return (
        <span data-mdcms-mdx-props-editor-state={`${component.name}:loading`}>
          Loading custom editor.
        </span>
      );
    case "ready": {
      const bindings = createMdxPropsEditorBindings({
        value,
        onChange: setValue,
        readOnly,
      });

      return (
        <Fragment>
          <span data-mdcms-mdx-props-editor-state={`${component.name}:ready`}>
            Custom editor ready.
          </span>
          <span data-mdcms-mdx-props-editor={component.name}>
            Custom editor
          </span>
          <PropsEditorRenderBoundary componentName={component.name}>
            <div data-mdcms-mdx-props-editor-surface={component.name}>
              {createElement(state.editor, bindings)}
            </div>
          </PropsEditorRenderBoundary>
        </Fragment>
      );
    }
    case "auto-form":
      return renderAutoFormFields(component.name, state.fields);
    case "empty":
      return (
        <span data-mdcms-mdx-props-editor-state={`${component.name}:empty`}>
          No editable props.
        </span>
      );
    case "error":
      return (
        <span data-mdcms-mdx-props-editor-state={`${component.name}:error`}>
          {state.message}
        </span>
      );
    case "forbidden":
      return (
        <span data-mdcms-mdx-props-editor-state={`${component.name}:forbidden`}>
          Editing is unavailable.
        </span>
      );
  }
}

function createFallbackState(
  component: MdxCatalogComponent,
): MdxPropsEditorHostState {
  const fields = createMdxAutoFormFields(
    component.extractedProps,
    component.propHints,
  );

  return fields.length > 0
    ? { status: "auto-form", fields }
    : { status: "empty" };
}

function renderAutoFormFields(
  componentName: string,
  fields: MdxAutoFormField[],
): ReactNode {
  return (
    <Fragment>
      <span data-mdcms-mdx-auto-form={componentName}>Auto form</span>
      {fields.map((field) => (
        <span
          key={`${componentName}:${field.name}:${field.control}`}
          data-mdcms-mdx-auto-control={`${componentName}:${field.name}:${field.control}`}
        />
      ))}
    </Fragment>
  );
}

function formatPropsEditorError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const message = String(error).trim();

  return message.length > 0 ? message : "Failed to load custom editor.";
}
