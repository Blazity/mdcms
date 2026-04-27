# CMS-27 Response Envelope Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize content API response contracts for CMS-27 by adding shared content envelope types and paginating the versions history list endpoint.

**Architecture:** Keep behavior ownership in `@mdcms/server`, but move the content API response shapes into `@mdcms/shared` so server and CLI consumers use one canonical contract. Extend `GET /api/v1/content/:documentId/versions` to use the same `limit`/`offset` and `{ data, pagination }` envelope rules as the main content list endpoint.

**Tech Stack:** Bun, Nx, TypeScript, Zod, Elysia-style route handlers, Drizzle, Bun test

---

### Task 1: Lock The Spec And Shared Contract Surface

**Files:**

- Create: `packages/shared/src/lib/contracts/content-api.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

Update the versions-list contract assertion in `apps/server/src/lib/content-api.test.ts` so it expects:

```ts
assert.equal(Array.isArray(versionsBody.data), true);
assert.deepEqual(versionsBody.pagination, {
  total: 1,
  limit: 20,
  offset: 0,
  hasMore: false,
});
```

**Step 2: Run test to verify it fails**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: FAIL because `GET /api/v1/content/:documentId/versions` currently returns no `pagination` field.

**Step 3: Write minimal implementation**

Create `packages/shared/src/lib/contracts/content-api.ts` with the canonical content response types:

```ts
export type ApiDataEnvelope<T> = { data: T };

export type PaginationMetadata = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ApiPaginatedEnvelope<T> = {
  data: T[];
  pagination: PaginationMetadata;
};
```

Also export content-specific response shapes from that module and re-export it from `packages/shared/src/index.ts`. Update `SPEC-003` so the versions listing endpoint explicitly accepts `limit`/`offset` and returns the paginated envelope.

**Step 4: Run test to verify it still fails for the right reason**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: FAIL remains isolated to route/store behavior, with shared contract types and spec text now in place.

**Step 5: Commit**

```bash
git add packages/shared/src/lib/contracts/content-api.ts packages/shared/src/index.ts docs/specs/SPEC-003-content-storage-versioning-and-migrations.md apps/server/src/lib/content-api.test.ts
git commit -m "feat: define shared content response contracts"
```

### Task 2: Paginate The Versions Route And In-Memory Store

**Files:**

- Modify: `apps/server/src/lib/content-api/types.ts`
- Modify: `apps/server/src/lib/content-api/routes.ts`
- Modify: `apps/server/src/lib/content-api/in-memory-store.ts`
- Modify: `apps/server/src/lib/content-api/responses.ts`
- Test: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

Extend `apps/server/src/lib/content-api.test.ts` with a versions-pagination scenario that creates multiple published versions and asserts:

```ts
const response = await handler(
  new Request(
    `http://localhost/api/v1/content/${created.data.documentId}/versions?limit=1&offset=1`,
    { headers: scopeHeaders },
  ),
);

assert.equal(response.status, 200);
assert.equal(body.data.length, 1);
assert.equal(body.pagination.total, 3);
assert.equal(body.pagination.limit, 1);
assert.equal(body.pagination.offset, 1);
assert.equal(body.pagination.hasMore, true);
assert.equal(body.data[0]?.version, 2);
```

**Step 2: Run test to verify it fails**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: FAIL because the versions route ignores `limit`/`offset` and returns an array without pagination metadata.

**Step 3: Write minimal implementation**

- Change `listVersions(...)` in `apps/server/src/lib/content-api/types.ts` to return:

```ts
Promise<{
  rows: ContentVersionSummary[];
  total: number;
  limit: number;
  offset: number;
}>;
```

- In `apps/server/src/lib/content-api/routes.ts`, parse `limit` and `offset` from the query and return:

```ts
{
  data: versions.rows.map((version) => toVersionSummaryResponse(version)),
  pagination: {
    total: versions.total,
    limit: versions.limit,
    offset: versions.offset,
    hasMore: versions.offset + versions.limit < versions.total,
  },
}
```

- In `apps/server/src/lib/content-api/in-memory-store.ts`, sort versions newest-first, slice by `offset` and `limit`, and return metadata with `rows`.
- In `apps/server/src/lib/content-api/responses.ts`, type the response mappers against the new shared contract types.

**Step 4: Run test to verify it passes**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: PASS for the updated envelope and pagination assertions in the in-memory-backed handler tests.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api/types.ts apps/server/src/lib/content-api/routes.ts apps/server/src/lib/content-api/in-memory-store.ts apps/server/src/lib/content-api/responses.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat: paginate content version history responses"
```

### Task 3: Match The Database Store And CLI Consumers To The Shared Contract

**Files:**

- Modify: `apps/server/src/lib/content-api/database-store.ts`
- Modify: `apps/cli/src/lib/pull.ts`
- Modify: `apps/cli/src/lib/push.ts`
- Test: `apps/server/src/lib/content-api.test.ts`
- Test: `apps/cli/src/lib/pull.test.ts`
- Test: `apps/cli/src/lib/push.test.ts`

**Step 1: Write the failing test**

Add a DB-backed versions listing assertion in `apps/server/src/lib/content-api.test.ts` that exercises the existing database store path and expects paginated metadata for the versions endpoint. Also switch CLI test fixtures and parsing call sites to the shared response types so type errors surface during test/typecheck.

**Step 2: Run test to verify it fails**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: FAIL in the DB-backed versions listing path because `database-store.ts` still returns a plain array.

Run: `bun --cwd apps/cli test ./src/lib/pull.test.ts ./src/lib/push.test.ts`
Expected: either PASS with type drift still unaddressed or FAIL/typecheck errors once shared types are wired into the CLI call sites.

**Step 3: Write minimal implementation**

- Update `apps/server/src/lib/content-api/database-store.ts` to return `{ rows, total, limit, offset }` for `listVersions(...)` after newest-first sort and slicing.
- Replace the inline content payload and envelope types in `apps/cli/src/lib/pull.ts` and `apps/cli/src/lib/push.ts` with imports from `@mdcms/shared` where they match the current server contract.

**Step 4: Run tests to verify they pass**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: PASS for both in-memory and database-backed versions list pagination behavior.

Run: `bun --cwd apps/cli test ./src/lib/pull.test.ts ./src/lib/push.test.ts`
Expected: PASS with CLI consumers still parsing the standardized content contract correctly.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api/database-store.ts apps/cli/src/lib/pull.ts apps/cli/src/lib/push.ts apps/server/src/lib/content-api.test.ts apps/cli/src/lib/pull.test.ts apps/cli/src/lib/push.test.ts
git commit -m "refactor: reuse shared content API contracts"
```

### Task 4: Update Operator Docs And Run Full Verification

**Files:**

- Modify: `apps/server/README.md`
- Test: `package.json` workspace scripts

**Step 1: Write the doc update**

Update `apps/server/README.md` so the content endpoint docs explicitly state:

- `GET /api/v1/content/:documentId/versions` accepts `limit` and `offset`
- versions history returns `{ data, pagination }`
- default `limit` is `20` and max `100`

**Step 2: Run focused verification**

Run: `bun --cwd apps/server test ./src/lib/content-api.test.ts`
Expected: PASS

Run: `bun --cwd packages/shared test ./src`
Expected: PASS

Run: `bun --cwd apps/cli test ./src/lib/pull.test.ts ./src/lib/push.test.ts`
Expected: PASS

**Step 3: Run workspace verification**

Run: `bun run format:check`
Expected: PASS

Run: `bun run check`
Expected: PASS

**Step 4: Confirm git hygiene**

Run: `git status --short`
Expected: modified task files only; local-only paths such as `AGENTS.md`, `ROADMAP_TASKS.md`, `.codex/`, `.claude/`, and `docs/plans/` must not be staged.

**Step 5: Commit**

```bash
git add apps/server/README.md
git commit -m "docs: document paginated content version responses"
```
