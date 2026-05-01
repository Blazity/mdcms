# CMS-214 Studio Runtime Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the backend-served Studio runtime entry by removing accidental TypeScript compiler inclusion and emitting an optimized production browser bundle.

**Architecture:** Keep the current single-entry runtime delivery contract. Add a browser-safe `@mdcms/shared/mdx/auto-form` subpath so Studio runtime code can import auto-form helpers without traversing the MDX barrel that also exports Node-side TypeScript prop extraction. Update the runtime artifact builder to minify and inline production `NODE_ENV`.

**Tech Stack:** Bun bundler, TypeScript project references, `@mdcms/shared` package exports, `@mdcms/studio` runtime builder tests.

---

### Task 1: Add Runtime Size Regression Tests

**Files:**
- Modify: `packages/studio/src/lib/build-runtime.test.ts`

- [ ] **Step 1: Write the failing real-runtime size test**

Add a test that builds the real default Studio runtime with `buildStudioRuntimeArtifacts`, reads `build.entryPath`, and asserts:

```typescript
assert.equal(emittedSource.includes("typescript.js"), false);
assert.equal(emittedSource.includes("createProgram"), false);
assert.equal(Buffer.byteLength(emittedSource, "utf8") < 2_000_000, true);
```

- [ ] **Step 2: Write the failing production-env test**

Add a temp-source build test that imports React, branches on `process.env.NODE_ENV`, and asserts the emitted runtime no longer contains `process.env.NODE_ENV` or the development branch string.

- [ ] **Step 3: Run the focused test**

Run: `bun test --cwd packages/studio ./src/lib/build-runtime.test.ts`

Expected before implementation: failure because the real runtime contains TypeScript and exceeds 2 MB, and the production-env branch is not inlined.

### Task 2: Split Browser-Safe MDX Auto-Form Export

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Modify: `packages/studio/src/lib/mdx-props-editor-host.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.ts`

- [ ] **Step 1: Add the shared subpath export**

Add `./mdx/auto-form` to `@mdcms/shared` conditional exports with `@mdcms/source`, `bun`, `types`, `import`, and `default` entries pointing at the existing auto-form source/dist files.

- [ ] **Step 2: Update Studio runtime imports**

Change runtime-side imports of `createMdxAutoFormFields` and `MdxAutoFormField` from `@mdcms/shared/mdx` to `@mdcms/shared/mdx/auto-form`.

- [ ] **Step 3: Run the focused test**

Run: `bun test --cwd packages/studio ./src/lib/build-runtime.test.ts`

Expected after this task only: TypeScript compiler assertions pass, but the size or production-env assertion may still fail until Task 3.

### Task 3: Optimize Runtime Build Output

**Files:**
- Modify: `packages/studio/src/lib/build-runtime.ts`
- Modify: `packages/studio/src/lib/build-runtime.test.ts`

- [ ] **Step 1: Update Bun build options**

Set runtime bundling to `minify: true` and define `process.env.NODE_ENV` as `"production"` in `bundleRuntimeEntry`.

- [ ] **Step 2: Run focused tests**

Run: `bun test --cwd packages/studio ./src/lib/build-runtime.test.ts`

Expected: all build-runtime tests pass and the runtime entry size assertion is below 2 MB.

### Task 4: Verify and Publish PR

**Files:**
- Keep: `.ai/research/2026-05-01-cms-214-studio-runtime-bundle-analysis.md`
- Keep: `.ai/plans/2026-05-01-cms-214-studio-runtime-size.md`

- [ ] **Step 1: Run package and workspace checks**

Run:

```bash
bun test --cwd packages/studio ./src/lib/build-runtime.test.ts
bun run check
bun run format:check
```

- [ ] **Step 2: Create changeset**

Because published packages are touched, run:

```bash
bun run changeset
```

- [ ] **Step 3: Commit and open PR**

Commit with:

```bash
git add .ai/plans/2026-05-01-cms-214-studio-runtime-size.md .ai/research/2026-05-01-cms-214-studio-runtime-bundle-analysis.md packages/shared/package.json packages/studio/src/lib/build-runtime.test.ts packages/studio/src/lib/build-runtime.ts packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/mdx-props-editor-host.tsx packages/studio/src/lib/runtime-ui/components/editor/mdx-component-catalog.ts .changeset
git commit -m "fix(studio): reduce runtime bundle size"
```

Then push the branch and open a GitHub PR for CMS-214.
