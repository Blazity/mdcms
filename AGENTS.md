# MDCMS

## Vision

MDCMS is a Markdown-first headless CMS where the database holds the content but developers work with local files. You pull content down, edit with whatever tools you like, and push it back. The editing experience feels like a filesystem, without the problems that come with actually storing content in one.

Three interfaces share the same data layer: a CLI for developers, an embeddable Studio for editors, and a REST API that AI agents and applications consume directly. The goal is that nobody blocks anyone else. An editor publishing a page and an agent rewriting 500 posts at once go through the same validation, the same permissions, and the same version history.

## Direction

The module system is how MDCMS gets extended. Server actions, CLI commands, and Studio UI surfaces all hook in through the same module contract. Community contributions should follow this pattern rather than patching core code.

Upcoming work is focused on live preview (real-time content rendering in the consumer frontend), MCP integration (Model Context Protocol for agent-driven content operations), multiple spaces (team-scoped content organization), and real-time collaboration (multi-user editing via CRDTs).

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/server` | Elysia HTTP server, the backend for everything |
| `apps/cli` | CLI binary (`mdcms`) for push/pull/sync workflows |
| `apps/studio-example` | Next.js app that embeds the Studio component |
| `apps/studio-review` | Internal app for visual PR review of Studio changes |
| `packages/shared` | Contracts, types, and schema utilities used everywhere |
| `packages/sdk` | Client SDK for reading content from applications |
| `packages/studio` | The embeddable React Studio component |
| `packages/modules` | First-party module registry |

Bun workspaces, Nx for task orchestration. Run `bun install` at the root.

## Architecture decisions and specs

Architectural decisions are documented in `docs/adrs/`. Read these before proposing changes to the areas they cover.

Detailed specifications for each subsystem are in `docs/specs/`. If you're working on a feature, find the relevant spec first. It will save you from going in the wrong direction.

## Working in this repo

- Branch from `main`: `feat/`, `fix/`, `chore/`, `refactor/` prefixes
- Conventional commits: `type(scope): message`
- Run `bun run ci:required` before pushing. The pre-push hook enforces this.
- Full documentation at [docs.mdcms.ai](https://docs.mdcms.ai)
