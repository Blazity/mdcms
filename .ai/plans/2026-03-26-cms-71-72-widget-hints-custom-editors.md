# CMS-71 and CMS-72 Widget Hints and Custom Editors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the shared widget-hint override contract and the Studio custom props editor lifecycle so local MDX component metadata can drive validated auto-form overrides and lazily resolved custom editors with deterministic UI states.

**Architecture:** Update `SPEC-007` first so the product contract explicitly defines typed `propHints`, precedence, validation rules, async custom-editor resolution, and lifecycle states. Then extend `@mdcms/shared` to type and validate widget hints and map them into explicit field controls. Finally, update `@mdcms/studio` to treat props editor resolution as an async lifecycle, render the required state surfaces on the document route, and prove `value` / `onChange` behavior with targeted runtime tests without pulling in full `CMS-74` node-view work.

**Tech Stack:** Bun, Nx, TypeScript, node:test, Zod, React, Markdown specs/READMEs

---

### Task 1: Apply the Owning Spec Delta

**Files:**

- Modify: `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

**Step 1: Update the spec before code**

Add the approved contract language for:

- typed `MdxPropHint`
- `propHints` validation rules
- precedence between `propsEditor`, widget overrides, and default controls
- async `resolvePropsEditor(...)`
- custom props editor lifecycle states
- `value`, `onChange`, and `readOnly`

**Step 2: Verify the spec wording**

Run: `rg -n "MdxPropHint|resolvePropsEditor|loading|empty|error|forbidden|Widget-hint precedence" docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

Expected: all required lifecycle and precedence concepts are present in the owning spec.

### Task 2: Add Shared Widget Hint Types and Validators

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing contract tests**

Add coverage for:

- accepted `propHints` shapes for all 7 widgets plus `{ format: "url" }`
- rejected mixed `{ format, widget }` shapes
- rejected invalid slider config
- rejected empty `select.options`
- rejected invalid option value types

**Step 2: Run the contract test to verify it fails**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: FAIL because `propHints` is still opaque.

**Step 3: Implement the shared contract**

Add:

- `MdxSelectOptionValue`
- `MdxSelectOption`
- `MdxPropHint`
- typed `propHints?: Record<string, MdxPropHint>`
- strict Zod validation for `catalog.components[*].propHints`

Update the README with the supported widget-hint contract and precedence notes.

**Step 4: Re-run the contract test**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: PASS

### Task 3: Extend the Shared Auto-Form Mapper for Overrides

**Files:**

- Modify: `packages/shared/src/lib/mdx/auto-form.ts`
- Modify: `packages/shared/src/lib/mdx/auto-form.test.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing mapper tests**

Cover:

- default mapping still works unchanged when `propHints` is missing
- each widget override emits the expected control
- `hidden` omits the field
- valid widget overrides take precedence over default mapping
- invalid or incompatible hints throw deterministic validation errors
- JSON widget emits a JSON field instead of being skipped

**Step 2: Run the mapper test to verify it fails**

Run: `bun test packages/shared/src/lib/mdx/auto-form.test.ts`

Expected: FAIL because the helper does not accept or honor widget hints.

**Step 3: Implement the override mapper**

Update the public field union and mapping helper to accept:

- `extractedProps`
- `propHints`

Validate per-prop hint compatibility and emit explicit controls for:

- `color-picker`
- `textarea`
- `slider`
- `image`
- `select`
- `json`

Keep `hidden` as omission.

**Step 4: Re-run shared MDX tests**

Run: `bun test packages/shared/src/lib/mdx/auto-form.test.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/mdx/extracted-props.test.ts`

Expected: PASS

### Task 4: Validate Host Authored Hints During Studio Config Preparation

**Files:**

- Modify: `packages/studio/src/lib/studio.ts`
- Modify: `packages/studio/src/lib/studio.test.ts`

**Step 1: Write the failing preparation tests**

Cover:

- valid `propHints` survive prepared config
- invalid `propHints` fail during config preparation with deterministic errors
- extracted props and prepared metadata still include valid hints

**Step 2: Run the preparation test to verify it fails**

Run: `bun test packages/studio/src/lib/studio.test.ts`

Expected: FAIL because Studio preparation does not validate hint semantics yet.

**Step 3: Implement validation**

Reuse the shared validator path so local Studio preparation rejects invalid host
config before the runtime receives it.

**Step 4: Re-run the preparation test**

Run: `bun test packages/studio/src/lib/studio.test.ts`

Expected: PASS

### Task 5: Implement Async Custom Props Editor Resolution

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/studio/src/lib/studio-loader.ts`
- Modify: `packages/studio/src/lib/studio-loader.test.ts`

**Step 1: Write the failing loader/runtime contract tests**

Cover:

- `resolvePropsEditor` must be async
- loaded local props editors are exposed as async resolver results
- `null` is returned when no editor exists

**Step 2: Run the relevant tests to verify failure**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts packages/studio/src/lib/studio-loader.test.ts`

Expected: FAIL because the resolver is currently synchronous.

**Step 3: Implement async resolution**

Update the shared contract and Studio loader to expose:

- `resolvePropsEditor(name): Promise<unknown | null>`

Preserve local loader behavior and host-bridge composition.

**Step 4: Re-run the loader/runtime contract tests**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts packages/studio/src/lib/studio-loader.test.ts`

Expected: PASS

### Task 6: Add the Studio Custom Editor Host Lifecycle

**Files:**

- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`
- Create: `packages/studio/src/lib/mdx-props-editor-host.tsx`
- Create: `packages/studio/src/lib/mdx-props-editor-host.test.tsx`
- Modify: `packages/studio/README.md`

**Step 1: Write the failing lifecycle tests**

Cover:

- `loading` while async editor resolution is pending
- `ready` when an editor resolves and receives `value`, `onChange`, `readOnly`
- `empty` when resolver returns `null` and no auto-form fields exist
- `error` when resolver rejects or render throws
- `forbidden` when read-only mode blocks mutation
- fallback to auto-form when no executable editor exists but generated controls do

**Step 2: Run the lifecycle tests to verify failure**

Run: `bun test packages/studio/src/lib/remote-studio-app.test.ts`

Expected: FAIL because the runtime currently only exposes diagnostics text and has no lifecycle host.

**Step 3: Implement the host component**

Build a small reusable host that:

- resolves editors lazily
- manages lifecycle state
- passes `value`, `onChange`, and `readOnly`
- renders fallback auto-form metadata when appropriate

Use the current document-route runtime surface as the proof integration point.

**Step 4: Re-run the Studio runtime tests**

Run: `bun test packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/studio-loader.test.ts`

Expected: PASS

### Task 7: Run Task Verification

**Files:**

- Modify only files touched above

**Step 1: Run targeted tests**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/mdx/auto-form.test.ts packages/shared/src/lib/mdx/extracted-props.test.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/remote-studio-app.test.ts packages/studio/src/lib/studio.test.ts`

Expected: PASS

**Step 2: Run format check**

Run: `bun run format:check`

Expected: PASS

**Step 3: Run baseline workspace check**

Run: `bun run check`

Expected: PASS
