---
status: accepted
canonical: true
created: 2026-03-26
last_updated: 2026-04-08
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

## Rejected Alternatives

- **Process-start pinning:** Hash comes from the server, not local config — weaker compatibility assertion.
- **Automatic refresh and retry:** Turns the check into cache invalidation instead of a compatibility boundary.

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

## Related Specs

- `docs/specs/SPEC-004-schema-system-and-sync.md`
- `docs/specs/SPEC-008-cli-and-sdk.md`
