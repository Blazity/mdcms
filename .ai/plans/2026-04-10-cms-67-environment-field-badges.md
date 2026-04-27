# CMS-67 Environment Field Badges Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface environment-specific field badges in the Studio document editor so editors can see which fields only exist in the active environment.

**Architecture:** Derive serializable document-route metadata from the authored config, pass it through the Studio mount context, and render a badge section in the document sidebar from that metadata. Reuse the same metadata to keep the editor route aligned with the currently selected environment.

**Tech Stack:** Bun, Nx, React, TypeScript, Zod runtime contract validation

---

### Task 1: Document Route Metadata Derivation

**Files:**

- Modify: `packages/studio/src/lib/document-route-schema.ts`
- Test: `packages/studio/src/lib/document-route-schema.test.ts`

**Step 1: Write the failing test**

Add tests that expect:

- per-environment schema hashes to be derived for resolved environments
- type/field environment target metadata to include fields present only in a subset of environments

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/document-route-schema.test.ts`

**Step 3: Write minimal implementation**

Add a helper that parses config, computes schema hashes per environment, and computes `type -> field -> target environments` from resolved schemas.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/document-route-schema.test.ts`

### Task 2: Mount Context Contract Plumbing

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/studio/src/lib/studio.ts`
- Modify: `packages/studio/src/lib/studio-loader.ts`
- Modify: `packages/studio/src/lib/studio-loader.test.ts`
- Modify: `apps/studio-example/app/admin/studio-config.ts`
- Modify: `apps/studio-example/app/admin/[[...path]]/page.tsx`
- Modify: `apps/studio-review/app/review/[scenario]/admin/studio-config.ts`
- Modify: `apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.tsx`

**Step 1: Write the failing test**

Add contract and loader tests for new optional document-route metadata.

**Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts packages/studio/src/lib/studio-loader.test.ts`

**Step 3: Write minimal implementation**

Extend the shared mount context contract and forward precomputed metadata through prepared/client config and loader code.

**Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/lib/contracts/extensibility.test.ts packages/studio/src/lib/studio-loader.test.ts`

### Task 3: Editor Badge Rendering

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Test: `packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`

**Step 1: Write the failing test**

Add view/helper tests that expect environment badge labels to render for fields available only in the active environment and to switch write metadata with the selected environment.

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`

**Step 3: Write minimal implementation**

Render an environment-specific fields section in the Properties tab and derive the active route metadata from the selected environment.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`

### Task 4: Review App Alignment

**Files:**

- Modify: `apps/studio-review/mdcms.config.ts`
- Modify: `apps/studio-review/review/scenarios.ts`
- Test: `apps/studio-review/review/scenarios.test.ts`

**Step 1: Write the failing test**

Add a review-scenario assertion that the staged review schema exposes the environment-specific field expected by the editor badge UI.

**Step 2: Run test to verify it fails**

Run: `bun test apps/studio-review/review/scenarios.test.ts`

**Step 3: Write minimal implementation**

Add a staging-only review field to the review config and align scenario schema fixtures with it.

**Step 4: Run test to verify it passes**

Run: `bun test apps/studio-review/review/scenarios.test.ts`

### Task 5: Verification

**Files:**

- Modify: `packages/studio/README.md`

**Step 1: Document the contract delta**

Update the routed editor README section for the new document-route metadata.

**Step 2: Run focused verification**

Run:

- `bun test packages/studio/src/lib/document-route-schema.test.ts`
- `bun test packages/shared/src/lib/contracts/extensibility.test.ts`
- `bun test packages/studio/src/lib/studio-loader.test.ts`
- `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`
- `bun test apps/studio-review/review/scenarios.test.ts`

**Step 3: Run repo checks required by this task**

Run:

- `bun run format:check`
- `bun run check`
