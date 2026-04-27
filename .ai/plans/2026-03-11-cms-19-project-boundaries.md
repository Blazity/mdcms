# CMS-19 Project Boundaries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize project/environment scope resolution in the server and verify cross-project isolation for CMS content, schema, and environment flows.

**Architecture:** Expand the existing project provisioning module into a small internal repository that owns project lookup, default provisioning, and project/environment scope resolution. Refactor the content, schema, and environment stores to depend on that shared module while keeping public routes, payloads, and error contracts unchanged.

**Tech Stack:** Bun, TypeScript, Elysia route handlers, Drizzle ORM, postgres.js, node:test, Nx

---

### Task 1: Build the Internal Project Repository

**Files:**

- Modify: `apps/server/src/lib/project-provisioning.ts`
- Create: `apps/server/src/lib/project-provisioning.test.ts`

**Step 1: Write the failing test**

```ts
test("project provisioning resolves project/environment scope within one project", async () => {
  const result = await resolveProjectEnvironmentScope(db, {
    project: "marketing-site",
    environment: "production",
    createIfMissing: true,
  });

  assert.equal(result?.project.slug, "marketing-site");
  assert.equal(result?.environment.name, "production");
});

test("project provisioning rejects environment ownership from another project", async () => {
  const result = await requireEnvironmentInProject(db, {
    project: "marketing-site",
    environmentId: docsEnvironment.id,
  });

  assert.equal(result, undefined);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/project-provisioning.test.ts`
Expected: FAIL because the new repository helpers and test file do not exist yet.

**Step 3: Write minimal implementation**

```ts
export async function resolveProjectEnvironmentScope(
  db: DrizzleDatabase,
  input: {
    project: string;
    environment: string;
    createIfMissing?: boolean;
  },
) {
  const project = input.createIfMissing
    ? await ensureProjectProvisioned(db, { project: input.project })
    : await findProjectBySlug(db, input.project);

  // Load the concrete project row, then the environment row scoped by projectId.
  // Return typed records or undefined; do not throw route-specific RuntimeErrors.
}

export async function requireEnvironmentInProject(
  db: DrizzleDatabase,
  input: { project: string; environmentId: string },
) {
  // Resolve the project by slug, then load environments.id scoped by projectId.
}
```

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/project-provisioning.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/project-provisioning.ts apps/server/src/lib/project-provisioning.test.ts
git commit -m "feat(server): add project scope repository helpers"
```

### Task 2: Refactor Content Store to Use Shared Scope Resolution

**Files:**

- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`

**Step 1: Write the failing test**

```ts
testWithDatabase("content API isolates documents across projects", async () => {
  const doc = await createDocument({
    project: "marketing-site",
    environment: "production",
  });

  const response = await handler(
    new Request(`http://localhost/api/v1/content/${doc.documentId}`, {
      headers: {
        "x-mdcms-project": "docs-site",
        "x-mdcms-environment": "production",
      },
    }),
  );

  assert.equal(response.status, 404);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: FAIL because the database-backed content test does not exist yet or because content scope resolution is still duplicated.

**Step 3: Write minimal implementation**

```ts
const scopeIds = await resolveProjectEnvironmentScope(db, {
  project: scope.project,
  environment: scope.environment,
  createIfMissing,
});

if (!scopeIds) {
  return undefined;
}

// Keep all document queries filtered by both projectId and environmentId.
```

Add one wrong-project write-path assertion as well, preferably `PUT` or `DELETE`,
to prove scoped mutation denial returns `NOT_FOUND`.

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/content-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/content-api.ts apps/server/src/lib/content-api.test.ts
git commit -m "feat(server): enforce shared content project scope resolution"
```

### Task 3: Refactor Schema and Environment Stores to Use the Repository

**Files:**

- Modify: `apps/server/src/lib/schema-api.ts`
- Modify: `apps/server/src/lib/schema-api.test.ts`
- Modify: `apps/server/src/lib/environments-api.ts`
- Modify: `apps/server/src/lib/environments-api.test.ts`

**Step 1: Write the failing tests**

```ts
testWithDatabase(
  "schema API isolates registry state across projects",
  async () => {
    await syncSchema({ project: "marketing-site", environment: "production" });

    const response = await handler(
      new Request("http://localhost/api/v1/schema", {
        headers: {
          "x-mdcms-project": "docs-site",
          "x-mdcms-environment": "production",
        },
      }),
    );

    const body = await response.json();
    assert.deepEqual(body.data, []);
  },
);

testWithDatabase(
  "environment delete returns not found for foreign project environment ids",
  async () => {
    const response = await handler(
      new Request(
        `http://localhost/api/v1/environments/${docsEnvironmentId}?project=marketing-site`,
        { method: "DELETE", headers: { cookie } },
      ),
    );

    assert.equal(response.status, 404);
  },
);
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/lib/schema-api.test.ts apps/server/src/lib/environments-api.test.ts`
Expected: FAIL because the tests are new and the stores still resolve project scope independently.

**Step 3: Write minimal implementation**

```ts
const scopeIds = await resolveProjectEnvironmentScope(db, {
  project: scope.project,
  environment: scope.environment,
});

const environmentRow = await requireEnvironmentInProject(db, {
  project: normalizedProject,
  environmentId: normalizedEnvironmentId,
});
```

Keep the current route/store error mapping:

- schema sync missing scope => `NOT_FOUND`
- environment delete foreign ID => `NOT_FOUND`

**Step 4: Run test to verify it passes**

Run: `bun test apps/server/src/lib/schema-api.test.ts apps/server/src/lib/environments-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/lib/schema-api.ts apps/server/src/lib/schema-api.test.ts apps/server/src/lib/environments-api.ts apps/server/src/lib/environments-api.test.ts
git commit -m "feat(server): share project scope resolution across schema and environments"
```

### Task 4: Verify the Whole CMS-19 Slice

**Files:**

- Modify: `apps/server/src/lib/project-provisioning.ts`
- Modify: `apps/server/src/lib/content-api.ts`
- Modify: `apps/server/src/lib/schema-api.ts`
- Modify: `apps/server/src/lib/environments-api.ts`
- Modify: `apps/server/src/lib/project-provisioning.test.ts`
- Modify: `apps/server/src/lib/content-api.test.ts`
- Modify: `apps/server/src/lib/schema-api.test.ts`
- Modify: `apps/server/src/lib/environments-api.test.ts`

**Step 1: Run targeted server tests**

Run: `bun test apps/server/src/lib/project-provisioning.test.ts apps/server/src/lib/content-api.test.ts apps/server/src/lib/schema-api.test.ts apps/server/src/lib/environments-api.test.ts`
Expected: PASS

**Step 2: Run workspace formatting check**

Run: `bun run format:check`
Expected: PASS

**Step 3: Run workspace baseline check**

Run: `bun run check`
Expected: PASS

**Step 4: Confirm local-only files remain unstaged**

Run: `git status --short`
Expected: `.claude/`, `.codex/`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP_TASKS.md`, `EXTENSIBILITY_APPROACH_COMPARISON.md`, `mcp_servers.json`, and `docs/plans/` remain untracked or unstaged as required.

**Step 5: Commit**

```bash
git add apps/server/src/lib/project-provisioning.ts apps/server/src/lib/content-api.ts apps/server/src/lib/schema-api.ts apps/server/src/lib/environments-api.ts apps/server/src/lib/project-provisioning.test.ts apps/server/src/lib/content-api.test.ts apps/server/src/lib/schema-api.test.ts apps/server/src/lib/environments-api.test.ts
git commit -m "feat(server): implement CMS-19 project-scoped data boundaries"
```

## Execution Notes

- Use @superpowers:test-driven-development for each code change: test first, confirm failure, then implement the minimum fix.
- Use @superpowers:verification-before-completion before claiming CMS-19 is done.
- Keep `docs/plans/` artifacts untracked per `AGENTS.md`; do not include them in any commit.
