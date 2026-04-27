# Multi-tenancy

## What it is

Project is the top-level isolation boundary in MDCMS. Every **tenant-scoped** entity — documents, content types, schemas, API keys, audit-log entries — carries a `project_id`. (User-bound entities like sessions and accounts are not project-scoped; they resolve a project context per request based on the explicit project parameter or the API key's binding.) Within a project, **environment** (e.g. `draft`, `prod`) is a state dimension that further scopes reads and writes.

This is the multi-tenant model — a single MDCMS server hosts arbitrary projects, and tenant code never sees data from another tenant.

## How it works

### Project resolution

1. Every authenticated request resolves a project context **before** reaching domain code.
2. Project comes from one of:
   - Explicit header / parameter (SDK clients pass `project` in `createClient`).
   - The api key's bound project (api keys are project-scoped).
   - The session's active project (Studio).
3. If a request can't resolve a project, it errors at the route layer — no domain code runs without a tenant.

### Environment scoping

1. Reads default to the **published environment** unless the request explicitly opts into another.
2. Writes target a specific environment — usually `draft` for editorial workflows, `prod` after publish.
3. Publishing is a state transition that copies/promotes a draft document into the prod environment.
4. Locales further scope translatable documents — a single document has a per-locale variant, all sharing the same project + environment context.

### Storage layer

- Every persistable row has a `project_id` (foreign key) plus, where relevant, `environment` and `locale` columns.
- Drizzle queries **must** filter by `project_id`. There's no global query path.
- Indexes are composite, leading with `project_id`.

## Guarantees / invariants

- **No cross-tenant data leak.** A misconfigured query that omits `project_id` is a bug; should be caught in code review and ideally by lint rules.
- **API keys are project-bound.** A leaked key compromises one project, not all projects on the server.
- **Project deletion cascades.** Deleting a project removes all its documents, schemas, audit entries, and api keys.
- **Environment isolation is logical, not physical.** All environments share the same database tables; isolation comes from the `environment` column, not separate schemas/databases.

## Cross-refs

- Spec: `docs/specs/SPEC-001-platform-overview-and-scope.md`, `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- Per-package: `apps/server/AGENTS.md`
- Related: [`auth-flow.md`](auth-flow.md) for how project resolution interacts with each auth mode
- Related: [`push-pull-sync.md`](push-pull-sync.md) for how environment scoping affects CLI operations

## Future scope

**Multiple spaces** (team-scoped content organization within a project) is on the upcoming-work list. The shape and exact column names are not yet specified — defer to the relevant spec under `docs/specs/` once it lands. Until then, don't assume a particular schema or boundary; just keep tenant-scoping code shaped for additional future scopes without restructuring.
