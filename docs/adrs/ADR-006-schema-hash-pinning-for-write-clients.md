---
status: accepted
canonical: true
created: 2026-03-26
last_updated: 2026-04-14
---

# ADR-006 Schema Hash Pinning for Write Clients

This is the live canonical document under `docs/`.

## Context

Content writes require `x-mdcms-schema-hash` and fail when the caller's hash does not match the server's synced schema. Write clients need a clear contract for where that hash comes from and what happens on mismatch.

## Decision

- Write clients obtain their schema hash from a local file written by `cms schema sync` (local-artifact pinning).
- On mismatch, the write fails and requires an explicit `cms schema sync` before retrying. No automatic refresh or retry.

## Rationale

- Preserves the schema hash as a real compatibility assertion about local code/config rather than a runtime cache.
- Aligns with CLI and CI flows where schema changes are explicit and reviewable.
- Mismatch recovery is operator-controlled and visible in CI logs.

## Update 2026-04-14: Bundled preflight in `cms push`

`cms push` now performs a schema preflight against the server before any content writes. When drift is detected:

- **Interactive mode (TTY):** push prints a rich diff (added / modified / deleted types) and prompts once to sync. Acceptance triggers an inline schema sync via the same `performSchemaSync` helper that backs `cms schema sync`; decline exits code 1 with zero content writes.
- **Non-interactive mode (CI):** push fails closed with `SCHEMA_DRIFT` unless `--sync-schema` is supplied. The flag is the explicit user gesture in CI; in TTY mode the flag is silently ignored — the prompt always wins.

This does not constitute "automatic refresh" in the sense rejected below: the schema sync still requires a deliberate gesture (TTY prompt acceptance or CI flag in `.yml`), and the schema hash retains its role as a compatibility assertion of local code/config. Per-doc `SCHEMA_HASH_MISMATCH` handling remains active as a race-condition fallback with an improved message that differentiates mid-push drift from stale local state.

## Rejected Alternatives

- **Process-start pinning:** Hash comes from the server, not local config — weaker compatibility assertion.
- **Automatic refresh and retry without user gesture:** Turns the check into cache invalidation instead of a compatibility boundary. The bundled preflight in `cms push` is not in this category — it requires either prompt acceptance (TTY) or an explicit `--sync-schema` flag (CI).

## Consequences

- `cms schema sync` must persist the hash locally. `cms push` must read it and fail if missing.
- Developers must run `cms schema sync` after schema changes before pushing content. This is intentional friction.

| Package         | Change                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| `@mdcms/cli`    | New module: `schema-state.ts` — read/write `.mdcms/schema/` files                          |
| `@mdcms/cli`    | New command: `schema sync` — parse config, PUT to server, save state                       |
| `@mdcms/cli`    | Modify `push.ts` — read hash from state file, add to headers, handle mismatch per-document |
| `@mdcms/shared` | Export `SchemaStateFile` type                                                              |
| `@mdcms/server` | No changes — enforcement already complete                                                  |

### Additions 2026-04-14 (bundled preflight)

- `@mdcms/cli`: extend `push.ts` with schema preflight, `--sync-schema` flag, interactive prompt with rich diff, and improved per-doc race-condition message.
- `@mdcms/cli`: extract `performSchemaSync` helper from `schema-sync.ts` for reuse by push's bundled flow.
- `@mdcms/cli`: add `schema-diff.ts` with `computeSchemaDiff` and `hashSchemaTypeSnapshot` helpers.
- `@mdcms/shared`: add `SchemaRegistryListResponse` type and `validateSchemaRegistryListResponse` validator.
- `@mdcms/server`: add `schemaHash` and `syncedAt` fields to `GET /api/v1/schema` response (response shape migrated from `data: SchemaRegistryEntry[]` to `data: { types, schemaHash, syncedAt }`).
- `@mdcms/studio`: migrate `schema-route-api.list()` consumers to the new response shape.

## Related Specs

- `docs/specs/SPEC-004-schema-system-and-sync.md`
- `docs/specs/SPEC-008-cli-and-sdk.md`
