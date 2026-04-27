# Memory

Persistent team knowledge about MDCMS — the product, the architecture, the integrations, the major efforts in flight, and the lessons we've already learned. Read this when you need _durable_ knowledge. For _volatile_ state (what someone is working on right now, current sprint, blockers), use the issue tracker — that's the right tool for it, and trying to mirror that state here causes merge conflicts on every concurrent PR.

## Layout

| Path                                 | Contents                                                              | Update cadence                                           |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------- |
| [`product.md`](product.md)           | Vision, audience, scope, why MDCMS exists                             | Rarely — only when product itself changes                |
| [`architecture.md`](architecture.md) | System patterns, invariants, hard rules                               | When architecture decisions change                       |
| [`stack.md`](stack.md)               | Runtime, deps, infrastructure, constraints                            | On dependency upgrades or infra changes                  |
| [`lessons.md`](lessons.md)           | Append-only dev-time pitfalls                                         | Append on discovery                                      |
| [`topics/`](topics/)                 | Cross-cutting domain knowledge — auth flow, sync, multi-tenancy, etc. | When a topic stabilizes or changes meaningfully          |
| [`integrations/`](integrations/)     | External systems we depend on (Docker, GitHub Actions)                | When config or auth changes                              |
| [`initiatives/`](initiatives/)       | One file per major team effort — active and completed                 | When an initiative kicks off, hits a milestone, or wraps |

Vocabulary lives at [`../LANGUAGE.md`](../LANGUAGE.md). Architecture decision rationale lives at `docs/adrs/` (canonical product docs). Specs live at `docs/specs/`. Per-package guidance lives at `apps/*/AGENTS.md` and `packages/*/AGENTS.md`.

## How an agent should read this

```text
First-time / onboarding
  └─ product.md → architecture.md → stack.md → skim topics/ index → skim initiatives/ active

Starting a feature
  └─ architecture.md (invariants) → topics/ (relevant cross-cutting) → initiatives/ (does this fit something?)
       → docs/specs/<owning>.md  (canonical scope, NOT in memory/)

Debugging a thing that broke
  └─ lessons.md (have we seen this?) → topics/ (cross-cutting flow) → integrations/ (external system?)

Wondering why something is the way it is
  └─ architecture.md (patterns) → docs/adrs/ (decision rationale) → initiatives/ (which effort drove this?)
```

## How to update

- **product.md / architecture.md / stack.md** — directly, in the PR that changes the underlying reality. Docs, not state. Reviewed in PR.
- **lessons.md** — append at the bottom on discovery. Lead with the rule, then `Why:` and `How to apply:`.
- **topics/** — add a new file when a cross-cutting concept stabilizes; update existing files when the flow changes. One topic per file.
- **integrations/** — add a new file when integrating a new external system; update on config/auth changes.
- **initiatives/** — create on kickoff, update on milestones, mark `Status: completed` on wrap. One initiative per file (no shared write surface = no merge conflicts).

## Why this shape (and not something more sophisticated)

Two reference systems we considered:

- **Hermes Agent** — minimalist 2-file (MEMORY.md + USER.md, ~3.6KB total), frozen-snapshot system-prompt injection, FTS5 over session history, designed for solo use.
- **Magic Context** — sophisticated 4-layer SQLite + vector embeddings + 5 access tools, designed for solo use.

Both are user-local. Neither is committed to a team git repo. SQLite databases don't merge cleanly; user-home memory doesn't share with the team.

Our system trades runtime sophistication (no semantic search yet, no auto-injection beyond `@AGENTS.md`) for **team-shareability and version control**. If we later want semantic search, the right move is an MCP server that indexes these markdown files — the files stay the source of truth.

## What this is _not_

- Not a status report (issue tracker).
- Not a todo list (issue tracker).
- Not a spec (`docs/specs/`).
- Not a changelog (git log + PR descriptions).
- Not a runbook (operator docs go in package READMEs).
- Not a personal journal (Hermes-style USER.md belongs in user-home, not the repo).

This is the **shared mental model** the team and its agents maintain about MDCMS.
