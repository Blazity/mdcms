# MDCMS Integration Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit MDCMS from an adopter's perspective by building greenfield and brownfield demo integrations in isolated temp directories, running the full local stack, and capturing concrete integration friction plus candidate abstractions.

**Architecture:** Run one shared MDCMS backend/dev stack from the monorepo, then create multiple isolated temp apps under `/tmp` that consume local MDCMS packages. Assign independent temp apps to separate worker agents. Standardize each worker's findings into one comparable format so orchestration can synthesize a cross-app integration report.

**Tech Stack:** Bun, Nx, Docker Compose, Next.js, Vite, React Router, local workspace package linking, MDCMS CLI/SDK/Studio

---

### Task 1: Shared Stack Baseline

**Files:**

- Read: `package.json`
- Read: `docker-compose.dev.yml`
- Read: `apps/studio-example/README.md`

**Step 1: Start the shared stack**

Run:

```bash
bun run compose:dev
```

Expected: the local stack starts successfully and keeps the server, Studio runtime, and example host app in watch mode.

**Step 2: Verify the stack is reachable**

Run:

```bash
curl -sf http://127.0.0.1:4000/healthz
curl -sf http://127.0.0.1:4173
```

Expected: both endpoints return success.

**Step 3: Record shared environment assumptions**

Record:

- server URL
- seeded login credentials
- seeded demo API key behavior
- any startup failures or local prerequisites

### Task 2: Create Audit Workspace and Reporting Skeleton

**Files:**

- Create: `/tmp/mdcms-audit.<id>/README.md`
- Create: `/tmp/mdcms-audit.<id>/findings/summary.md`
- Create: `/tmp/mdcms-audit.<id>/findings/template.md`
- Create: `/tmp/mdcms-audit.<id>/progress.md`

**Step 1: Create the temp root**

Run:

```bash
mktemp -d /tmp/mdcms-audit.XXXXXX
```

Expected: a unique audit root is created.

**Step 2: Create a reporting template**

Include these required sections:

- app/use case
- exact step
- expected effort
- actual effort
- friction
- why this is unintuitive vs merely undocumented
- repeated values / boilerplate
- candidate abstraction
- prototype attempted?
- blocker severity

**Step 3: Create a progress tracker**

Track:

- each app/use case
- owner agent
- current state
- blockers
- synthesis status

### Task 3: Greenfield Next.js Host

**Files:**

- Create: `/tmp/mdcms-audit.<id>/greenfield-next/**`
- Modify: app files inside that temp app only

**Step 1: Scaffold the app**

Create a fresh Next.js app in the temp root.

**Step 2: Link MDCMS packages locally**

Install or link:

- `@mdcms/cli`
- `@mdcms/sdk`
- `@mdcms/studio`

**Step 3: Execute these use cases deeply**

Use cases:

- SDK reads from seeded content
- Studio catch-all route embed
- local MDX component registration
- target/environment handling
- auth flow and CLI-assisted content workflow

**Step 4: Capture friction and prototype helper wrappers where obvious**

Prototype examples may include:

- centralized MDCMS config readers
- request-header helpers
- Studio route wrapper components
- SDK client factory helpers

### Task 4: Greenfield Vite + React Router Host

**Files:**

- Create: `/tmp/mdcms-audit.<id>/greenfield-vite/**`
- Modify: app files inside that temp app only

**Step 1: Scaffold the app**

Create a fresh Vite React app with React Router.

**Step 2: Link MDCMS packages locally**

Install or link:

- `@mdcms/cli`
- `@mdcms/sdk`
- `@mdcms/studio`

**Step 3: Execute these use cases deeply**

Use cases:

- SDK reads from seeded content
- admin route integration
- Studio embed attempt outside Next.js
- environment/target handling
- auth and CLI workflow from a non-Next host

**Step 4: Capture friction and prototype helper wrappers where obvious**

Pay special attention to anything that claims framework agnosticism but still assumes Next.js ergonomics.

### Task 5: Brownfield Next.js Markdown App

**Files:**

- Create: `/tmp/mdcms-audit.<id>/brownfield-next/**`
- Create: markdown content tree under that temp app
- Modify: app files inside that temp app only

**Step 1: Scaffold an app that already renders local markdown**

Create:

- content routes
- filesystem content loader
- a representative markdown tree

**Step 2: Run `mdcms init` end to end**

Use a unique `(project, environment)` pair for this app.

**Step 3: Execute these use cases deeply**

Use cases:

- schema inference from existing markdown
- locale detection/remapping
- gitignore/untracking implications
- preserving existing content routes while adopting MDCMS
- adding Studio to an app with existing route/layout assumptions

**Step 4: Migrate one content surface to MDCMS-backed reads**

Compare:

- old local markdown read path
- direct API path
- SDK path

### Task 6: Brownfield Vite + React Router Markdown App

**Files:**

- Create: `/tmp/mdcms-audit.<id>/brownfield-vite/**`
- Create: markdown content tree under that temp app
- Modify: app files inside that temp app only

**Step 1: Scaffold an app that already renders local markdown**

Create:

- routed pages
- filesystem content loader
- representative markdown and MDX-ish content

**Step 2: Run `mdcms init` end to end**

Use a unique `(project, environment)` pair for this app.

**Step 3: Execute these use cases deeply**

Use cases:

- schema inference from existing markdown
- preserving route compatibility
- SDK migration path
- admin route integration
- Studio embed attempt in a non-Next brownfield host

**Step 4: Compare migration burden**

Measure:

- duplicated config
- repeated target/auth wiring
- manual manifest/content mapping assumptions

### Task 7: Additional Targeted Use Cases

**Files:**

- Create: `/tmp/mdcms-audit.<id>/cases/**`

**Step 1: Add at least two focused mini-cases if needed**

Examples:

- single-locale markdown app
- multi-locale markdown app with suffix/folder mismatch
- MD vs MDX mixed tree
- host app with custom base path or existing admin route namespace

**Step 2: Use mini-cases only where a major finding needs sharper reproduction**

Do not create extra apps unless they expose materially different friction.

### Task 8: Standardized Worker Reporting

**Files:**

- Create: `/tmp/mdcms-audit.<id>/findings/*.md`

**Step 1: Require every worker to produce one report per app**

Each report must include:

- what worked
- what felt tedious
- what felt unintuitive even with hypothetical docs
- what values had to be repeated
- what glue code should probably live in MDCMS library code
- what helper the worker prototyped locally

**Step 2: Require exact code references inside the temp app**

The report must point to the concrete files that demonstrate the issue.

### Task 9: Cross-Cutting Improvement Prototypes

**Files:**

- Modify: temp app helper files only

**Step 1: Choose the highest-signal pain points**

Examples:

- repeated `project/environment/serverUrl` wiring
- repeated auth header creation
- server-component/client-component split for Studio config
- manual MDX component metadata stripping/re-merging

**Step 2: Prototype small wrappers**

Examples:

- `createMdcmsRuntimeConfig(...)`
- `createScopedFetcher(...)`
- `createStudioRoute(...)`
- `createDemoSdkClient(...)` generalized beyond the demo app

**Step 3: Keep prototypes local to temp apps**

The audit should demonstrate better ergonomics without changing the monorepo implementation yet.

### Task 10: Final Synthesis

**Files:**

- Create: `/tmp/mdcms-audit.<id>/findings/final-report.md`

**Step 1: Build the use-case matrix**

Columns:

- use case
- app
- status
- friction summary
- blocker summary
- candidate MDCMS fix

**Step 2: Prioritize findings**

Buckets:

- abstraction gap
- config duplication
- routing/embed friction
- migration friction
- framework-specific leakage

**Step 3: Distinguish findings carefully**

Do not include:

- pure documentation gaps

Do include:

- concepts that remain awkward even with documentation
- repeated boilerplate
- unnecessary manual integration code
- surprising contracts and split responsibilities

**Step 4: Deliver the audit**

Return:

- completed matrix
- prioritized findings
- concrete examples
- prototype wrapper examples
- residual gaps not exercised
