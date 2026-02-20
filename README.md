# MDCMS Workspace

This repository hosts the MDCMS monorepo foundation for CMS-1.

It is initialized as a Bun-based Nx package workspace with the initial package boundaries required by the roadmap:

| Package         | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `@mdcms/server` | Backend server package boundary for API/runtime implementation. |
| `@mdcms/studio` | Host-embedded Studio package boundary for runtime loader work.  |
| `@mdcms/sdk`    | Client SDK package boundary for content API consumption.        |
| `@mdcms/cli`    | CLI package boundary for operator workflows.                    |
| `@mdcms/shared` | Shared contracts/types/utilities boundary used across packages. |

## Workspace Commands

Run from `/Users/karol/Desktop/mdcms`:

- `bun run build` - Build all projects with Nx.
- `bun run typecheck` - Typecheck all projects with Nx.
- `bun run check` - Run `build` and `typecheck` targets across projects.
- `bun run format` - Format repository files with Prettier.
- `bun run format:check` - Check repository formatting with Prettier.

## Package Layout

- `packages/server`
- `packages/studio`
- `packages/sdk`
- `packages/cli`
- `packages/shared`
