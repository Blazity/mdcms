# CMS-33 Strict Module Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace permissive module loading with a strict shared bootstrap pipeline and make server startup fail fast on manifest, dependency, cycle, compatibility, and action ID violations before any module routes are registered.

**Architecture:** Build a runtime-agnostic bootstrap planner in `@mdcms/shared` that validates module packages, computes deterministic dependency ordering, and returns either an ordered runtime plan or an aggregated bootstrap failure. Refactor server and CLI loaders to consume that planner; activate fail-fast startup semantics in the server while preserving explicit composition-root dependency wiring.

**Tech Stack:** Bun, Nx, TypeScript, node:test, Zod, Elysia

---

### Task 1: Replace permissive shared load reports with a strict bootstrap planner

**Files:**

- Modify: `packages/shared/src/lib/runtime/module-loader-core.ts`
- Modify: `packages/shared/src/lib/runtime/module-loader-core.test.ts`
- Modify: `packages/shared/src/lib/runtime/index.ts`
- Test: `packages/shared/src/lib/runtime/module-loader-core.test.ts`

**Step 1: Write the failing shared bootstrap tests**

Add tests to `packages/shared/src/lib/runtime/module-loader-core.test.ts` for:

- duplicate `manifest.id`
- missing `dependsOn`
- dependency cycle detection
- deterministic topological ordering with `manifest.id` tie-breaking
- duplicate server `action.id`
- deterministic aggregated violation ordering

Use helpers like:

```ts
const alpha = createModule("alpha", {
  server: true,
  dependsOn: ["core.system"],
});

const beta = createModule("beta", {
  server: true,
  dependsOn: ["alpha"],
});

const plan = buildRuntimeModulePlan([beta, alpha, coreSystem], {
  coreVersion: "1.0.0",
  runtime: "server",
  surface: "server",
  logger: createNoopLogger(),
});

assert.equal(plan.ok, true);
assert.deepEqual(plan.moduleIds, ["core.system", "alpha", "beta"]);
```

And failing cases like:

```ts
const plan = buildRuntimeModulePlan([a, b], {
  coreVersion: "1.0.0",
  runtime: "server",
  surface: "server",
  logger: createNoopLogger(),
});

assert.equal(plan.ok, false);
assert.deepEqual(
  plan.violations.map((entry) => entry.code),
  ["DUPLICATE_MODULE_ID"],
);
```

**Step 2: Run the shared test file to verify it fails**

Run:

```bash
bun test packages/shared/src/lib/runtime/module-loader-core.test.ts
```

Expected: FAIL because `buildRuntimeModulePlan(...)` and strict bootstrap semantics do not exist yet.

**Step 3: Implement the strict shared planner**

In `packages/shared/src/lib/runtime/module-loader-core.ts`, replace the skip-oriented model with planner-first types and logic such as:

```ts
export type ModuleBootstrapViolationCode =
  | "INVALID_PACKAGE"
  | "INCOMPATIBLE_MANIFEST"
  | "DUPLICATE_MODULE_ID"
  | "MISSING_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "DUPLICATE_ACTION_ID";

export type ModuleBootstrapViolation = {
  code: ModuleBootstrapViolationCode;
  moduleId: string;
  details: string;
};

export type RuntimeModulePlan<TSurface extends ModuleSurface> =
  | {
      ok: true;
      moduleIds: readonly string[];
      loaded: readonly LoadedModule<TSurface>[];
    }
  | {
      ok: false;
      violations: readonly ModuleBootstrapViolation[];
    };
```

Implementation rules:

- validate package shape and manifest compatibility first
- collect duplicate module IDs before graph traversal
- validate every `dependsOn` target exists
- detect cycles with DFS or Kahn-based cycle detection
- compute deterministic topological ordering using `manifest.id` as tie-breaker
- filter to modules exposing the requested runtime surface
- validate duplicate server `action.id` after ordering
- sort violations deterministically by code, then module ID, then details

Export the planner from `packages/shared/src/lib/runtime/index.ts`.

**Step 4: Re-run the shared test file**

Run:

```bash
bun test packages/shared/src/lib/runtime/module-loader-core.test.ts
```

Expected: PASS.

**Step 5: Commit the shared bootstrap planner**

```bash
git add packages/shared/src/lib/runtime/module-loader-core.ts packages/shared/src/lib/runtime/module-loader-core.test.ts packages/shared/src/lib/runtime/index.ts
git commit -m "refactor(shared): add strict module bootstrap planner"
```

### Task 2: Refactor server loaders to fail fast before route registration

**Files:**

- Modify: `apps/server/src/lib/module-loader.ts`
- Modify: `apps/server/src/lib/module-loader.test.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.ts`
- Modify: `apps/server/src/lib/runtime-with-modules.test.ts`
- Test: `apps/server/src/lib/module-loader.test.ts`
- Test: `apps/server/src/lib/runtime-with-modules.test.ts`

**Step 1: Write failing server tests**

Update server tests to assert:

- duplicate action IDs cause startup failure
- missing dependency targets cause startup failure
- failures happen before `mountLoadedServerModules(...)`
- explicit deps are still passed into `mount(app, deps)`

Add a mount-guard test like:

```ts
let mounted = false;

const invalid = createServerModule("broken", {
  dependsOn: ["missing.core"],
  onMount: () => {
    mounted = true;
  },
});

assert.throws(
  () =>
    createServerRequestHandlerWithModules({
      env,
      logger,
      moduleLoadReport: buildServerModuleLoadReport([invalid], {
        coreVersion: "1.0.0",
        logger,
      }),
    }),
  /MISSING_DEPENDENCY/,
);

assert.equal(mounted, false);
```

**Step 2: Run the server loader tests to verify they fail**

Run:

```bash
bun test apps/server/src/lib/module-loader.test.ts apps/server/src/lib/runtime-with-modules.test.ts
```

Expected: FAIL because server code still treats invalid or incompatible modules as skip/report data instead of throwing before startup proceeds.

**Step 3: Implement strict server bootstrap consumption**

In `apps/server/src/lib/module-loader.ts`:

- replace `buildServerModuleLoadReport(...)` internals to call the shared strict planner
- return a validated ordered plan for server modules
- throw one `RuntimeError` for bootstrap failures with a stable top-level code such as `INVALID_MODULE_BOOTSTRAP`

In `apps/server/src/lib/runtime-with-modules.ts`:

- build the server module plan before collecting actions
- build the plan before mounting routes
- keep `moduleDeps` explicit and continue passing them directly into each module `mount`

Shape the failure like:

```ts
throw new RuntimeError({
  code: "INVALID_MODULE_BOOTSTRAP",
  message: "Server module bootstrap failed.",
  statusCode: 500,
  details: {
    violations,
  },
});
```

**Step 4: Re-run the server loader tests**

Run:

```bash
bun test apps/server/src/lib/module-loader.test.ts apps/server/src/lib/runtime-with-modules.test.ts
```

Expected: PASS.

**Step 5: Commit the server fail-fast refactor**

```bash
git add apps/server/src/lib/module-loader.ts apps/server/src/lib/module-loader.test.ts apps/server/src/lib/runtime-with-modules.ts apps/server/src/lib/runtime-with-modules.test.ts
git commit -m "feat(server): fail fast on invalid module bootstrap"
```

### Task 3: Move CLI loaders onto the same strict ordered planner

**Files:**

- Modify: `apps/cli/src/lib/module-loader.ts`
- Modify: `apps/cli/src/lib/module-loader.test.ts`
- Modify: `apps/cli/src/lib/runtime-with-modules.ts`
- Test: `apps/cli/src/lib/module-loader.test.ts`

**Step 1: Write failing CLI tests around the new shared semantics**

Adjust CLI tests so they assert:

- deterministic ordered module IDs still hold under the strict planner
- aliases, output formatters, and preflight hooks are collected from ordered loaded CLI modules
- invalid-package or missing-dependency planner failures surface predictably if the CLI wrapper receives an invalid candidate set

**Step 2: Run the CLI loader test to verify it fails**

Run:

```bash
bun test apps/cli/src/lib/module-loader.test.ts
```

Expected: FAIL because the CLI loader still depends on the old skip-report shape.

**Step 3: Refactor CLI loaders to consume the shared planner**

In `apps/cli/src/lib/module-loader.ts` and `apps/cli/src/lib/runtime-with-modules.ts`:

- swap old report-builder usage for the strict shared planner
- keep the runtime-specific extraction for aliases, output formatters, and preflight hooks
- preserve existing CLI runtime shape as much as possible so CMS-33 does not become a CLI behavior task

**Step 4: Re-run the CLI loader test**

Run:

```bash
bun test apps/cli/src/lib/module-loader.test.ts
```

Expected: PASS.

**Step 5: Commit the CLI planner alignment**

```bash
git add apps/cli/src/lib/module-loader.ts apps/cli/src/lib/module-loader.test.ts apps/cli/src/lib/runtime-with-modules.ts
git commit -m "refactor(cli): align module bootstrap with shared planner"
```

### Task 4: Update documentation and verify the full task scope

**Files:**

- Modify: `packages/shared/README.md`
- Modify: `apps/server/README.md`
- Test: `packages/shared/src/lib/runtime/module-loader-core.test.ts`
- Test: `apps/server/src/lib/module-loader.test.ts`
- Test: `apps/server/src/lib/runtime-with-modules.test.ts`
- Test: `apps/cli/src/lib/module-loader.test.ts`

**Step 1: Update point-of-use docs**

Document:

- the strict bootstrap planner and deterministic violation model in `packages/shared/README.md`
- server startup fail-fast semantics in `apps/server/README.md`

Keep CLI README changes minimal unless a user-facing behavior description actually changes.

**Step 2: Run focused tests**

Run:

```bash
bun test packages/shared/src/lib/runtime/module-loader-core.test.ts
bun test apps/server/src/lib/module-loader.test.ts apps/server/src/lib/runtime-with-modules.test.ts
bun test apps/cli/src/lib/module-loader.test.ts
```

Expected: PASS.

**Step 3: Run required repo checks**

Run:

```bash
bun run format:check
bun run check
```

Expected: PASS.

**Step 4: Review git status for task scope hygiene**

Run:

```bash
git status --short
```

Expected:

- only CMS-33 code/docs changes are staged
- local-only paths remain unstaged and uncommitted, including `docs/plans/`

**Step 5: Commit the docs and verification pass**

```bash
git add packages/shared/README.md apps/server/README.md
git commit -m "docs: record strict module bootstrap behavior"
```
