---
status: proposed
canonical: true
created: 2026-03-26
last_updated: 2026-03-26
---

# ADR-006 Schema Hash Pinning for Write Clients

This is the live canonical document under `docs/`.

## Context

Content writes already require `x-mdcms-schema-hash` and fail with deterministic mismatch errors when the caller's schema hash does not match the server's synced schema for the routed `(project, environment)` target.

That guard exists to prevent a client from writing content using assumptions that no longer match the active schema. A future SDK or CLI write surface therefore needs a clear answer to a separate architecture question: where does the write client's schema hash come from, how long is it considered valid, and what should happen when the server reports a mismatch?

Auto-refreshing the latest schema hash at runtime would weaken the purpose of the guard. If a client can simply fetch the newest hash and retry, the mismatch check stops representing a meaningful compatibility boundary between local code/config and the active server schema.

## Proposed Direction

Treat schema hash pinning as an explicit compatibility contract for write clients rather than a read-time cache refresh concern.

The current preferred direction is:

- Read clients do not fetch schema solely to keep up with schema hash changes.
- Future write clients should obtain a pinned schema hash from a deliberate local source of truth such as local config, a schema sync artifact, or an equivalent build-time/operator-controlled input.
- A `SCHEMA_HASH_MISMATCH` response should fail the write and require an explicit operator or developer action rather than automatically refreshing the hash and retrying.

## Options Under Consideration

### Option A: Build-Time or Local-Artifact Pinning

The write client derives its schema hash from local config or a local schema-sync artifact and sends that exact value until the local artifact changes.

Why it is attractive:

- Preserves the compatibility guard as a real assertion about local code/config.
- Aligns naturally with CLI and CI flows where schema changes are explicit.
- Keeps write behavior deterministic and reviewable.

### Option B: Process-Start Pinning

The client fetches schema once at startup, pins that hash for the process lifetime, and fails hard on mismatch until the process is restarted or reinitialized.

Why it may be acceptable:

- Preserves some pinning semantics.
- Simpler than maintaining a local artifact contract in some runtime environments.

Why it is weaker than Option A:

- The pinned value still comes from the live server, not from the local code/config that the write path is meant to protect.

### Option C: Automatic Refresh and Retry

The client fetches the latest schema hash after a mismatch and retries the write automatically.

Why it is currently rejected:

- It turns the schema hash check into a cache invalidation step instead of a compatibility boundary.
- It makes write outcomes depend on implicit runtime refresh behavior rather than an explicit operator action.

## Deferred Decision

This ADR remains proposed until MDCMS specifies SDK or CLI write helpers that need schema hash pinning behavior beyond the current server-side enforcement.

Resolve this ADR before introducing:

- SDK write methods that send content mutations directly
- automatic client-managed schema hash refresh behavior
- build or deployment workflows that promise schema-aware writes without local schema pinning

## Related Specs

- `docs/specs/SPEC-004-schema-system-and-sync.md`
- `docs/specs/SPEC-008-cli-and-sdk.md`
