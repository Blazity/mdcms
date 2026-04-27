# CMS-68 Local MDX Component Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the server-backed MDX component sync model with a host-local Studio component catalog sourced from `mdcms.config.ts`, while keeping the backend ignorant of component implementations.

**Architecture:** Update the canonical specs first so they describe a local embedded-Studio component catalog instead of backend schema-sync persistence. Then extend the shared config contract to support client-only component loader callbacks, plumb that data through the Studio shell/runtime boundary, and delete the obsolete backend `extractedComponents` schema-sync contract and storage.

**Tech Stack:** Bun, Nx, TypeScript, React, node:test, Zod, Drizzle, Markdown specs under `docs/specs/`

---

### Task 1: Update Canonical Specs Before Code Changes

**Files:**

- Modify: `docs/specs/SPEC-004-schema-system-and-sync.md`
- Modify: `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- Modify: `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`
- Reference: `docs/adrs/ADR-003-studio-delivery-approach-c.md`

**Step 1: Edit the schema-sync spec to remove backend component catalog sync**

- Remove `optional extractedComponents` from the registry model section.
- Remove `extractedComponents?` from the `PUT /api/v1/schema` contract table.
- Keep schema sync narrowly about content type registry state.

**Step 2: Edit the Studio runtime spec to define local component catalog delivery**

- Document that MDX-aware Studio embedding is client-side when loader callbacks
  are used.
- Document that the shell/runtime boundary carries local MDX catalog metadata
  and local executable resolvers from the host bundle.
- Keep the backend runtime publication model unchanged.

**Step 3: Edit the MDX spec to move component extraction fully local**

- Replace "sent to the server" language with "consumed by the embedded Studio
  runtime".
- Define the local component-catalog contract and loader responsibilities.
- Clarify that preview and custom editor resolution happen locally in the host
  app context.

**Step 4: Review the three specs together for consistency**

Run: `rg -n "extractedComponents|sent to the server|queryable by Studio|schema sync" docs/specs/SPEC-004-schema-system-and-sync.md docs/specs/SPEC-006-studio-runtime-and-ui.md docs/specs/SPEC-007-editor-mdx-and-collaboration.md`

Expected: no remaining contradictory language about backend component-catalog sync.

**Step 5: Commit**

```bash
git add docs/specs/SPEC-004-schema-system-and-sync.md docs/specs/SPEC-006-studio-runtime-and-ui.md docs/specs/SPEC-007-editor-mdx-and-collaboration.md
git commit -m "docs: move mdx component catalog to studio runtime"
```

### Task 2: Extend Shared Config Contracts for Local Runtime Loaders

**Files:**

- Modify: `packages/shared/src/lib/contracts/config.ts`
- Modify: `packages/shared/src/lib/contracts/config.test.ts`
- Modify: `packages/shared/README.md`

**Step 1: Write the failing tests for component loader authoring**

Add tests in `packages/shared/src/lib/contracts/config.test.ts` that assert:

- `defineConfig({... components: [...] })` accepts component registrations with
  optional `load` and `loadPropsEditor` function fields.
- `parseMdcmsConfig(...)` continues to normalize serializable component metadata
  and ignores runtime-only loader callbacks.

Example test shape:

```ts
test("parseMdcmsConfig ignores runtime-only component loader callbacks", () => {
  const config = defineConfig({
    project: "marketing-site",
    serverUrl: "http://localhost:4000",
    components: [
      {
        name: "Chart",
        importPath: "@/components/mdx/Chart",
        load: async () => null,
        loadPropsEditor: async () => null,
      },
    ],
  });

  const parsed = parseMdcmsConfig(config);

  assert.deepEqual(parsed.components, [
    {
      name: "Chart",
      importPath: "@/components/mdx/Chart",
    },
  ]);
});
```

**Step 2: Run the shared contract test to verify it fails**

Run: `bun test packages/shared/src/lib/contracts/config.test.ts`

Expected: FAIL because `MdcmsComponentRegistration` does not yet allow
`load` / `loadPropsEditor`.

**Step 3: Write the minimal shared contract changes**

In `packages/shared/src/lib/contracts/config.ts`:

- Extend `MdcmsComponentRegistration` with:
  - `load?: () => Promise<unknown>`
  - `loadPropsEditor?: () => Promise<unknown>`
- Keep `ParsedMdcmsComponentRegistration` serializable and metadata-only.
- Add a short code comment explaining that runtime loader callbacks are
  host-local Studio concerns and are intentionally stripped by the shared parser.

**Step 4: Run the shared contract test to verify it passes**

Run: `bun test packages/shared/src/lib/contracts/config.test.ts`

Expected: PASS

**Step 5: Update package docs and commit**

- Document the new runtime-only component loader fields in
  `packages/shared/README.md`.

```bash
git add packages/shared/src/lib/contracts/config.ts packages/shared/src/lib/contracts/config.test.ts packages/shared/README.md
git commit -m "feat: add local mdx component loader fields"
```

### Task 3: Change the Studio Embed Contract to Accept MDX-Aware Local Config

**Files:**

- Modify: `packages/studio/src/lib/studio.ts`
- Modify: `packages/studio/src/lib/studio.test.ts`
- Modify: `packages/studio/README.md`
- Optional modify: `apps/studio-example/app/admin/[[...path]]/page.tsx`
- Optional create: `apps/studio-example/app/admin/admin-studio-client.tsx`

**Step 1: Write the failing tests for MDX-aware Studio config**

Add tests in `packages/studio/src/lib/studio.test.ts` that assert:

- `Studio` runtime config accepts raw `SharedMdcmsConfig` with component loader
  callbacks.
- `createStudioEmbedConfig(...)` behavior is explicitly documented:
  - either it remains minimal metadata-only
  - or it preserves MDX loader fields if you decide to broaden it
- MDX component registrations are visible to downstream Studio runtime code in a
  serializable metadata form plus runtime-local loader access.

Suggested minimal test shape:

```ts
test("createStudioEmbedConfig preserves mdx component metadata needed by Studio", () => {
  const config = createStudioEmbedConfig({
    project: "marketing-site",
    environment: "staging",
    serverUrl: "http://localhost:4000",
    components: [
      {
        name: "Chart",
        importPath: "@/components/mdx/Chart",
        load: async () => null,
      },
    ],
  });

  assert.equal(config.components?.[0]?.name, "Chart");
});
```

If the final design is to let `Studio` accept the raw config directly, change
the assertion to cover the widened `Studio` config type instead.

**Step 2: Run the Studio config test to verify it fails**

Run: `bun test packages/studio/src/lib/studio.test.ts`

Expected: FAIL because the Studio config types currently strip components down
to `{ project, environment, serverUrl }`.

**Step 3: Implement the minimal Studio config contract**

In `packages/studio/src/lib/studio.ts`:

- Widen the accepted Studio config type so the shell can receive MDX component
  registrations from `mdcms.config.ts`.
- Decide one of these two exact implementations and document it in code:
  - `Studio` accepts raw shared config directly and `createStudioEmbedConfig`
    becomes optional/minimal; or
  - `createStudioEmbedConfig` preserves the MDX component registration data
    needed at runtime.

In `packages/studio/README.md`:

- Replace the server-component-only example with the approved client-side embed
  pattern for MDX-aware Studio usage.
- Explain that no backend component sync is required.

**Step 4: Run the Studio config test to verify it passes**

Run: `bun test packages/studio/src/lib/studio.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/studio.ts packages/studio/src/lib/studio.test.ts packages/studio/README.md apps/studio-example/app/admin/[[...path]]/page.tsx apps/studio-example/app/admin/admin-studio-client.tsx
git commit -m "feat: accept local mdx component config in studio"
```

### Task 4: Build the Internal Studio MDX Runtime Resolver

**Files:**

- Modify: `packages/shared/src/lib/contracts/extensibility.ts`
- Modify: `packages/shared/src/lib/contracts/extensibility.test.ts`
- Modify: `packages/studio/src/lib/studio-loader.ts`
- Modify: `packages/studio/src/lib/studio-loader.test.ts`
- Modify: `packages/studio/src/lib/studio-component.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.tsx`
- Test/inspect: `packages/studio/src/lib/remote-studio-app.test.ts`

**Step 1: Write the failing tests for local MDX runtime delivery**

Add tests that assert:

- the shell builds an internal runtime capability object from `config.components`
  without requiring user-authored bridge code
- the runtime mount context carries MDX catalog metadata needed for insertion UI
- preview resolution uses the local loader callbacks, not backend data

Suggested loader test shape:

```ts
test("loadStudioRuntime passes mdx catalog metadata to the mounted runtime", async () => {
  const contexts: unknown[] = [];

  await loadStudioRuntime({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
      components: [
        {
          name: "Chart",
          importPath: "@/components/mdx/Chart",
          load: async () => null,
        },
      ],
    },
    basePath: "/admin",
    container: {},
    fetcher: async () => new Response(/* valid bootstrap/runtime fixture */),
    loadRemoteModule: async () => ({
      mount: (_container, context) => {
        contexts.push(context);
        return () => {};
      },
    }),
  });

  assert.equal((contexts[0] as any).mdx.catalog[0].name, "Chart");
});
```

**Step 2: Run the loader/runtime tests to verify they fail**

Run: `bun test packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/remote-studio-app.test.ts`

Expected: FAIL because no MDX catalog/runtime capability plumbing exists yet.

**Step 3: Implement the minimal internal resolver**

- Extend the shared shell/runtime contract in
  `packages/shared/src/lib/contracts/extensibility.ts` with the MDX catalog
  metadata needed by the mounted runtime.
- Keep the executable preview/editor resolver internal to `@mdcms/studio`.
- In `packages/studio/src/lib/studio-component.tsx` and
  `packages/studio/src/lib/studio-loader.ts`, synthesize the runtime capability
  object from `config.components`.
- In `packages/studio/src/lib/remote-studio-app.tsx`, consume local MDX catalog
  metadata for insertion/edit UI instead of expecting backend data.

**Step 4: Run the loader/runtime tests to verify they pass**

Run: `bun test packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/remote-studio-app.test.ts packages/shared/src/lib/contracts/extensibility.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/studio/src/lib/studio-loader.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/studio-component.tsx packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts
git commit -m "feat: resolve mdx components locally in studio runtime"
```

### Task 5: Remove Obsolete Backend Schema-Sync Component Plumbing

**Files:**

- Modify: `packages/shared/src/lib/contracts/schema.ts`
- Modify: `packages/shared/src/lib/contracts/schema.test.ts`
- Modify: `apps/server/src/lib/schema-api.ts`
- Modify: `apps/server/src/lib/schema-api.test.ts`
- Modify: `apps/server/src/lib/db/schema.ts`
- Modify: `apps/server/src/lib/db/schema.contract.test.ts`
- Modify: `apps/server/src/lib/content-api-test-support.ts`
- Modify: `apps/server/README.md`
- Modify: `apps/cli/README.md`

**Step 1: Write the failing tests for removing `extractedComponents`**

Update tests so they expect:

- `SchemaRegistrySyncPayload` no longer accepts or documents
  `extractedComponents`
- server schema-sync persistence no longer writes that field
- DB schema contract no longer includes `schema_syncs.extracted_components`

Suggested schema contract test shape:

```ts
test("assertSchemaRegistrySyncPayload rejects unknown extractedComponents field", () => {
  expectInvalidInput(
    () =>
      assertSchemaRegistrySyncPayload({
        rawConfigSnapshot: {},
        resolvedSchema: {},
        schemaHash: "hash",
        extractedComponents: [],
      } as never),
    "payload.extractedComponents",
  );
});
```

If the validator reports an unknown-field error differently, assert the real
path/message shape after updating the validator.

**Step 2: Run the backend/schema tests to verify they fail**

Run: `bun test packages/shared/src/lib/contracts/schema.test.ts apps/server/src/lib/schema-api.test.ts`

Expected: FAIL because the current contracts and server schema still accept and
persist `extractedComponents`.

**Step 3: Implement the minimal backend cleanup**

- Remove `extractedComponents` from `SchemaRegistrySyncPayload`.
- Remove DB schema/storage for `schema_syncs.extractedComponents`.
- Remove persistence logic and test helpers that seed or assert this field.
- Update server and CLI README files so they no longer claim component metadata
  travels through schema sync.

**Step 4: Run the backend/schema tests to verify they pass**

Run: `bun test packages/shared/src/lib/contracts/schema.test.ts apps/server/src/lib/schema-api.test.ts`

Expected: PASS (database-backed cases may PASS/SKIP depending on local DB
availability, but no failures should remain)

**Step 5: Commit**

```bash
git add packages/shared/src/lib/contracts/schema.ts packages/shared/src/lib/contracts/schema.test.ts apps/server/src/lib/schema-api.ts apps/server/src/lib/schema-api.test.ts apps/server/src/lib/db/schema.ts apps/server/src/lib/db/schema.contract.test.ts apps/server/src/lib/content-api-test-support.ts apps/server/README.md apps/cli/README.md
git commit -m "refactor: remove backend mdx component sync state"
```

### Task 6: Final Verification and Example Flow Check

**Files:**

- Verify only; no required file edits

**Step 1: Run focused package tests**

Run: `bun test packages/shared/src/lib/contracts/config.test.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/contracts/schema.test.ts packages/studio/src/lib/studio.test.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/remote-studio-app.test.ts apps/server/src/lib/schema-api.test.ts`

Expected: PASS, with database-backed server cases allowed to SKIP when no local
Postgres test DB is available.

**Step 2: Run repo formatting check**

Run: `bun run format:check`

Expected: PASS

**Step 3: Run baseline repo validation**

Run: `bun run check`

Expected: PASS

**Step 4: Inspect git status for local-only files**

Run: `git status --short`

Expected:

- no staged or tracked changes for `docs/plans/`
- no staged or tracked changes for `ROADMAP_TASKS.md`
- only task-scoped product/code/doc files remain

**Step 5: Commit the final task-scoped changes**

```bash
git add docs/specs/SPEC-004-schema-system-and-sync.md docs/specs/SPEC-006-studio-runtime-and-ui.md docs/specs/SPEC-007-editor-mdx-and-collaboration.md packages/shared/src/lib/contracts/config.ts packages/shared/src/lib/contracts/config.test.ts packages/shared/src/lib/contracts/extensibility.ts packages/shared/src/lib/contracts/extensibility.test.ts packages/shared/src/lib/contracts/schema.ts packages/shared/src/lib/contracts/schema.test.ts packages/studio/src/lib/studio.ts packages/studio/src/lib/studio.test.ts packages/studio/src/lib/studio-component.tsx packages/studio/src/lib/studio-loader.ts packages/studio/src/lib/studio-loader.test.ts packages/studio/src/lib/remote-studio-app.tsx packages/studio/src/lib/remote-studio-app.test.ts apps/server/src/lib/schema-api.ts apps/server/src/lib/schema-api.test.ts apps/server/src/lib/db/schema.ts apps/server/src/lib/db/schema.contract.test.ts apps/server/src/lib/content-api-test-support.ts packages/shared/README.md packages/studio/README.md apps/server/README.md apps/cli/README.md apps/studio-example/app/admin/[[...path]]/page.tsx apps/studio-example/app/admin/admin-studio-client.tsx
git commit -m "feat: move mdx component catalog into studio runtime"
```
