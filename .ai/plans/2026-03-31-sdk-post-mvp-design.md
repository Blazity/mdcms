# SDK Post-MVP Epic Design

**Date:** 2026-03-31

## Goal

Capture the approved post-MVP SDK backlog split so Jira can reflect clear SDK ownership without expanding MVP scope.

## Decisions

- MVP SDK remains read-only.
- Strong SDK type safety is desired, but it is post-MVP.
- Full SDK mutations are also post-MVP.
- Type safety should be schema-derived rather than based on user-authored types.

## Epic Split

### SDK Type System & Query Surface

Owns schema-derived type generation and the typed read/query experience:

- generated content type map from schema artifacts
- typed `get` / `list`
- typed filter and sort inputs
- typed `resolve` path support
- cursor pagination support in the SDK query surface
- typed read docs, examples, and contract coverage

### SDK Mutations & Write Safety

Owns direct SDK write flows and the compatibility boundary around writes:

- SDK write contract/spec work after schema-hash pinning is resolved
- local schema-hash artifact flow for SDK write clients
- create / update mutations
- delete / restore mutations
- publish / unpublish mutations
- version history / restore helpers
- deterministic mutation error taxonomy
- write docs, examples, and compatibility coverage

## Dependency Notes

- `CMS-147` remains the architecture input for SDK write safety and should not be moved until the spike is complete.
- `CMS-100` remains under `Search`.
- `CMS-908` should move under `SDK Type System & Query Surface` because it is SDK query-surface work.
- SDK write implementation tasks must depend on the post-`CMS-147` write contract/spec task.
