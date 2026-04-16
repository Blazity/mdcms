---
name: mdcms-setup
description: Use this skill whenever the user wants to set up, install, add, integrate, wire up, or get started with MDCMS in their project, or says things like "get MDCMS running", "add MDCMS to my app", "I want to start using MDCMS", "bring MDCMS into this repo", or anything that sounds like onboarding an MDCMS-based CMS. This is the master orchestrator — it detects what the user already has (running server, existing Markdown/MDX content, a host React/Next app) and delegates to the right focused MDCMS skill at each phase. Always use this first for any MDCMS setup intent, even if the user hasn't named an "orchestrator" or "setup wizard".
---

# MDCMS Setup (Master Orchestrator)

Walk the user end-to-end through adding MDCMS to their project. Your job is to detect which phase they are in, delegate to the focused skill that owns that phase, and return here for the next decision.

## When to use this skill

Any user intent to add, install, configure, or integrate MDCMS. You are the entry point to the MDCMS skill pack. Do not implement phase work yourself — delegate.

## Phases

Work through these sequentially. For each phase, decide whether the user is done already, then either skip or invoke the focused skill. Always say what you're doing and why before you do it.

### Phase 1 — Is an MDCMS backend reachable?

Ask the user where their MDCMS server lives.

1. If they have a hosted or self-hosted URL they know works: continue.
2. If they plan to self-host: invoke **`mdcms-self-host-setup`**.
3. If they have no server and don't want to self-host: stop. MDCMS needs a backend for the rest of the flow to do anything meaningful.

Verify reachability before continuing:

```bash
curl -sf "$MDCMS_SERVER_URL/healthz" && echo ok
```

If this fails, fix it before moving on.

### Phase 2 — Greenfield or brownfield?

Check whether the user's repo already has Markdown or MDX content that MDCMS should manage. Exclude the places where markdown commonly appears but is **not** user content — repo-level docs, skill packs (including this one), issue/PR templates, and dependency directories:

```bash
find . -type f \( -name '*.md' -o -name '*.mdx' \) \
  -not -path '*/node_modules/*' \
  -not -path '*/.*' \
  -not -path './skills/*' \
  -not -path './docs/*' \
  -not -path './apps/docs/*' \
  -not -path './.github/*' \
  -not -name 'README*' \
  -not -name 'CHANGELOG*' \
  -not -name 'LICENSE*' \
  -not -name 'SKILL.md' \
  | head
```

If this surfaces files, ask the user which of the top-level directories (`content/`, `pages/`, `posts/`, or a project-specific path) are actually editorial content vs. product docs. Only editorial content belongs in MDCMS.

- **Editorial content exists** → invoke **`mdcms-brownfield-init`**. That skill runs `mdcms init --non-interactive` against the existing files, verifies the inferred schema, and imports content on first push.
- **No editorial content** → invoke **`mdcms-greenfield-init`**. That skill runs `mdcms init --non-interactive` with a scaffolded starter, pushes the example, and can delegate to `mdcms-schema-refine` for first real content models.

When in doubt, ask — don't assume a `README.md` at the repo root or a `docs/guide.md` is editorial content that should move into MDCMS.

After either init path, the user has a working `mdcms.config.ts`, a synced schema on the server, a stored credential, and content reachable from the Studio API.

### Phase 3 — Is the schema adequate?

Ask the user to sanity-check the inferred (brownfield) or scaffolded (greenfield) schema in `mdcms.config.ts`. If fields are missing, new types are needed, or types should reference each other: invoke **`mdcms-schema-refine`**. Otherwise skip.

### Phase 4 — Fetching MDCMS content in the host app

Ask whether the user wants to render MDCMS content in their own React, Next, or Remix app.

- If yes (either replacing existing filesystem-backed fetching or writing it fresh): invoke **`mdcms-sdk-integration`**. That skill covers both the brownfield "replace" path and the greenfield "write new" path.
- If the user only consumes MDCMS through Studio and the raw API: skip.

### Phase 5 — Visual editor (Studio) in the host app

Ask whether the user wants editors to work inside their own app via the embedded Studio UI.

- Yes → invoke **`mdcms-studio-embed`**.
- No → skip. They can still run Studio standalone against the same server.

### Phase 6 — Custom MDX components

If their content uses (or will use) custom React components in MDX — callouts, embedded forms, interactive widgets, charts: invoke **`mdcms-mdx-components`**. Skip for plain Markdown only.

### Phase 7 — Day-to-day sync + CI

Close the loop: invoke **`mdcms-content-sync-workflow`** so the user understands daily `mdcms pull` / `mdcms push` usage, API key rotation, and CI automation for publishing.

## State-detection cheatsheet

Before asking the user a phase question, check what you can already see in the repo:

| Signal                                                                     | Implication                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `curl <url>/healthz` returns 200                                           | Skip Phase 1.                                                              |
| Repo has `.md`/`.mdx` editorial content (see Phase 2 exclusions)           | Brownfield path in Phase 2.                                                |
| Repo has `mdcms.config.ts`                                                 | Init already ran. Skip to Phase 3 and confirm schema is good.              |
| `package.json` lists `@mdcms/studio`                                       | Studio embed probably already done. Confirm before skipping Phase 5.       |
| `package.json` lists `@mdcms/sdk` or any `from "@mdcms/sdk"` import exists | SDK integration likely in place. Confirm before skipping Phase 4.          |
| Repo has a `components` array in `mdcms.config.ts`                         | Custom MDX components already registered. Confirm before skipping Phase 6. |

## How to delegate

When you decide to invoke a focused skill, hand off cleanly — don't mix your prose with its prose. When it returns, come back here and advance to the next phase.

## If the user only wants one phase

Short-circuit. If they say "I just want to add Studio to an MDCMS-integrated app", skip the diagnosis and invoke `mdcms-studio-embed` directly. The orchestrator is the default path, not a required gate.

## Out of scope

- Don't implement phase work yourself. Each focused skill knows its domain and stays aligned with the current MDCMS contract.
- Don't make product decisions for the user ("you probably don't want Studio"). Ask, then delegate.
- Don't skip a phase silently. State what you're doing.

## Assumptions and limitations

- Requires a Node.js/npm environment on the developer's machine for `npx mdcms`.
- Assumes the user can either reach a hosted MDCMS instance or run Docker locally for self-host.
- Assumes the MDCMS server exposes `/healthz` on the same origin as the API (current contract).
- The flowchart walks a typical adoption path. Real repos can be more tangled — ask, don't guess.
