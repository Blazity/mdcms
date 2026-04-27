# CMS-26 Resolve Reference Expansion Design

## Context

CMS-26 owns `resolve=` reference expansion for content reads. The current owning
content spec defines `resolve` only as a list query parameter, while the SDK
docs already show `resolve` on single-document reads. The approved design for
this task closes that gap and defines deterministic read-time behavior for
missing or invalid references.

## Approved Decisions

### Endpoint Scope

`resolve` is supported on every endpoint that returns a full content payload:

- `GET /api/v1/content`
- `GET /api/v1/content/:documentId`
- `GET /api/v1/content/:documentId/versions/:version`

`resolve` is not added to `GET /api/v1/content/:documentId/versions` because
that endpoint returns summaries, not full document payloads.

### Resolution Mode

- Resolution is shallow only.
- The server expands exactly the fields named in `resolve`.
- The server does not recurse into references inside resolved documents.

### Scope And Visibility

- Resolution is always constrained to the explicit `(project, environment)`
  request target.
- Published reads resolve against published-visible targets.
- `draft=true` reads resolve against draft-visible targets.
- Version snapshot reads resolve referenced targets using published-visible
  reads because that endpoint does not expose `draft=true`.

### Response Shape

- Requested reference fields are replaced inline in the returned payload.
- Successfully resolved fields become embedded content document objects.
- Unresolved fields become `null`.
- Each returned document may include an optional top-level `resolveErrors` map.
- `resolveErrors` keys use full field paths, for example
  `frontmatter.author` or `frontmatter.hero.author`.
- `resolveErrors` is omitted when there are no resolution failures.

Recommended unresolved shape:

```json
{
  "resolveErrors": {
    "frontmatter.author": {
      "code": "REFERENCE_NOT_FOUND",
      "message": "Referenced document could not be resolved in the target project/environment.",
      "ref": {
        "documentId": "uuid",
        "type": "Author"
      }
    }
  }
}
```

### Validation And Error Semantics

- `resolve` accepts repeated query params or equivalent string-array forms.
- Each requested field path must map to a reference field in the resolved schema
  for the returned document type.
- Unknown fields, non-reference fields, or fields excluded from the target
  environment schema fail deterministically with `INVALID_QUERY_PARAM` (`400`).
- Stored target type metadata remains enforced during expansion.
- Read-time failures for secondary referenced targets do not fail the primary
  content read. They yield `null` plus `resolveErrors`.
- `resolveErrors[*].code` must distinguish at least:
  - `REFERENCE_NOT_FOUND`
  - `REFERENCE_DELETED`
  - `REFERENCE_TYPE_MISMATCH`
  - `REFERENCE_FORBIDDEN`

## Required Spec Delta

### SPEC-003

Update the content spec to:

- add `resolve` to `GET /api/v1/content/:documentId`
- add `resolve` to `GET /api/v1/content/:documentId/versions/:version`
- define shallow-only semantics
- define top-level `resolveErrors`
- define deterministic validation and unresolved-reference behavior

### SPEC-008

Keep the SDK example aligned with the now-normative contract for single-document
reads using `resolve`.

## Verification Expectations

CMS-26 implementation should verify:

- list, single-document, and immutable-version reads all honor the same
  `resolve` contract
- version-summary reads remain unchanged
- published reads do not leak draft-only referenced content
- `draft=true` reads can resolve draft-visible referenced content
- invalid `resolve` paths fail with `INVALID_QUERY_PARAM`
- missing, deleted, type-mismatched, and forbidden referenced targets produce
  `null` plus `resolveErrors`
- all reference expansion remains bound to the explicit routed environment

## Notes

This design note is local workspace documentation under `docs/plans/` and
should remain untracked per repository rules.
