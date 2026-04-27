# CMS-56 + CMS-133 Editor Publish Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock Studio document route with real draft load/save behavior and wire the publish, version-history, and version-diff flows against the existing content and auth contracts.

**Architecture:** Keep the server contracts unchanged and add a document-route data layer inside `@mdcms/studio` that owns CSRF bootstrap, local schema-hash derivation, content mutations, version reads, and diff construction. The route page becomes a thin stateful container over that helper layer, while existing editor components continue to focus on markdown editing and MDX behavior.

**Tech Stack:** Bun, Nx, TypeScript, React 19, node:test, Bun test, TipTap 3, shared MDCMS contracts

---

### Task 1: Add document-route API helpers for load, save, publish, and versions

**Files:**

- Create: `packages/studio/src/lib/document-route-api.ts`
- Test: `packages/studio/src/lib/document-route-api.test.ts`
- Modify: `packages/studio/src/lib/document-shell.ts`
- Modify: `packages/studio/src/lib/request-auth.ts`

**Step 1: Write the failing test**

Add tests that prove:

- draft document reads send scoped headers and `draft=true`
- cookie-authenticated mutations fetch CSRF from `GET /api/v1/auth/session`
- token-authenticated mutations do not require CSRF bootstrap
- publish sends optional `changeSummary`
- version summary/detail helpers normalize success and failure states

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/document-route-api.test.ts`
Expected: FAIL because the helper file does not exist yet.

**Step 3: Write minimal implementation**

Implement one helper module that exposes:

- draft load
- session CSRF bootstrap
- draft update
- publish
- version summary list
- version detail fetch

Reuse existing auth header logic instead of duplicating request-init behavior.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/document-route-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/document-route-api.ts packages/studio/src/lib/document-route-api.test.ts packages/studio/src/lib/document-shell.ts packages/studio/src/lib/request-auth.ts
git commit -m "feat(studio): add document route api helpers"
```

### Task 2: Add local schema-hash derivation and write-capability gating

**Files:**

- Create: `packages/studio/src/lib/document-route-schema.ts`
- Test: `packages/studio/src/lib/document-route-schema.test.ts`
- Modify: `packages/studio/src/lib/studio.ts`
- Modify: `packages/studio/src/index.ts`

**Step 1: Write the failing test**

Add tests that prove:

- full authored Studio config can produce a deterministic local schema hash for the active environment
- shell-only config cannot produce a write-capable schema hash result
- the hash inputs remain stable for equivalent config data

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/document-route-schema.test.ts`
Expected: FAIL because the schema-hash helper does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- normalized raw config snapshot builder
- environment schema serialization using shared config/schema helpers
- deterministic SHA-256 hash generation
- one route-facing capability result that says whether writes are allowed and why not

Do not add new public server contracts.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/document-route-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/document-route-schema.ts packages/studio/src/lib/document-route-schema.test.ts packages/studio/src/lib/studio.ts packages/studio/src/index.ts
git commit -m "feat(studio): derive local schema hash for editor writes"
```

### Task 3: Add client-side version diff helpers

**Files:**

- Create: `packages/studio/src/lib/document-version-diff.ts`
- Test: `packages/studio/src/lib/document-version-diff.test.ts`

**Step 1: Write the failing test**

Add tests that prove:

- diff construction compares any two selected versions, not just adjacent ones
- path changes are surfaced
- frontmatter differences are surfaced
- body line differences are surfaced deterministically

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/document-version-diff.test.ts`
Expected: FAIL because the diff helper does not exist yet.

**Step 3: Write minimal implementation**

Implement one small, readable diff helper that accepts two immutable version snapshots and returns structured sections for:

- path
- frontmatter
- body

Keep the implementation intentionally simple and dependency-light.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/document-version-diff.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/document-version-diff.ts packages/studio/src/lib/document-version-diff.test.ts
git commit -m "feat(studio): add document version diff helper"
```

### Task 4: Replace mock document-route state with real draft load and save behavior

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Create: `packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx`
- Modify: `packages/studio/src/lib/remote-studio-app.test.ts`

**Step 1: Write the failing test**

Add tests that prove:

- the page renders loading, ready, forbidden, not-found, and generic error states from real helper results
- editor changes move through unsaved -> saving -> saved
- failed save surfaces mutation feedback without pretending the draft persisted
- write actions are disabled when local schema-hash capability is unavailable

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`
Expected: FAIL because the route still reads from mock data.

**Step 3: Write minimal implementation**

Refactor the route so it:

- loads the routed draft document through the new helper layer
- owns debounced draft persistence
- updates save-state labels from real request outcomes
- keeps route context intact on failure

Do not widen the editor component into a data-fetching surface.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/runtime-ui/components/editor/tiptap-editor.tsx packages/studio/src/lib/remote-studio-app.test.ts
git commit -m "feat(studio): wire real draft load and save on editor route"
```

### Task 5: Wire publish, version history, and arbitrary-version diff UI

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/editor/editor-sidebar.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/ui/dialog.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/components/ui/tabs.tsx`
- Test: `packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`

**Step 1: Write the failing test**

Add tests that prove:

- publish opens the dialog, submits optional change summary, and refreshes route state on success
- version history renders loading, empty, error, and populated states
- the version panel shows version, `publishedBy`, `publishedAt`, and `changeSummary`
- diff selection can compare any two chosen versions

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`
Expected: FAIL because publish/history/diff are still mock-only or absent.

**Step 3: Write minimal implementation**

Implement:

- real publish dialog submit
- route-level mutation feedback
- real version history panel
- arbitrary-version selection controls
- diff rendering using the new helper

Keep restore and unpublish out of scope unless one of them must be hidden to keep the page truthful.

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx packages/studio/src/lib/runtime-ui/components/editor/editor-sidebar.tsx packages/studio/src/lib/runtime-ui/components/ui/dialog.tsx packages/studio/src/lib/runtime-ui/components/ui/tabs.tsx packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx
git commit -m "feat(studio): wire publish flow and version diff ui"
```

### Task 6: Remove or disable misleading mock controls and document the real route contract

**Files:**

- Modify: `packages/studio/src/lib/runtime-ui/components/editor/editor-sidebar.tsx`
- Modify: `packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx`
- Modify: `packages/studio/README.md`

**Step 1: Write the failing test**

Add or update the narrowest UI assertion needed to prove:

- mock-only field editors, fake locale switching, or other unfinished controls are hidden or truthfully disabled
- route copy reflects the new write-capability requirement

**Step 2: Run test to verify it fails**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`
Expected: FAIL because the page still exposes misleading controls.

**Step 3: Write minimal implementation**

Update the UI and docs so that:

- unsupported controls are removed or explicitly disabled with truthful messaging
- the README explains that write-enabled editor routes require full config data capable of local schema-hash derivation
- concise inline comments explain any non-obvious capability gating

**Step 4: Run test to verify it passes**

Run: `bun test packages/studio/src/lib/runtime-ui/pages/content-document-page.test.tsx packages/studio/src/lib/remote-studio-app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/studio/src/lib/runtime-ui/components/editor/editor-sidebar.tsx packages/studio/src/lib/runtime-ui/pages/content-document-page.tsx packages/studio/README.md
git commit -m "docs(studio): document truthful editor route behavior"
```

### Task 7: Final verification

**Files:**

- Verify only

**Step 1: Run focused Studio tests**

Run: `bun test packages/studio/src`
Expected: PASS

**Step 2: Run focused build and typecheck**

Run: `bun nx build studio && bun nx typecheck studio`
Expected: PASS

**Step 3: Run repo-required baseline checks**

Run: `bun run format:check && bun run check`
Expected: PASS

**Step 4: Confirm local-only paths remain unstaged**

Run: `git status --short`
Expected:

- `docs/plans/` remains local-only and unstaged
- `ROADMAP_TASKS.md`, `AGENTS.md`, and other local-only files remain unstaged

**Step 5: Capture any residual risk**

Record any remaining gaps only if verification reveals them. Do not silently broaden scope into `CMS-57`, `CMS-63`, or restore/unpublish follow-up work.
