---
status: accepted
canonical: true
created: 2026-03-11
last_updated: 2026-03-11
legacy_sections:
  - 1
  - 2
---

# ADR-002 Database as Source of Truth

This is the live canonical document under `docs/`.

## Context

MDCMS serves brownfield Markdown/MDX codebases, but it also needs collaborative editing, version history, environments, permissions, and reliable backend-driven workflows. A file-first source of truth would make those guarantees difficult and would tightly couple runtime behavior to the filesystem.

## Decision

Use the database as the single source of truth for content state. Files in the application repository are synchronized artifacts managed through CLI workflows (`cms pull` and `cms push`), not the authoritative record.

## Rationale

- Draft state, immutable versions, soft delete, migrations, and environment promotion all require transactional backend ownership.
- Studio editing and future collaboration features depend on mutable server-side state and concurrency control.
- Treating files as sync outputs preserves compatibility with Markdown/MDX application code without making the filesystem the system of record.

## Consequences

- Content files should be `.gitignore`d and removed from Git tracking where they were previously committed.
- CLI workflows become part of the core operator contract, not an optional convenience.
- Data-layer guarantees take precedence over filesystem convenience when conflicts appear.

## Related Specs

- `/Users/karol/Desktop/mdcms/docs/specs/SPEC-001-platform-overview-and-scope.md`
- `/Users/karol/Desktop/mdcms/docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- `/Users/karol/Desktop/mdcms/docs/specs/SPEC-008-cli-and-sdk.md`
