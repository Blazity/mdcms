# Studio Review Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a private `apps/studio-review` Next.js app that renders MDCMS Studio against scenario-scoped mock API routes and a locally built Studio runtime so pull requests can review visual Studio changes without the full Compose stack.

**Architecture:** Keep the real Studio package and production host app untouched. The review app owns its own `serverUrl` subtree (`/review-api/:scenario`) that serves a real bootstrap manifest plus runtime asset bytes using the existing `@mdcms/studio/build-runtime` helper, and serves deterministic mock API responses for capabilities, schema, and document endpoints through Next route handlers. The review admin route prepares a local Studio config with MDX component metadata and mounts the normal `<Studio />` component against those review-only endpoints.

**Tech Stack:** Bun, Nx workspace apps, Next.js App Router, `@mdcms/studio`, `@mdcms/studio/build-runtime`, repo-local route handlers, node:test / Bun test, React server rendering tests.

---

### Task 1: Scaffold the Private Review App

**Files:**

- Create: `apps/studio-review/package.json`
- Create: `apps/studio-review/next.config.mjs`
- Create: `apps/studio-review/tsconfig.json`
- Create: `apps/studio-review/next-env.d.ts`
- Create: `apps/studio-review/app/layout.tsx`
- Create: `apps/studio-review/app/page.tsx`
- Create: `apps/studio-review/app/page.test.tsx`

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "./page";

test("review home page links to scenario-based Studio routes", () => {
  const markup = renderToStaticMarkup(<HomePage />);

  assert.match(markup, /\/review\/editor\/admin/);
  assert.match(markup, /\/review\/owner\/admin/);
  assert.match(markup, /Studio Review/);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/studio-review/app/page.test.tsx`
Expected: FAIL because the review app files do not exist yet.

**Step 3: Write minimal implementation**

- Mirror the working Next app setup from `apps/studio-example`.
- Add a simple review landing page with links to a small fixed scenario set.
- Keep the app private and internal-only.

**Step 4: Run test to verify it passes**

Run: `bun test apps/studio-review/app/page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/studio-review/package.json apps/studio-review/next.config.mjs apps/studio-review/tsconfig.json apps/studio-review/next-env.d.ts apps/studio-review/app/layout.tsx apps/studio-review/app/page.tsx apps/studio-review/app/page.test.tsx
git commit -m "feat: scaffold studio review app"
```

### Task 2: Add Review Runtime Artifact Builder and Loader Helpers

**Files:**

- Create: `apps/studio-review/review/runtime-entry.ts`
- Create: `apps/studio-review/review/runtime-artifacts.ts`
- Create: `apps/studio-review/review/runtime-artifacts.test.ts`
- Create: `apps/studio-review/scripts/build-review-runtime.ts`

**Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getReviewRuntimeBuildPaths,
  resolveReviewRuntimeAssetPath,
} from "./runtime-artifacts";

test("review runtime paths stay scoped under the review app", () => {
  const paths = getReviewRuntimeBuildPaths("/workspace/apps/studio-review");

  assert.match(paths.outDir, /apps\/studio-review\/.generated\/runtime$/);
  assert.match(
    resolveReviewRuntimeAssetPath(paths.outDir, "build-1", "main.js"),
    /apps\/studio-review\/.generated\/runtime\/assets\/build-1\/main\.js$/,
  );
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/studio-review/review/runtime-artifacts.test.ts`
Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

- Add a runtime entry file that reuses the existing private Studio runtime entrypoint from the workspace source tree.
- Add path helpers for:
  - app root resolution
  - generated runtime output directory
  - latest bootstrap manifest path
  - asset file resolution
- Add a build script that calls `buildStudioRuntimeArtifacts(...)` with the review runtime entry and outputs into `apps/studio-review/.generated/runtime`.

**Step 4: Run test to verify it passes**

Run: `bun test apps/studio-review/review/runtime-artifacts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/studio-review/review/runtime-entry.ts apps/studio-review/review/runtime-artifacts.ts apps/studio-review/review/runtime-artifacts.test.ts apps/studio-review/scripts/build-review-runtime.ts
git commit -m "feat: add studio review runtime builder"
```

### Task 3: Add Scenario Fixtures and Review-Only API Routes

**Files:**

- Create: `apps/studio-review/review/scenarios.ts`
- Create: `apps/studio-review/review/scenarios.test.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/studio/bootstrap/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/studio/assets/[buildId]/[file]/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/me/capabilities/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/schema/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/content/[documentId]/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/content/[documentId]/publish/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/content/[documentId]/versions/route.ts`
- Create: `apps/studio-review/app/review-api/[scenario]/api/v1/content/[documentId]/versions/[version]/route.ts`

**Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { getReviewScenario } from "./scenarios";

test("review scenarios expose deterministic capability sets", () => {
  const owner = getReviewScenario("owner");
  const editor = getReviewScenario("editor");

  assert.equal(owner.capabilities.settings.manage, true);
  assert.equal(editor.capabilities.settings.manage, false);
  assert.equal(editor.document.documentId.length > 0, true);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test apps/studio-review/review/scenarios.test.ts`
Expected: FAIL because scenario fixtures do not exist yet.

**Step 3: Write minimal implementation**

- Add a small fixed set of scenarios:
  - `owner`
  - `editor`
  - `viewer`
  - `schema-error`
- Keep all fixtures deterministic.
- Make route handlers read the scenario from the path segment and return stable envelopes shaped to the existing Studio route helpers.
- Bootstrap route must read the generated latest manifest and return `{ data: { status: "ready", source: "active", manifest } }`.
- Asset route must stream the generated runtime bytes with JavaScript content type.

**Step 4: Run tests to verify they pass**

Run: `bun test apps/studio-review/review/scenarios.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/studio-review/review/scenarios.ts apps/studio-review/review/scenarios.test.ts apps/studio-review/app/review-api
git commit -m "feat: add studio review scenarios and mock api routes"
```

### Task 4: Mount the Real Studio Shell in the Review App

**Files:**

- Create: `apps/studio-review/mdcms.config.ts`
- Create: `apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.tsx`
- Create: `apps/studio-review/app/review/[scenario]/admin/admin-studio-client.tsx`
- Create: `apps/studio-review/app/review/[scenario]/admin/studio-config.ts`
- Create: `apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.test.tsx`

**Step 1: Write the failing test**

```tsx
import assert from "node:assert/strict";
import { test } from "node:test";

import { AdminStudioClient } from "../admin-studio-client";
import AdminReviewPage from "./page";

test("review admin page prepares scenario-scoped Studio config", async () => {
  const element = await AdminReviewPage({
    params: Promise.resolve({
      scenario: "editor",
      path: ["content", "post", "11111111-1111-4111-8111-111111111111"],
    }),
  });

  assert.equal(element.type, AdminStudioClient);
  assert.match(element.props.serverUrl, /\/review-api\/editor$/);
  assert.equal(element.props.basePath, "/review/editor/admin");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test 'apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.test.tsx'`
Expected: FAIL because the review admin route files do not exist yet.

**Step 3: Write minimal implementation**

- Add a review app `mdcms.config.ts` with the same sample schema/types used for editor previews.
- Prepare local MDX metadata server-side using `prepareStudioConfig(...)`.
- Override only `serverUrl` so the embedded shell talks to `/review-api/:scenario`.
- Mount the normal `<Studio />` component with a scenario-specific `basePath`.

**Step 4: Run test to verify it passes**

Run: `bun test 'apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.test.tsx'`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/studio-review/mdcms.config.ts apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.tsx apps/studio-review/app/review/[scenario]/admin/admin-studio-client.tsx apps/studio-review/app/review/[scenario]/admin/studio-config.ts apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.test.tsx
git commit -m "feat: mount studio in review app"
```

### Task 5: Add Operator Docs and Local Verification Commands

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Create: `apps/studio-review/README.md`

**Step 1: Write the failing test**

No code-level failing test is needed for documentation-only updates, but do not edit docs until the runtime and app tasks above are green.

**Step 2: Add minimal implementation**

- Add root scripts for:
  - building the review runtime
  - running the review app locally
- Document:
  - what the review app is for
  - that it is internal-only
  - which scenario URLs matter for PR review
  - that production Studio contracts remain unchanged

**Step 3: Run verification**

Run: `bun run format:check`
Expected: PASS

Run: `bun test apps/studio-review/app/page.test.tsx apps/studio-review/review/runtime-artifacts.test.ts apps/studio-review/review/scenarios.test.ts 'apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.test.tsx'`
Expected: PASS

Run: `bun run check`
Expected: PASS

**Step 4: Commit**

```bash
git add package.json README.md apps/studio-review/README.md
git commit -m "docs: add studio review app workflow"
```

### Final Verification

Run from workspace root:

```bash
bun test apps/studio-review/app/page.test.tsx
bun test apps/studio-review/review/runtime-artifacts.test.ts
bun test apps/studio-review/review/scenarios.test.ts
bun test 'apps/studio-review/app/review/[scenario]/admin/[[...path]]/page.test.tsx'
bun run format:check
bun run check
```

Manual spot-check:

```bash
bun run studio:review:runtime
bun --cwd apps/studio-review dev
```

Open:

- `/review/editor/admin`
- `/review/editor/admin/content`
- `/review/editor/admin/content/post/11111111-1111-4111-8111-111111111111`
- `/review/owner/admin/schema`

Confirm:

- bootstrap is served by the review app, not the real backend
- document editor loads without Compose
- schema page and role-gated navigation change by scenario
- the real `apps/studio-example` path is untouched
