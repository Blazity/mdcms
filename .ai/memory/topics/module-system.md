# Module system

## What it is

The extensibility mechanism. New capabilities — server actions, CLI commands, Studio UI surfaces, content types, validation hooks — are added as **modules** rather than by patching core code. First-party modules (e.g. `core.system`, `domain.content`) live in `packages/modules/<module-id>/`. Third-party modules are external npm packages that register against the same contract.

## How it works

### Module shape

Every module ships:

- `manifest.ts` — metadata (id, version, capabilities, dependencies).
- `server/index.ts` — server-side surfaces (HTTP routes, event handlers, jobs).
- `cli/index.ts` — CLI subcommands.
- Optional `studio/index.tsx` — UI surfaces.

### Registration

- The `installedModules` registry in `packages/modules/src/index.ts` is a deterministic, sorted-by-`manifest.id` array.
- Server and CLI each have their own `module-loader.ts` that walks the registry at startup and mounts each module's surfaces.
- Studio loads its module bundle from the server at runtime — the host app doesn't bundle modules at build time.

### Cross-module dependencies

- Modules **must not** create direct ORM relationships across module boundaries. Use foreign-key IDs only.
- Cross-module communication goes through declared interfaces in `@mdcms/shared`, never direct imports between module packages.
- A module can declare it depends on another module's interface; the loader fails fast if a dependency is missing.

## Guarantees / invariants

- **Deterministic load order.** Same registry → same load order across machines. No environment-dependent ordering.
- **No cross-module ORM relations.** Hard rule. Enforced by code review (and ideally a lint rule eventually).
- **Server / CLI / Studio share the same registry source of truth.** The list of installed modules is one decision, not three.
- **Modules don't patch core.** If a feature would require modifying core, it's not a module — promote to core or rethink the abstraction.

## Cross-refs

- Spec: `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- Per-package: `packages/modules/`, `apps/server/AGENTS.md`, `apps/cli/AGENTS.md`
- Related: [`schema-sync.md`](schema-sync.md) — content types are typically delivered via modules

## Why this matters

A CMS without an extensibility story becomes a monolith customers fork to extend. The module contract forces "it's a module or it's core" decisions early, which keeps the core surface small.
