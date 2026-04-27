# CMS-23 + CMS-24 Restore and Version History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add exact trash restore, immutable version-history reads, and
historical version restore semantics to the server content API.

**Architecture:** Extend the existing content store contract inside
`apps/server/src/lib/content-api.ts` so the in-memory and DB-backed stores both
implement the same restore/version behaviors. Keep route orchestration in the
current content API module, reuse existing publish semantics for
restore-to-published, and cover the new behavior primarily through
HTTP-level tests in `apps/server/src/lib/content-api.test.ts`.

**Tech Stack:** Bun, TypeScript, Elysia route handlers, Drizzle ORM,
postgres.js, node:test, Nx

---

### Task 1: Add Failing Tests for Trash Restore and Version History

**Files:**

- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing tests**

```ts
test("content API restore undeletes the current head without appending a version", async () => {
  const handler = createHandler();

  // Create, publish, soft-delete, restore, then assert:
  // - restore returns 200
  // - isDeleted is false
  // - publishedVersion is unchanged
  // - version list length is still 1
});

test("content API returns version history summaries and individual snapshots", async () => {
  const handler = createHandler();

  // Create, publish twice, then assert GET /versions and GET /versions/:version.
});

test("content API restores a historical version to draft state by default", async () => {
  const handler = createHandler();

  // Publish v1, update + publish v2, restore v1 with no targetStatus, then
  // assert head content matches v1 and history length remains 2.
});

test("content API restores a historical version to published state when requested", async () => {
  const handler = createHandler();

  // Publish v1, publish v2, restore v1 with targetStatus=published, then
  // assert a new version 3 exists and publishedVersion is 3.
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL because the restore and version-history routes do not exist yet.

**Step 3: Write minimal implementation**

```ts
type ContentVersionSummary = {
  version: number;
  path: string;
  locale: string;
  type: string;
  format: ContentFormat;
  publishedAt: string;
  publishedBy: string;
  changeSummary?: string;
};

type ContentVersionDocument = ContentVersionSummary & {
  documentId: string;
  translationGroupId: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

type ContentRestoreVersionPayload = {
  targetStatus?: string;
  actorId?: unknown;
  changeSummary?: unknown;
  change_summary?: unknown;
};
```

Extend the in-memory store and route handlers just enough to make the new tests
pass before touching the DB-backed parity cases.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS for the new in-memory restore/version coverage.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.test.ts apps/server/src/lib/content-api.ts
git commit -m "feat(server): add content restore and version history routes"
```

### Task 2: Add DB-Backed Restore and Version-Restore Behavior

**Files:**

- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing DB-backed tests**

```ts
testWithDatabase(
  "content API DB restore returns CONTENT_PATH_CONFLICT when undelete collides with an active path",
  async () => {
    // Create doc A, soft-delete it, create doc B with the same path/locale,
    // restore doc A, then assert 409 CONTENT_PATH_CONFLICT.
  },
);

testWithDatabase(
  "content API DB restore version with targetStatus=published appends a new immutable version",
  async () => {
    // Publish v1, publish v2, restore v1 to published, then assert:
    // - publishedVersion is 3
    // - document_versions now has 3 rows
    // - version 3 body/frontmatter/path match v1
  },
);
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL because the DB-backed store does not yet implement restore or
version-history operations.

**Step 3: Write minimal implementation**

```ts
async restore(scope, documentId) {
  // Resolve scope ids and current document row.
  // Reject missing rows with NOT_FOUND.
  // Check active path uniqueness excluding the current document id.
  // Clear isDeleted and return the updated head row.
}

async restoreVersion(scope, documentId, version, input) {
  // Resolve document + immutable version snapshot in one transaction.
  // Check path uniqueness against the snapshot path/locale.
  // Update the head row from the snapshot.
  // If targetStatus === "published", append a fresh version row and set
  // publishedVersion to the new version number.
}
```

Map unique/path conflicts to `CONTENT_PATH_CONFLICT` with consistent details in
both restore flows.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS for the new DB-backed restore/version tests.

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): add DB-backed restore semantics"
```

### Task 3: Document the Operator-Facing Contract and Run Verification

**Files:**

- Modify: `apps/server/README.md`

**Step 1: Write the failing doc expectation**

```md
- `POST /api/v1/content/:documentId/restore` undeletes the current head only.
- `GET /api/v1/content/:documentId/versions` lists immutable publish history.
- `GET /api/v1/content/:documentId/versions/:version` returns one immutable snapshot.
- `POST /api/v1/content/:documentId/versions/:version/restore` restores a snapshot to draft or published state.
```

**Step 2: Run check to verify docs are missing**

Run: `rg -n "documentId/restore|versions/:version/restore" apps/server/README.md`
Expected: missing or incomplete entries for the new restore/version contract.

**Step 3: Write minimal implementation**

Add a short API contract section in `apps/server/README.md` describing the new
endpoints, the exact-undelete trash restore behavior, and the `CONTENT_PATH_CONFLICT`
restore error.

**Step 4: Run verification**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS

Run: `bun run format:check`
Expected: PASS

Run: `bun run check`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/README.md apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "docs(server): document restore and version history contract"
```

## Repo Policy Note

This plan file is intentionally stored in `docs/plans/` as a local planning
artifact and should remain untracked per `AGENTS.md`.
