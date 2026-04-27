# CMS-34 Action Catalog and Studio Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish the canonical module action catalog and the MVP `module`-mode Studio bootstrap/runtime asset endpoints from the server without pulling loader execution work forward from CMS-60.

**Architecture:** Extend the existing server request-handler composition so it publishes two canonical backend contracts from startup-prepared data: a deterministic filtered action registry and a cached Studio runtime publication snapshot. Keep shared contract validation in `@mdcms/shared`, artifact generation in `@mdcms/studio`, and HTTP publication/error handling in `@mdcms/server`.

**Tech Stack:** Bun, Nx, TypeScript, node:test, Elysia, Zod, filesystem APIs

---

### Task 1: Add a server-owned Studio runtime publication helper

**Files:**

- Create: `apps/server/src/lib/studio-bootstrap.ts`
- Create: `apps/server/src/lib/studio-bootstrap.test.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/package.json`
- Test: `apps/server/src/lib/studio-bootstrap.test.ts`

**Step 1: Write the failing publication-helper tests**

Add tests to `apps/server/src/lib/studio-bootstrap.test.ts` for:

- building one validated `StudioBootstrapManifest`
- returning `mode: "module"` in the manifest
- resolving the active `buildId` and asset root
- returning asset metadata for an existing runtime file
- returning `undefined` for an unknown `buildId` or missing asset path

Use a temp directory and a tiny fixture source file so the helper can call the real Studio artifact builder. Model the assertions like:

```ts
const publication = await createStudioRuntimePublication({
  sourceFile,
  outDir,
  studioVersion: "1.2.3",
});

assert.equal(publication.manifest.mode, "module");
assert.equal(publication.manifest.buildId, publication.buildId);

const asset = await publication.getAsset({
  buildId: publication.buildId,
  assetPath: publication.entryFile,
});

assert.equal(asset?.contentType, "text/javascript; charset=utf-8");
assert.equal(asset?.absolutePath.endsWith(publication.entryFile), true);
```

**Step 2: Run the new publication-helper test file**

Run:

```bash
bun test apps/server/src/lib/studio-bootstrap.test.ts
```

Expected: FAIL because the helper does not exist yet.

**Step 3: Implement the publication helper**

Create `apps/server/src/lib/studio-bootstrap.ts` with a small server-owned abstraction around `buildStudioRuntimeArtifacts(...)`, for example:

```ts
export type StudioRuntimePublication = {
  buildId: string;
  entryFile: string;
  manifest: StudioBootstrapManifest;
  getAsset: (input: {
    buildId: string;
    assetPath: string;
  }) => Promise<StudioRuntimeAsset | undefined>;
};
```

Implementation rules:

- call `buildStudioRuntimeArtifacts(...)` once
- force `mode: "module"` unless a future spec changes this task contract
- validate `manifest` with shared validators before returning
- normalize asset paths so callers cannot escape the active build root
- return `undefined` instead of throwing for unknown build IDs or missing files

Also:

- export the helper from `apps/server/src/index.ts`
- add `@mdcms/studio` as a workspace dependency in `apps/server/package.json`

**Step 4: Re-run the publication-helper test file**

Run:

```bash
bun test apps/server/src/lib/studio-bootstrap.test.ts
```

Expected: PASS.

**Step 5: Commit the publication helper**

```bash
git add apps/server/src/lib/studio-bootstrap.ts apps/server/src/lib/studio-bootstrap.test.ts apps/server/src/index.ts apps/server/package.json
git commit -m "feat(server): add studio runtime publication helper"
```

### Task 2: Expose `/api/v1/studio/bootstrap` and `/api/v1/studio/assets/:buildId/*` from the shared server handler

**Files:**

- Modify: `apps/server/src/lib/server.ts`
- Modify: `apps/server/src/lib/http-utils.ts`
- Modify: `apps/server/src/lib/health.test.ts`
- Test: `apps/server/src/lib/health.test.ts`

**Step 1: Write the failing server contract tests**

Extend `apps/server/src/lib/health.test.ts` with tests for:

- `GET /api/v1/studio/bootstrap` returns `200` with the prepared manifest
- `GET /api/v1/studio/assets/:buildId/*` returns the expected JavaScript bytes and content type
- unknown `buildId` returns a `404 NOT_FOUND` envelope
- missing asset under a known build returns a `404 NOT_FOUND` envelope

Use a stubbed publication object so the tests stay fast and isolated:

```ts
const handler = createServerRequestHandler({
  env: baseEnv,
  studioRuntimePublication: {
    manifest,
    buildId: "abc123",
    entryFile: "studio-runtime.abc123.mjs",
    getAsset: async ({ buildId, assetPath }) =>
      buildId === "abc123" && assetPath === "studio-runtime.abc123.mjs"
        ? {
            body: "export const marker = 'runtime';\n",
            contentType: "text/javascript; charset=utf-8",
          }
        : undefined,
  },
});
```

**Step 2: Run the shared server contract tests**

Run:

```bash
bun test apps/server/src/lib/health.test.ts
```

Expected: FAIL because `createServerRequestHandler(...)` does not support Studio runtime publication routes yet.

**Step 3: Implement Studio publication routes in the server handler**

Modify `apps/server/src/lib/server.ts` to accept a new option such as:

```ts
studioRuntimePublication?: StudioRuntimePublication;
```

Then:

- mount `GET /api/v1/studio/bootstrap`
- mount `GET /api/v1/studio/assets/:buildId/*`
- return plain asset responses for successful asset requests
- convert missing publication or missing files into the standard `NOT_FOUND` server envelope

Use helper functions in `apps/server/src/lib/http-utils.ts` to create non-JSON responses cleanly, for example:

```ts
export function createTextResponse(
  body: string,
  statusCode: number,
  contentType: string,
): Response;
```

Implementation rules:

- keep `/api/v1` as the only supported base path
- keep action catalog behavior unchanged
- keep bootstrap and asset routes public per spec
- keep error normalization inside the existing handler flow

**Step 4: Re-run the server contract tests**

Run:

```bash
bun test apps/server/src/lib/health.test.ts
```

Expected: PASS.

**Step 5: Commit the server route publication work**

```bash
git add apps/server/src/lib/server.ts apps/server/src/lib/http-utils.ts apps/server/src/lib/health.test.ts
git commit -m "feat(server): publish studio bootstrap endpoints"
```

### Task 3: Wire module runtime composition to publish actions and Studio runtime together

**Files:**

- Modify: `apps/server/src/lib/runtime-with-modules.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.test.ts`
- Test: `apps/server/src/lib/runtime-with-modules.test.ts`

**Step 1: Write the failing integration tests**

Extend `apps/server/src/lib/runtime-with-modules.test.ts` so it verifies:

- bundled module actions still appear at `GET /api/v1/actions`
- bundled module probe routes still return `200`
- `GET /api/v1/studio/bootstrap` returns a validated manifest from the composed runtime
- `GET /api/v1/studio/assets/:buildId/<entryFile>` returns `200`

Inject a temp output directory into the runtime setup so the test does not depend on repo-global artifact paths.

**Step 2: Run the runtime integration tests**

Run:

```bash
bun test apps/server/src/lib/runtime-with-modules.test.ts
```

Expected: FAIL because the composed runtime does not prepare or pass a Studio publication snapshot yet.

**Step 3: Implement startup publication wiring**

Modify `apps/server/src/lib/runtime-with-modules.ts` to:

- build the Studio runtime publication snapshot during server startup
- pass that snapshot into `createServerRequestHandler(...)`
- keep module action collection and route mounting behavior intact

Recommended shape:

```ts
const studioRuntimePublication =
  awaitOrBuildStudioRuntimePublication(...);

const handler = createServerRequestHandler({
  ...,
  actions,
  studioRuntimePublication,
  configureApp: (app) => {
    mountLoadedServerModules(app, moduleDeps, moduleLoadReport);
  },
});
```

If the current constructor shape is synchronous, refactor only as much as needed to prepare the publication snapshot without widening scope beyond this task. Prefer explicit inputs such as optional `studioRuntimePublication` or `studioRuntimeOptions` over hidden global state.

**Step 4: Re-run the runtime integration tests**

Run:

```bash
bun test apps/server/src/lib/runtime-with-modules.test.ts
```

Expected: PASS.

**Step 5: Commit the runtime composition wiring**

```bash
git add apps/server/src/lib/runtime-with-modules.ts apps/server/src/lib/runtime-with-modules.test.ts
git commit -m "feat(server): compose module actions with studio publication"
```

### Task 4: Document the new contracts and run workspace verification

**Files:**

- Modify: `apps/server/README.md`
- Modify: `packages/studio/README.md`

**Step 1: Update point-of-use documentation**

Document in `apps/server/README.md`:

- `GET /api/v1/studio/bootstrap`
- `GET /api/v1/studio/assets/:buildId/*`
- immutable `buildId` asset semantics
- MVP bootstrap mode fixed to `module`

Document in `packages/studio/README.md`:

- runtime artifacts are built in `@mdcms/studio`
- publication now happens from `@mdcms/server`
- loader execution/verification remains deferred to CMS-60

**Step 2: Run focused tests**

Run:

```bash
bun test apps/server/src/lib/studio-bootstrap.test.ts apps/server/src/lib/health.test.ts apps/server/src/lib/runtime-with-modules.test.ts
```

Expected: PASS.

**Step 3: Run format and workspace checks**

Run:

```bash
bun run format:check
bun run check
```

Expected: PASS.

**Step 4: Review git status**

Run:

```bash
git status --short
```

Expected:

- only task-scoped source/doc changes are staged or ready to stage
- local-only paths such as `docs/plans/`, `AGENTS.md`, `ROADMAP_TASKS.md`, `.claude/`, and `.codex/` remain unstaged and uncommitted

**Step 5: Commit the docs and final task slice**

```bash
git add apps/server/README.md packages/studio/README.md
git commit -m "docs: publish cms-34 runtime contract notes"
```
