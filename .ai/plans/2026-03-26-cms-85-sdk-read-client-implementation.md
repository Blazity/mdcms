# CMS-85 SDK Read Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a thin read-focused SDK client in `@mdcms/sdk` with `createClient`, `get`, and `list`, including deterministic routing and error parsing.

**Architecture:** Build a small fetch-based client in `packages/sdk` that maps directly to the content API. Keep the implementation schema-agnostic for reads, centralize request construction and response parsing, and cover behavior with Bun `node:test` tests using fetch stubs instead of a live server.

**Tech Stack:** TypeScript, Bun test runner (`node:test`), workspace package exports, shared API/error contract types from `@mdcms/shared`

---

### Task 1: Establish SDK test surface

**Files:**

- Modify: `packages/sdk/package.json`
- Create: `packages/sdk/src/lib/sdk.test.ts`

**Step 1:** Add a `test` script to `packages/sdk/package.json` using `bun test ./src`.

**Step 2:** Write a failing test in `packages/sdk/src/lib/sdk.test.ts` for `createClient().list()` unwrapping `{ data, pagination }`.

**Step 3:** Run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

**Step 4:** Confirm the test fails because the SDK implementation does not exist yet.

### Task 2: Implement the list path

**Files:**

- Modify: `packages/sdk/src/lib/sdk.ts`
- Modify: `packages/sdk/src/index.ts`

**Step 1:** Implement `createClient` and the `list` method with explicit routing headers and query serialization.

**Step 2:** Add lightweight success-envelope validation for paginated responses.

**Step 3:** Re-run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

**Step 4:** Confirm the initial `list` test passes.

### Task 3: Add deterministic error parsing

**Files:**

- Modify: `packages/sdk/src/lib/sdk.test.ts`
- Modify: `packages/sdk/src/lib/sdk.ts`

**Step 1:** Write failing tests for API error-envelope parsing and malformed success payload handling.

**Step 2:** Run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

**Step 3:** Implement `MdcmsApiError` plus a separate client/protocol error path.

**Step 4:** Re-run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

### Task 4: Add `get` by document id

**Files:**

- Modify: `packages/sdk/src/lib/sdk.test.ts`
- Modify: `packages/sdk/src/lib/sdk.ts`

**Step 1:** Write a failing test for `get(type, { id })` hitting `/api/v1/content/:documentId`.

**Step 2:** Run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

**Step 3:** Implement the `id`-based `get` path with document-envelope parsing.

**Step 4:** Re-run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

### Task 5: Add `get` by slug and routing overrides

**Files:**

- Modify: `packages/sdk/src/lib/sdk.test.ts`
- Modify: `packages/sdk/src/lib/sdk.ts`

**Step 1:** Write failing tests for slug-based `get`, zero-result handling, multi-result handling, and per-call `project` / `environment` overrides.

**Step 2:** Run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

**Step 3:** Implement slug lookup via the list endpoint and enforce exactly one result.

**Step 4:** Re-run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

### Task 6: Cover `locale` and `resolve` passthrough

**Files:**

- Modify: `packages/sdk/src/lib/sdk.test.ts`
- Modify: `packages/sdk/src/lib/sdk.ts`
- Modify: `packages/sdk/README.md`

**Step 1:** Write failing tests asserting `locale` and repeated `resolve` query parameters are serialized correctly for `get` and `list`.

**Step 2:** Run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

**Step 3:** Implement or adjust query serialization to pass those tests.

**Step 4:** Update `packages/sdk/README.md` with minimal public usage documentation for the new SDK contract.

**Step 5:** Re-run `cd packages/sdk && bun test ./src/lib/sdk.test.ts`.

### Task 7: Final verification

**Files:**

- Review: `packages/sdk/src/lib/sdk.ts`
- Review: `packages/sdk/src/lib/sdk.test.ts`
- Review: `packages/sdk/README.md`
- Review: `packages/sdk/package.json`

**Step 1:** Run `cd packages/sdk && bun test ./src`.

**Step 2:** Run `bun run format:check`.

**Step 3:** Run `bun run check`.

**Step 4:** Review `git status --short` and confirm local-only files remain unstaged.
