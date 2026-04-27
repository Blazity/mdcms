# CMS-69 TypeScript Prop Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a deterministic Node-side MDX prop extraction pipeline that turns local TypeScript component props into stable serializable `extractedProps` metadata for Studio while filtering unsupported shapes by contract.

**Architecture:** The canonical specs now define `extractedProps` as a shared serializable contract owned by `@mdcms/shared`. Implement that contract and validator in shared, add a node-only shared extractor subpath backed by the TypeScript compiler API, expose a Studio-facing prepare helper from `@mdcms/studio/runtime`, and update the Studio example/docs to pass prepared config into the client shell instead of assuming browser-time prop introspection.

**Tech Stack:** Bun, Nx, TypeScript compiler API, React, node:test, Zod, Markdown specs/READMEs

---

### Task 1: Lock the Shared Extracted-Prop Contract

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing contract tests**

Add tests in `packages/shared/src/lib/contracts/extensibility.test.ts` that
assert:

- `assertStudioMountContext(...)` accepts MDX catalog entries whose
  `extractedProps` values use only the allowed variants:
  - `{ type: "string", required: false }`
  - `{ type: "enum", required: true, values: ["bar", "line"] }`
  - `{ type: "array", required: true, items: "number" }`
  - `{ type: "json", required: false }`
  - `{ type: "rich-text", required: false }`
- invalid extracted-prop payloads are rejected:
  - unknown `type`
  - `array.items = "boolean"`
  - enum with empty `values`
  - extra keys on prop descriptors

Example accepted shape:

```ts
assert.doesNotThrow(() =>
  assertStudioMountContext({
    apiBaseUrl: "http://localhost:4000",
    basePath: "/admin",
    auth: { mode: "cookie" },
    hostBridge: validHostBridge,
    mdx: {
      catalog: {
        components: [
          {
            name: "Chart",
            importPath: "@/components/mdx/Chart",
            extractedProps: {
              title: { type: "string", required: false },
              type: {
                type: "enum",
                required: true,
                values: ["bar", "line"],
              },
            },
          },
        ],
      },
      resolvePropsEditor: () => null,
    },
  }),
);
```

**Step 2: Run the shared contract test to verify it fails**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: FAIL because `extractedProps` is still validated as
`Record<string, unknown>`.

**Step 3: Implement the shared contract**

In `packages/shared/src/lib/contracts/extensibility.ts`:

- export:
  - `MdxExtractedProp`
  - `MdxExtractedProps`
- replace the permissive `extractedProps: z.record(z.string(), z.unknown())`
  with a strict schema for the approved variants
- make enum descriptors reject empty `values`
- keep the shape strict so unsupported keys fail validation

In `packages/shared/README.md`:

- document the extracted-prop variants and the purpose of the contract

**Step 4: Run the shared contract test to verify it passes**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/README.md
git commit -m "feat(shared): define mdx extracted prop contract"
```

### Task 2: Build the Node-Only Shared TypeScript Extractor

**Files:**

- Create: `packages/shared/src/lib/mdx/extracted-props.ts`
- Create: `packages/shared/src/lib/mdx/extracted-props.test.ts`
- Create: `packages/shared/src/lib/mdx/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing extractor fixture tests**

Add fixture-driven tests in `packages/shared/src/lib/mdx/extracted-props.test.ts`
that create temporary `.tsx` files and assert:

- supported props extract correctly:
  - `title?: string`
  - `count: number`
  - `published: boolean`
  - `type: "bar" | "line"`
  - `data: number[]`
  - `tags?: string[]`
  - `children?: ReactNode`
- unsupported props are omitted:
  - `onClick?: () => void`
  - `forwardedRef?: Ref<HTMLDivElement>`
  - `options: Record<string, string>`
  - `pair: [number, number]`
- `json` hint opt-in re-enables a JSON-serializable object shape:
  - `options: { theme: string; compact: boolean }` plus
    `propHints.options = { widget: "json" }` =>
    `{ type: "json", required: true }`
- non-serializable `json` opt-in still fails closed:
  - `handlerMap: Record<string, () => void>` stays omitted even with `json`
- requiredness follows declared TypeScript only:
  - `title?: string` => `required: false`
  - `title: string | undefined` => `required: false`
  - destructuring default values do not change the extracted `required` flag

Example expected output:

```ts
assert.deepEqual(result, {
  title: { type: "string", required: false },
  type: { type: "enum", required: true, values: ["bar", "line"] },
  data: { type: "array", required: true, items: "number" },
});
```

**Step 2: Run the extractor test to verify it fails**

Run: `bun test packages/shared/src/lib/mdx/extracted-props.test.ts`

Expected: FAIL because the extractor module does not exist yet.

**Step 3: Implement the extractor**

In `packages/shared/src/lib/mdx/extracted-props.ts`:

- use the TypeScript compiler API to:
  - create/load a `Program`
  - resolve the component source file from an absolute path
  - find the exported component symbol
  - resolve its props type from function params or a declared props interface
- expose a narrow API such as:

```ts
export function extractMdxComponentProps(input: {
  filePath: string;
  componentName: string;
  propHints?: Record<string, unknown>;
  tsconfigPath?: string;
}): MdxExtractedProps;
```

- normalize only the supported shapes
- omit everything else
- treat `json` opt-in as allowed only for JSON-serializable shapes
- add short comments only around the non-obvious TypeScript symbol/type walking

In `packages/shared/src/lib/mdx/index.ts`:

- re-export the extractor API

In `packages/shared/package.json`:

- add a node-oriented export such as `./mdx`
- add `typescript` as a package dependency if the extractor imports it at runtime

In `packages/shared/README.md`:

- document the node-only extractor subpath briefly

**Step 4: Run the extractor and contract tests**

Run: `bun test packages/shared/src/lib/mdx/extracted-props.test.ts packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/mdx/extracted-props.ts packages/shared/src/lib/mdx/extracted-props.test.ts packages/shared/src/lib/mdx/index.ts packages/shared/package.json packages/shared/README.md
git commit -m "feat(shared): add mdx prop extraction helper"
```

### Task 3: Add a Studio Runtime Prepare Helper and Typed Consumption Path

**Files:**

- Modify: `packages/studio/src/lib/studio.ts`
- Modify: `packages/studio/src/lib/studio.test.ts`
- Modify: `packages/studio/src/lib/studio-loader.ts`
- Modify: `packages/studio/src/lib/studio-loader.test.ts`
- Modify: `packages/studio/README.md`

**Step 1: Write the failing Studio tests**

Add tests that assert:

- `@mdcms/studio/runtime` exposes a prepare helper that enriches component
  entries with typed `extractedProps`
- the prepare helper accepts authored config plus workspace context
- `loadStudioRuntime(...)` reads typed `extractedProps` without the current
  `as { extractedProps?: unknown }` escape hatch

Suggested test shape in `packages/studio/src/lib/studio.test.ts`:

```ts
test("prepareStudioConfig enriches mdx component metadata from source files", async () => {
  const config = await prepareStudioConfig(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
      components: [
        {
          name: "Chart",
          importPath: "@/components/mdx/Chart",
        },
      ],
    },
    {
      cwd: fixtureDir,
      resolveImportPath: (value) =>
        value === "@/components/mdx/Chart"
          ? join(fixtureDir, "Chart.tsx")
          : value,
    },
  );

  assert.deepEqual(config.components?.[0]?.extractedProps, {
    title: { type: "string", required: false },
  });
});
```

And in `packages/studio/src/lib/studio-loader.test.ts`:

- remove the cast-based fake component shape and assert the loader accepts the
  prepared typed config directly

**Step 2: Run the Studio tests to verify they fail**

Run: `bun test packages/studio/src/lib/studio.test.ts packages/studio/src/lib/studio-loader.test.ts`

Expected: FAIL because there is no prepare helper and the config types do not
carry extracted props explicitly.

**Step 3: Implement the Studio prepare helper and loader typing**

In `packages/studio/src/lib/studio.ts`:

- add a server-safe helper such as:

```ts
export async function prepareStudioConfig(
  config: SharedMdcmsConfig,
  options: {
    cwd: string;
    resolveImportPath?: (value: string) => string;
    tsconfigPath?: string;
  },
): Promise<MdcmsConfig>;
```

- internally call the shared node-only extractor for each component entry
- preserve authored loader callbacks and other config metadata
- require/validate `environment` before returning the prepared config

In `packages/studio/src/lib/studio-loader.ts`:

- replace the untyped `readExtractedProps(...)` cast with direct typed access
- keep the runtime consuming only serializable metadata plus local executable
  resolvers

In `packages/studio/README.md`:

- update the MDX-aware embed example to show:
  - server-side `prepareStudioConfig(...)`
  - client-side `<Studio config={preparedConfig} ... />`
- keep the plain runtime-helper story accurate

**Step 4: Run the Studio tests to verify they pass**

Run: `bun test packages/studio/src/lib/studio.test.ts packages/studio/src/lib/studio-loader.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/studio.ts packages/studio/src/lib/studio.test.ts packages/studio/src/lib/studio-loader.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/README.md
git commit -m "feat(studio): prepare mdx component props locally"
```

### Task 4: Wire the Example App and Run Verification

**Files:**

- Modify: `apps/studio-example/app/admin/[[...path]]/page.tsx`
- Optional create: `apps/studio-example/app/admin/admin-studio-client.tsx`
- Optional modify: `apps/studio-example/mdcms.config.ts`
- Reference: `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- Reference: `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

**Step 1: Write the failing example integration assertion**

Add or update a lightweight test/contract assertion that the example app can:

- load raw authored config on the server side
- prepare it before passing it to the client `Studio` shell

If there is no dedicated example test yet, add a type-level assertion in
`packages/studio/src/lib/studio.test.ts` or a focused smoke check in the example
route source.

**Step 2: Run the relevant Studio/example tests to verify they fail**

Run: `bun test packages/studio/src/lib/studio.test.ts`

Expected: FAIL until the example/docs use the new helper path consistently.

**Step 3: Update the example integration**

In the example app:

- keep the route itself server-side
- call `prepareStudioConfig(...)`
- pass the result into a small client wrapper that renders `<Studio />`

Keep the example minimal; it only needs to demonstrate the supported host-app
integration boundary.

**Step 4: Run targeted verification**

Run:

```bash
bun test packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/mdx/extracted-props.test.ts
bun test packages/studio/src/lib/studio.test.ts packages/studio/src/lib/studio-loader.test.ts
bun run format:check
bun run check
```

Expected:

- all targeted shared/studio tests PASS
- `bun run format:check` PASS
- `bun run check` PASS

**Step 5: Commit**

```bash
git add apps/studio-example/app/admin/[[...path]]/page.tsx apps/studio-example/app/admin/admin-studio-client.tsx apps/studio-example/mdcms.config.ts
git commit -m "docs(example): prepare studio config for mdx props"
```
