# CMS-70 Prop Type to Form Control Mapping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a shared, deterministic MDX prop-to-form-control mapping layer that converts extracted local component prop metadata into reusable auto-form field definitions, including URL-formatted string handling, while keeping widget overrides out of scope for this task.

**Architecture:** Apply the missing product contract first in `SPEC-007`, then extend the shared extracted-prop contract so string props can carry `format: "url"`. Build a pure shared mapping helper in `@mdcms/shared/mdx` that turns extracted props into explicit auto-form fields for the CMS-70 mappings only, and have Studio consume that helper in its diagnostics/test surface instead of treating any non-empty `extractedProps` object as an auto-form signal.

**Tech Stack:** Bun, Nx, TypeScript, node:test, Zod, React, Markdown specs/READMEs

---

### Task 1: Apply the Owning Spec Delta

**Files:**

- Modify: `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

**Step 1: Update the spec prose before code**

Edit `docs/specs/SPEC-007-editor-mdx-and-collaboration.md` so it explicitly
defines:

- `propHints.<propName>.format = "url"` as the URL intent signal
- `MdxExtractedProp` string descriptors may carry optional `format: "url"`
- `{ type: "string", format: "url" }` maps to a URL input with validation
- this is not a widget and does not expand the widget list in the later
  override section

Suggested contract snippet:

```ts
export type MdxExtractedProp =
  | { type: "string"; required: boolean; format?: "url" }
  | { type: "number"; required: boolean }
  | { type: "boolean"; required: boolean }
  | { type: "date"; required: boolean }
  | { type: "enum"; required: boolean; values: string[] }
  | { type: "array"; required: boolean; items: "string" | "number" }
  | { type: "json"; required: boolean }
  | { type: "rich-text"; required: boolean };
```

**Step 2: Verify the spec wording matches the approved direction**

Run: `rg -n "format: \"url\"|URL input with validation|not a widget" docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

Expected: the owning spec now contains all three concepts.

**Step 3: Commit**

```bash
git add docs/specs/SPEC-007-editor-mdx-and-collaboration.md
git commit -m "docs(specs): clarify mdx url format mapping"
```

### Task 2: Extend the Shared Extracted-Prop Contract

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing contract tests**

Add tests in `packages/shared/src/lib/contracts/extensibility.test.ts` that
assert:

- a string descriptor with `format: "url"` is accepted
- non-string descriptors with `format: "url"` are rejected
- unsupported format values are rejected
- existing valid descriptors still pass unchanged

Example accepted payload:

```ts
extractedProps: {
  website: {
    type: "string",
    required: false,
    format: "url",
  },
}
```

Example rejected payloads:

```ts
extractedProps: {
  publishedAt: {
    type: "date",
    required: false,
    format: "url",
  },
}
```

```ts
extractedProps: {
  title: {
    type: "string",
    required: true,
    format: "email",
  },
}
```

**Step 2: Run the contract test to verify it fails**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: FAIL because the validator does not permit `format` on string props
yet.

**Step 3: Implement the contract change**

In `packages/shared/src/lib/contracts/extensibility.ts`:

- extend the `MdxExtractedProp` TypeScript union so only string props can carry
  optional `format: "url"`
- update the Zod schema for extracted props to mirror that shape strictly
- keep all descriptor objects strict so extra keys still fail validation

In `packages/shared/README.md`:

- document the string `format: "url"` option and clarify that it drives default
  auto-form behavior rather than the widget override system

**Step 4: Run the contract test to verify it passes**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/README.md
git commit -m "feat(shared): add mdx string format metadata"
```

### Task 3: Preserve URL Format During Prop Extraction

**Files:**

- Modify: `packages/shared/src/lib/mdx/extracted-props.ts`
- Modify: `packages/shared/src/lib/mdx/extracted-props.test.ts`

**Step 1: Write the failing extraction tests**

Add tests in `packages/shared/src/lib/mdx/extracted-props.test.ts` that cover:

- `string` prop plus `propHints.website = { format: "url" }` extracts as
  `{ type: "string", required: ..., format: "url" }`
- the same hint on `number`, `date`, `enum`, `array`, or `rich-text` is ignored
- unsupported hint values do not leak into extracted output

Example fixture:

```tsx
export interface LinkCardProps {
  title: string;
  website?: string;
}

export function LinkCard(_props: LinkCardProps) {
  return null;
}
```

Example expected output:

```ts
{
  title: { type: "string", required: true },
  website: { type: "string", required: false, format: "url" },
}
```

**Step 2: Run the extractor test to verify it fails**

Run: `bun test packages/shared/src/lib/mdx/extracted-props.test.ts`

Expected: FAIL because extracted string props do not preserve `format` yet.

**Step 3: Implement the extraction logic**

In `packages/shared/src/lib/mdx/extracted-props.ts`:

- add a narrow helper such as `getStringFormat(propHint)` that returns `"url"`
  only when:
  - the hint is an object
  - `format === "url"`
- apply that helper only inside the `string` normalization branch
- ignore `format` hints for all non-string normalized prop shapes

Keep the function fail-closed. Invalid or irrelevant hints should not throw and
should not alter the extracted descriptor.

**Step 4: Run the extractor and contract tests**

Run: `bun test packages/shared/src/lib/mdx/extracted-props.test.ts packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/mdx/extracted-props.ts packages/shared/src/lib/mdx/extracted-props.test.ts
git commit -m "feat(shared): preserve mdx url string hints"
```

### Task 4: Add the Shared Auto-Form Mapping Helper

**Files:**

- Create: `packages/shared/src/lib/mdx/auto-form.ts`
- Create: `packages/shared/src/lib/mdx/auto-form.test.ts`
- Modify: `packages/shared/src/lib/mdx/index.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing mapping tests**

Create `packages/shared/src/lib/mdx/auto-form.test.ts` with coverage for all
CMS-70 mappings:

- `string` -> `text`
- `string` + `format: "url"` -> `url`
- `number` -> `number`
- `boolean` -> `boolean`
- `enum` -> `select`
- `array:string` -> `string-list`
- `array:number` -> `number-list`
- `date` -> `date`
- `rich-text` -> `rich-text`

Also assert:

- field output is deterministic and preserves input property iteration order
- `json` extracted props are omitted for now
- empty input returns `[]`

Suggested public shape:

```ts
type MdxAutoFormField =
  | { name: string; control: "text"; required: boolean }
  | { name: string; control: "url"; required: boolean }
  | { name: string; control: "number"; required: boolean }
  | { name: string; control: "boolean"; required: boolean }
  | { name: string; control: "select"; required: boolean; options: string[] }
  | { name: string; control: "string-list"; required: boolean }
  | { name: string; control: "number-list"; required: boolean }
  | { name: string; control: "date"; required: boolean }
  | { name: string; control: "rich-text"; required: boolean };
```

**Step 2: Run the mapping test to verify it fails**

Run: `bun test packages/shared/src/lib/mdx/auto-form.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Implement the mapping helper**

In `packages/shared/src/lib/mdx/auto-form.ts`:

- export the `MdxAutoFormField` type
- export a pure function such as:

```ts
export function createMdxAutoFormFields(
  extractedProps: MdxExtractedProps | undefined,
): MdxAutoFormField[];
```

- switch on each extracted prop variant and return the mapped control
- skip `json` props for this task so CMS-71 can own the widget override path
- preserve deterministic order by iterating `Object.entries(extractedProps)`

In `packages/shared/src/lib/mdx/index.ts`:

- export the new helper/types

In `packages/shared/README.md`:

- add a short section describing `createMdxAutoFormFields(...)` and the default
  controls it emits

**Step 4: Run the shared MDX tests**

Run: `bun test packages/shared/src/lib/mdx/extracted-props.test.ts packages/shared/src/lib/mdx/auto-form.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/mdx/auto-form.ts packages/shared/src/lib/mdx/auto-form.test.ts packages/shared/src/lib/mdx/index.ts packages/shared/README.md
git commit -m "feat(shared): add mdx auto form mapping"
```

### Task 5: Wire the Shared Mapper into Studio Diagnostics

**Files:**

- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`

**Step 1: Write the failing Studio test**

Update `packages/studio/src/lib/remote-studio-app.test.ts` so the document-route
diagnostics assert explicit mapped control metadata rather than only the
presence of `extractedProps`.

For example, expect rendered markers such as:

```html
<span data-mdcms-mdx-auto-form="Chart">Auto form</span>
<span data-mdcms-mdx-auto-control="Chart:title:text"></span>
<span data-mdcms-mdx-auto-control="Chart:website:url"></span>
```

Also add a component whose extracted props contain only `json` and assert it
does not render the auto-form marker yet.

**Step 2: Run the Studio test to verify it fails**

Run: `bun test packages/studio/src/lib/remote-studio-app.test.ts`

Expected: FAIL because the runtime currently treats any non-empty
`extractedProps` object as an auto-form signal.

**Step 3: Implement the Studio consumer**

In `packages/studio/src/lib/remote-studio-app.tsx`:

- import `createMdxAutoFormFields` from `@mdcms/shared/mdx`
- replace `hasGeneratedPropsEditor(...)` with a helper that builds mapped fields
  and checks `fields.length > 0`
- expose the mapped control kinds on the hidden diagnostics surface so the test
  can prove Studio is using the shared mapping contract

Keep this diagnostic-only. Do not build the full props form UI in this task.

**Step 4: Run the Studio test to verify it passes**

Run: `bun test packages/studio/src/lib/remote-studio-app.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts
git commit -m "feat(studio): consume mdx auto form mappings"
```

### Task 6: Run End-to-End Verification

**Files:**

- Modify: none

**Step 1: Run focused package tests**

Run:

```bash
bun test packages/shared/src/lib/contracts/extensibility.test.ts
bun test packages/shared/src/lib/mdx/extracted-props.test.ts
bun test packages/shared/src/lib/mdx/auto-form.test.ts
bun test packages/studio/src/lib/remote-studio-app.test.ts
```

Expected: all PASS

**Step 2: Run workspace formatting check**

Run: `bun run format:check`

Expected: PASS

**Step 3: Run workspace baseline check**

Run: `bun run check`

Expected: PASS

**Step 4: Inspect git status**

Run: `git status --short`

Expected:

- only CMS-70 code/spec files are staged or modified
- local-only files remain unstaged and uncommitted:
  - `AGENTS.md`
  - `ROADMAP_TASKS.md`
  - `docs/plans/`

**Step 5: Final commit**

```bash
git add docs/specs/SPEC-007-editor-mdx-and-collaboration.md packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/mdx/extracted-props.ts packages/shared/src/lib/mdx/extracted-props.test.ts packages/shared/src/lib/mdx/auto-form.ts packages/shared/src/lib/mdx/auto-form.test.ts packages/shared/src/lib/mdx/index.ts packages/shared/README.md packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts
git commit -m "feat(shared): map mdx props to auto form controls"
```
