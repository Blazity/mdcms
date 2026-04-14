# @mdcms/modules

First-party module registry for MDCMS. Modules extend server and CLI behavior through a compile-time plugin system.

> **Note:** This package is internal to the MDCMS monorepo and is not published to npm.

## Module Structure

Each module follows a standard layout:

```
packages/modules/<module-id>/src/
  manifest.ts       # Module metadata, dependencies, compatibility
  server/index.ts   # Server-side routes and actions
  cli/index.ts      # CLI preflight hooks, aliases, formatters
  index.ts          # Package entry
```

## Current Modules

| Module | Description |
| --- | --- |
| `core.system` | System-level preflight validation and server routes |
| `domain.content` | Content domain preflight hooks and server routes |

## How It Works

- `src/index.ts` exports an `installedModules` registry, sorted by module ID
- Server and CLI each have their own module loader that mounts module surfaces at startup
- Module loading is deterministic — no runtime filesystem discovery
- The shared bootstrap planner validates dependencies, detects cycles, and computes load order before any module is mounted

## Documentation

Full module system reference at [docs.mdcms.ai](https://docs.mdcms.ai/).
