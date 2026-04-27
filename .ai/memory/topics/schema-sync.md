# Schema sync

## What it is

How content type definitions in the user's `mdcms.config.ts` reach the server's schema registry. Schema is what gives MDCMS its typed editing surface — Studio forms, validation rules, and component catalogs are all generated from it.

Schema sync is **schema-first**: developers edit `mdcms.config.ts`, run `mdcms schema sync`, and the server's registry catches up. The server never invents schema unilaterally.

## How it works

1. Developer edits `mdcms.config.ts` (defines content types, fields, references via `defineConfig`, `defineType`, `reference` from `@mdcms/shared`).
2. `mdcms schema sync` parses the config, computes a content-addressable hash of the resulting Standard Schema definitions, and POSTs to the server's schema endpoint.
3. Server compares incoming hash with the registry's current hash for that project.
4. If matched → no-op, success.
5. If different → server validates the new schema (no breaking changes without an explicit override flag), persists the new schema record, and updates the active hash.
6. Subsequent reads/writes use the new schema. Documents authored against an old hash get migrated lazily or rejected based on the change type.

## Guarantees / invariants

- **Schema hash pinning** for write clients (per ADR-006). Writes carry the schema hash they were authored against; mismatch is detected and surfaced.
- **No silent breaking changes.** Removing a required field or changing a type without a migration path requires an explicit override.
- **Standard Schema interop.** Internal representation uses Standard Schema so adapters into Zod, Valibot, Arktype etc. work out of the box.
- **Project-scoped.** Schema is per project (multi-tenant boundary). Two projects with identical schemas are still separate registry entries.

## Cross-refs

- Spec: `docs/specs/SPEC-004-schema-system-and-sync.md`
- ADR: `docs/adrs/ADR-006-schema-hash-pinning-for-write-clients.md`
- Per-package: `apps/cli/AGENTS.md`, `packages/shared/AGENTS.md`
- Related: [`push-pull-sync.md`](push-pull-sync.md) — schema sync runs separately from content push/pull

## What this is _not_

- Not a database migration tool. The server's Drizzle migrations are independent.
- Not pushed automatically by Studio or SDK consumers. Studio reads the active schema; SDK reads documents typed against it. Schema authoring is CLI-only.
