# GitHub Actions

## What it is + why

CI gates running on push and PR. Defined in `.github/workflows/`. The required gate is `bun run ci:required` — anything that fails this blocks merge.

## Configuration

Workflow files live at `.github/workflows/*.yml`. Each workflow declares triggers (push, pull_request, schedule) and jobs.

## Required gate

`bun run ci:required` runs:

1. `bun run format:check` — Prettier check.
2. `bun run check` — Build + typecheck combined.
3. `bun run unit` — Unit tests via `bun test` orchestrated by Nx.
4. `bun run integration` — Docker health + migration check.

No git hook auto-runs this locally; running it manually before pushing avoids the round-trip wait of seeing failures in CI.

## How agents interact

- Read workflow files to understand what CI runs.
- Run `ci:required` locally before pushing — if it fails, the PR will too.
- Use `gh pr checks` or `gh run list` to inspect a PR's CI status without leaving the terminal.

## Failure modes

- **Format check failing** — almost always a missed `bun run format` before commit. Run it, commit the diff.
- **Typecheck failing on a PR but not locally** — usually means dependencies got out of sync; `bun install` and re-run.
- **Integration step timing out** — Docker stack startup is slow on cold caches. Local runs may pass while CI fails. Inspect the run logs for the specific service that didn't come up.

## Cross-refs

- Workflows: `.github/workflows/`
- AGENTS.md "Working in this repo" section — describes the local pre-push procedure.
- Per-package AGENTS.md — package-specific test/build commands.
