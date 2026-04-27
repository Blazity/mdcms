# Real Scenario MDCMS Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current technical-slice MDCMS test-integrations repo with 10 real product scenarios arranged as 5 mirrored greenfield/brownfield pairs, then run the full integration flow for each and capture real adopter friction.

**Architecture:** Use one shared local MDCMS stack, one target repo clone at `/tmp/mdcms-test-integrations`, and fresh temp workspaces per scenario pair. Each worker owns one mirrored domain pair so greenfield and brownfield remain comparable. The controller verifies repo shape, reviews friction findings for adopter relevance, and pushes only after the repo and reports reflect the real-scenario matrix.

**Tech Stack:** Bun, Nx, Docker Compose, Next.js, Vite, React Router, MDCMS CLI, MDCMS SDK, MDCMS Studio, local workspace package linking

---

### Task 1: Reset The Scenario Matrix

**Files:**

- Modify: `/tmp/mdcms-test-integrations/README.md`
- Delete/replace: current technical-slice app folders under `/tmp/mdcms-test-integrations/apps`

**Step 1: Define the 5 mirrored real-world domains**

Domains:

- newsroom
- product-docs
- marketing-site
- support-center
- release-notes

**Step 2: Map each domain to a framework and mirrored pair**

Pairs:

- `greenfield-newsroom-next`, `brownfield-newsroom-next`
- `greenfield-product-docs-next`, `brownfield-product-docs-next`
- `greenfield-marketing-site-next`, `brownfield-marketing-site-next`
- `greenfield-support-center-vite`, `brownfield-support-center-vite`
- `greenfield-release-notes-next`, `brownfield-release-notes-next`

**Step 3: Remove non-scenario folder names**

Delete/replace folders like:

- `greenfield-next-sdk`
- `greenfield-next-studio`
- `greenfield-next-mdx`
- `brownfield-next-cutover`
- `brownfield-vite-admin`

### Task 2: Shared Reporting Contract

**Files:**

- Create: `/tmp/mdcms-test-integrations/reports/summary.md`
- Create: `/tmp/mdcms-test-integrations/reports/<scenario>.md`

**Step 1: Define the required report sections**

Each scenario report must include:

- scenario
- flow walked end to end
- annoying repetition
- unintuitive contract
- manual glue that should be library code
- acceptable complexity
- docs-only issues (excluded from final prioritization)
- candidate abstractions

**Step 2: Require concrete code references**

Every finding must reference the exact file(s) where the friction showed up.

### Task 3: Newsroom Pair

**Files:**

- Create: `/tmp/mdcms-test-integrations/apps/greenfield-newsroom-next/**`
- Create: `/tmp/mdcms-test-integrations/apps/brownfield-newsroom-next/**`
- Create: `/tmp/mdcms-test-integrations/reports/newsroom-greenfield.md`
- Create: `/tmp/mdcms-test-integrations/reports/newsroom-brownfield.md`

**Step 1: Greenfield newsroom**

Build a new multilingual editorial site in Next.js with:

- articles
- authors
- sections/categories
- newsroom landing route
- admin route

Run:

- install
- schema sync
- push
- app build

**Step 2: Brownfield newsroom**

Start with an existing markdown/MDX news site in Next.js with:

- local article routes already working
- author pages
- categories

Run:

- `mdcms init`
- schema sync
- push
- remote-read cutover on existing routes
- app build

**Step 3: Capture adopter friction**

Prioritize:

- repeated target/config values
- route + content source split boilerplate
- admin embedding friction
- brownfield cutover traps

### Task 4: Product Docs Pair

**Files:**

- Create: `/tmp/mdcms-test-integrations/apps/greenfield-product-docs-next/**`
- Create: `/tmp/mdcms-test-integrations/apps/brownfield-product-docs-next/**`
- Create: `/tmp/mdcms-test-integrations/reports/product-docs-greenfield.md`
- Create: `/tmp/mdcms-test-integrations/reports/product-docs-brownfield.md`

**Step 1: Greenfield docs**

Build a docs portal in Next.js with:

- nested docs pages
- MDX components
- version/section metadata if needed
- admin route

**Step 2: Brownfield docs**

Start from a local markdown/MDX docs portal with:

- nested folder routes
- MDX callouts/tips
- pre-existing content tree

Run full migration and cut over at least one docs surface.

**Step 3: Capture adopter friction**

Prioritize:

- MDX component registration duplication
- content directory/schema mapping tedium
- nested route mapping friction
- browser-safe Studio config split

### Task 5: Marketing Site Pair

**Files:**

- Create: `/tmp/mdcms-test-integrations/apps/greenfield-marketing-site-next/**`
- Create: `/tmp/mdcms-test-integrations/apps/brownfield-marketing-site-next/**`
- Create: `/tmp/mdcms-test-integrations/reports/marketing-site-greenfield.md`
- Create: `/tmp/mdcms-test-integrations/reports/marketing-site-brownfield.md`

**Step 1: Greenfield marketing site**

Build a campaign/landing site in Next.js with:

- multiple localized landing pages
- reusable content sections
- admin route

**Step 2: Brownfield marketing site**

Start from a markdown-driven marketing site with:

- local page routes
- localized content files
- simple reusable sections represented in markdown/MDX

Run full migration and cut over at least one landing page route.

**Step 3: Capture adopter friction**

Prioritize:

- locale duplication
- page route/basePath/admin coordination
- reusable block/component wiring
- hand-built abstraction gaps

### Task 6: Support Center Pair

**Files:**

- Create: `/tmp/mdcms-test-integrations/apps/greenfield-support-center-vite/**`
- Create: `/tmp/mdcms-test-integrations/apps/brownfield-support-center-vite/**`
- Create: `/tmp/mdcms-test-integrations/reports/support-center-greenfield.md`
- Create: `/tmp/mdcms-test-integrations/reports/support-center-brownfield.md`

**Step 1: Greenfield support center**

Build a help center in Vite + React Router with:

- article/category routes
- search/listing shell
- admin route

**Step 2: Brownfield support center**

Start from a local markdown knowledge base in Vite + React Router with:

- article routes already working
- category listings
- existing local loader

Run full migration and cut over at least one article route.

**Step 3: Capture adopter friction**

Prioritize:

- non-Next Studio integration friction
- shared target/config duplication
- browser/server contract confusion
- brownfield runtime read surprises

### Task 7: Release Notes Pair

**Files:**

- Create: `/tmp/mdcms-test-integrations/apps/greenfield-release-notes-next/**`
- Create: `/tmp/mdcms-test-integrations/apps/brownfield-release-notes-next/**`
- Create: `/tmp/mdcms-test-integrations/reports/release-notes-greenfield.md`
- Create: `/tmp/mdcms-test-integrations/reports/release-notes-brownfield.md`

**Step 1: Greenfield release notes hub**

Build a changelog/release site in Next.js with:

- release entries
- tags/product areas
- archive routes
- admin route

**Step 2: Brownfield release notes hub**

Start from an existing markdown release archive with:

- chronological routes
- tag filters
- local file readers

Run full migration and cut over at least one archive surface.

**Step 3: Capture adopter friction**

Prioritize:

- “simple content” still requiring repeated integration plumbing
- chronological/archive route mapping
- preview/draft surprises after migration

### Task 8: Shared Summary

**Files:**

- Create: `/tmp/mdcms-test-integrations/reports/summary.md`

**Step 1: Aggregate recurring findings across all 10 scenarios**

Group by:

- repeated values and source-of-truth problems
- manual integration glue that should live in MDCMS
- unintuitive contracts even with hypothetical docs
- migration traps
- acceptable complexity

**Step 2: Exclude docs-only issues from prioritization**

Docs gaps may be listed in scenario reports but should not drive the summary ranking.

### Task 9: Verification And Push

**Files:**

- Target repo only: `/tmp/mdcms-test-integrations/**`

**Step 1: Verify all scenario folders are present**

Expected: 10 app folders with the mirrored names above.

**Step 2: Run targeted verification**

For each scenario:

- `bun install`
- relevant `typecheck`
- relevant `build`
- `bun run mdcms --help`
- any scenario-specific CLI flow required for credibility

**Step 3: Push corrected repo**

Commit the replacement matrix and push to `main`.
