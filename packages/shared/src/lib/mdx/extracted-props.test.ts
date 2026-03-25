import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { extractMdxComponentProps } from "./extracted-props.js";

async function withTempDir<T>(
  prefix: string,
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), prefix));

  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeComponentFile(
  directory: string,
  filename: string,
  source: string,
): Promise<string> {
  const filePath = join(directory, filename);
  await writeFile(filePath, source, "utf8");
  return filePath;
}

test("extractMdxComponentProps extracts supported prop shapes", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "Chart.tsx",
      `
        type ReactNode = string | number | boolean | null;

        export interface ChartProps {
          title?: string;
          count: number;
          published: boolean;
          kind: "bar" | "line";
          data: number[];
          tags?: string[];
          children?: ReactNode;
        }

        export function Chart(_props: ChartProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "Chart",
      }),
      {
        title: { type: "string", required: false },
        count: { type: "number", required: true },
        published: { type: "boolean", required: true },
        kind: { type: "enum", required: true, values: ["bar", "line"] },
        data: { type: "array", required: true, items: "number" },
        tags: { type: "array", required: false, items: "string" },
        children: { type: "rich-text", required: false },
      },
    );
  });
});

test("extractMdxComponentProps omits unsupported prop shapes", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "Widget.tsx",
      `
        type HTMLDivElement = { tag: "div" };
        type Ref<T> = { current: T | null } | ((value: T | null) => void) | null;

        export interface WidgetProps {
          onClick?: () => void;
          forwardedRef?: Ref<HTMLDivElement>;
          options: Record<string, string>;
          pair: [number, number];
        }

        export function Widget(_props: WidgetProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "Widget",
      }),
      {},
    );
  });
});

test("extractMdxComponentProps allows json hinted serializable object props", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "Panel.tsx",
      `
        export interface PanelProps {
          options: {
            theme: string;
            compact: boolean;
          };
        }

        export function Panel(_props: PanelProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "Panel",
        propHints: {
          options: {
            widget: "json",
          },
        },
      }),
      {
        options: { type: "json", required: true },
      },
    );
  });
});

test("extractMdxComponentProps preserves url format hints on string props only", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "LinkCard.tsx",
      `
        export interface LinkCardProps {
          title: string;
          website?: string;
          count: number;
          publishedAt: Date;
          kind: "bar" | "line";
          tags: string[];
          children: string;
        }

        export function LinkCard(_props: LinkCardProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "LinkCard",
        propHints: {
          website: { format: "url" },
          count: { format: "url" },
          publishedAt: { format: "url" },
          kind: { format: "url" },
          tags: { format: "url" },
          children: { format: "url" },
          title: { format: "email" },
        },
      }),
      {
        title: { type: "string", required: true },
        website: { type: "string", required: false, format: "url" },
        count: { type: "number", required: true },
        publishedAt: { type: "date", required: true },
        kind: { type: "enum", required: true, values: ["bar", "line"] },
        tags: { type: "array", required: true, items: "string" },
        children: { type: "rich-text", required: true },
      },
    );
  });
});

test("extractMdxComponentProps keeps non-serializable json hinted props hidden", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "UnsafePanel.tsx",
      `
        export interface UnsafePanelProps {
          handlerMap: Record<string, () => void>;
        }

        export function UnsafePanel(_props: UnsafePanelProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "UnsafePanel",
        propHints: {
          handlerMap: {
            widget: "json",
          },
        },
      }),
      {},
    );
  });
});

test("extractMdxComponentProps derives requiredness from declared prop types only", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "Optionality.tsx",
      `
        export interface OptionalityProps {
          title: string | undefined;
          subtitle?: string;
        }

        export function Optionality({
          title = "fallback",
          subtitle,
        }: OptionalityProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "Optionality",
      }),
      {
        title: { type: "string", required: false },
        subtitle: { type: "string", required: false },
      },
    );
  });
});

test("extractMdxComponentProps does not treat non-ref names containing Ref as refs", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "PreferenceRefCard.tsx",
      `
        export enum PreferenceRef {
          primary = "primary",
          secondary = "secondary",
        }

        export interface PreferenceRefCardProps {
          preferenceRef: PreferenceRef;
        }

        export function PreferenceRefCard(_props: PreferenceRefCardProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "PreferenceRefCard",
      }),
      {
        preferenceRef: {
          type: "enum",
          required: true,
          values: ["primary", "secondary"],
        },
      },
    );
  });
});

test("extractMdxComponentProps only treats children as rich text when the type is renderable", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "StructuredChildren.tsx",
      `
        export interface StructuredChildrenProps {
          children: string[];
        }

        export function StructuredChildren(_props: StructuredChildrenProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "StructuredChildren",
      }),
      {
        children: { type: "array", required: true, items: "string" },
      },
    );
  });
});

test("extractMdxComponentProps keeps optional string-literal enums", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "OptionalEnum.tsx",
      `
        export interface OptionalEnumProps {
          kind?: "bar" | "line";
        }

        export function OptionalEnum(_props: OptionalEnumProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "OptionalEnum",
      }),
      {
        kind: {
          type: "enum",
          required: false,
          values: ["bar", "line"],
        },
      },
    );
  });
});

test("extractMdxComponentProps reads props from exported class components", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "ClassChart.tsx",
      `
        class Component<Props> {
          props!: Props;
        }

        export interface ClassChartProps {
          title: string;
        }

        export class ClassChart extends Component<ClassChartProps> {}
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "ClassChart",
      }),
      {
        title: { type: "string", required: true },
      },
    );
  });
});

test("extractMdxComponentProps honors tsconfigPath when loading compiler options", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "ConfiguredChart.tsx",
      `
        export interface ConfiguredChartProps {
          title?: string;
        }

        export function ConfiguredChart(_props: ConfiguredChartProps) {
          return null;
        }
      `,
    );
    const tsconfigPath = join(directory, "tsconfig.json");

    await writeFile(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            jsx: "react-jsx",
            strict: true,
          },
          include: ["./ConfiguredChart.tsx"],
        },
        null,
        2,
      ),
      "utf8",
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "ConfiguredChart",
        tsconfigPath,
      }),
      {
        title: { type: "string", required: false },
      },
    );
  });
});

test("extractMdxComponentProps falls back to a default export when names do not match", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "DefaultChart.tsx",
      `
        interface DefaultChartProps {
          title?: string;
        }

        export default function DefaultChart(_props: DefaultChartProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "Chart",
      }),
      {
        title: { type: "string", required: false },
      },
    );
  });
});

test("extractMdxComponentProps falls back to the only exported callable when names do not match", async () => {
  await withTempDir("mdcms-extracted-props-", async (directory) => {
    const filePath = await writeComponentFile(
      directory,
      "HeroModule.tsx",
      `
        interface MarketingHeroProps {
          title?: string;
        }

        export function MarketingHero(_props: MarketingHeroProps) {
          return null;
        }
      `,
    );

    assert.deepEqual(
      extractMdxComponentProps({
        filePath,
        componentName: "Hero",
      }),
      {
        title: { type: "string", required: false },
      },
    );
  });
});
