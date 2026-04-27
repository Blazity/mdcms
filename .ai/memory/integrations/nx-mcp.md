# Nx MCP

## What it is + why

`nx-mcp` is an MCP server that exposes Nx workspace operations (project graph, target running, generator listing) to AI agents. It lets agents reason about the monorepo's structure and run Nx commands without invoking the Nx CLI directly.

## Configuration

Defined in `.codex/config.toml` (committed):

```toml
[mcp_servers.nx-mcp]
command = "npx"
args = [ "nx-mcp@latest", "--minimal" ]
```

The `--minimal` flag scopes the server to lightweight operations (project-graph reads) without enabling heavier features.

## How agents interact

Codex CLI loads the MCP server on session start. Tools exposed include workspace project listing, target running, and generator listing.

Other agent harnesses (Claude Code, Cursor) load MCP servers from their own per-tool configuration files outside the repo.

## Failure modes

- **`npx nx-mcp@latest` fails to install** — usually a network issue. Run `npx nx-mcp@latest --help` manually to surface the underlying error.

## Cross-refs

- `.codex/config.toml` — committed Codex MCP config
