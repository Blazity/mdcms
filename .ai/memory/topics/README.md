# Topics

Cross-cutting domain knowledge — things that don't belong to a single package. Per-package details live in `apps/*/AGENTS.md` and `packages/*/AGENTS.md`. Architectural decisions live in `docs/adrs/`. Specs live in `docs/specs/`. **Topics here are integration-level**: how concepts flow across packages, what guarantees the system makes, what's idiomatic.

## Format

One file per topic. Filename `kebab-case.md`. Each file should answer four questions:

1. **What is it?** — one paragraph; the concept and its boundaries.
2. **How does it work?** — the actual flow, with cross-refs to packages and files.
3. **What guarantees / invariants?** — what must always be true.
4. **Cross-refs.** — pointers to specs, ADRs, code, and other topics.

Keep each file under ~150 lines. If it grows beyond that, split it.

## Index

- [`auth-flow.md`](auth-flow.md) — How session / API key / loopback-OAuth auth weaves across `apps/server`, `apps/cli`, and `packages/studio`.
- [`push-pull-sync.md`](push-pull-sync.md) — The CLI's file ↔ database reconciliation lifecycle.
- [`schema-sync.md`](schema-sync.md) — How `mdcms.config.ts` definitions reach the server schema registry.
- [`multi-tenancy.md`](multi-tenancy.md) — Project + environment scoping rules across the data layer.
- [`module-system.md`](module-system.md) — How first-party modules mount surfaces in server, CLI, and Studio.

## When to add a topic

When you find yourself explaining a cross-cutting concept twice — to a teammate, to an AI agent, in a PR description — that's the signal. Write it down here once and link from the next conversation.
