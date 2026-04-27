# Studio Example SDK Content Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a parallel SDK-backed content demo to the example app while preserving the existing raw content API inspection routes, and make the distinction obvious in navigation and page copy.

**Architecture:** Keep `/demo/content*` as the direct-fetch raw API surface. Add `/demo/sdk-content*` routes that use `@mdcms/sdk` with the same configured project/environment scope and demo API key. Improve cross-linking and explicit "Data source" labels so developers can compare the raw API and SDK surfaces without ambiguity.

**Tech Stack:** Next.js app routes, React server components, `@mdcms/sdk`, Bun workspace dependencies, node:test assertions for lightweight page tests.

---

### Task 1: Capture the route split in the example app shell

**Files:**

- Modify: `apps/studio-example/app/page.tsx`
- Modify: `apps/studio-example/README.md`

**Step 1: Add the new demo route entry point**

Update the host app landing page so it links to both `/demo/content` and `/demo/sdk-content`.

**Step 2: Clarify route ownership in docs**

Update the example app README route list and runbook text so raw API pages and SDK pages are both documented, with explicit notes about their data sources.

### Task 2: Add focused tests for the new demo distinction

**Files:**

- Create: `apps/studio-example/app/demo/sdk-content/page.test.tsx`
- Create: `apps/studio-example/app/demo/sdk-content/[documentId]/page.test.tsx`
- Modify: `apps/studio-example/app/page.tsx`

**Step 1: Write a failing list-page test**

Add a lightweight page test that asserts the SDK list page renders an SDK-specific heading or data-source label and links back to the raw surface.

**Step 2: Write a failing detail-page test**

Add a lightweight page test that asserts the SDK detail page renders an SDK-specific heading or data-source label and links back to the SDK list and raw detail/list surfaces as appropriate.

**Step 3: Run the focused tests to confirm failure**

Run the new page tests directly with Bun.

### Task 3: Implement the SDK-backed demo routes

**Files:**

- Create: `apps/studio-example/app/demo/sdk-content/page.tsx`
- Create: `apps/studio-example/app/demo/sdk-content/[documentId]/page.tsx`
- Create: `apps/studio-example/app/demo/sdk-content/sdk-demo-client.ts`
- Modify: `apps/studio-example/package.json`

**Step 1: Add the SDK dependency**

Add `@mdcms/sdk` to the example app package so the demo routes can consume the published package boundary directly.

**Step 2: Centralize SDK client creation**

Create a small server-only helper that reads `mdcms.config.ts`, injects the optional `MDCMS_DEMO_API_KEY`, and returns `createClient(...)`.

**Step 3: Implement the SDK list page**

Render the same content summary shape as the raw page, but fetch through `client.list(...)`. Add explicit labeling that the page is using `@mdcms/sdk`.

**Step 4: Implement the SDK detail page**

Fetch by document ID through `client.get(...)`, render the same raw body/frontmatter presentation, and include explicit data-source labeling plus navigation between raw and SDK views.

### Task 4: Tighten the raw pages and shared navigation copy

**Files:**

- Modify: `apps/studio-example/app/demo/content/page.tsx`
- Modify: `apps/studio-example/app/demo/content/[documentId]/page.tsx`

**Step 1: Add explicit raw-API labeling**

Keep the raw routes as-is functionally, but make the page titles and copy explicitly say "Raw Content API".

**Step 2: Cross-link the raw and SDK views**

Add links on each raw page to the corresponding SDK surface so comparison is one click away.

### Task 5: Verify and document

**Files:**

- Modify: `apps/studio-example/README.md`

**Step 1: Update the runbook**

Point the demo verification section at both surfaces and describe what each one demonstrates.

**Step 2: Run focused verification**

Run targeted `bun test` commands for the new page tests, then `bun run format:check`, then `bun run check`.

**Step 3: Leave local-only planning files uncommitted**

Do not stage anything under `docs/plans/`.
