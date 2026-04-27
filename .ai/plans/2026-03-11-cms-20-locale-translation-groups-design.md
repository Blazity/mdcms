# CMS-20 Locale Translation Groups Design

## Scope

Implement CMS-20 inside the existing server content API surface.

In scope:

- add translation-group creation semantics to `POST /api/v1/content`
- preserve the existing response shape (`translationGroupId` is already exposed)
- enforce project/environment scoping for variant creation
- add deterministic conflict handling for duplicate locales within a translation
  group
- document the new operator-facing create contract in the server package docs

Out of scope:

- new routes for locale variants
- Studio locale switcher UX and optional prefill flow (CMS-63)
- clone/promote remapping behavior (later environment tasks)
- full schema-aware validation for every content write path
- migrations or table/index changes; the database already has the required
  `translation_group_id` column and uniqueness index from CMS-11/CMS-12

## Spec Delta Summary

Confirmed contract delta for this task:

- `POST /api/v1/content` gains optional `sourceDocumentId`
- omitted `sourceDocumentId` keeps existing "create a brand new logical
  document" semantics
- provided `sourceDocumentId` creates a new locale variant in the same
  translation group as the source document
- `sourceDocumentId` is valid for any non-deleted source document in the routed
  `project` and `environment`
- the server derives `translation_group_id` from the source document; callers do
  not send raw `translationGroupId`

This closes the gap between:

- the data model requirement that localized variants share a
  `translation_group_id`
- the Studio UX requirement that users can switch to an untranslated locale and
  create the variant
- the canonical content create contract, which previously had no way to express
  "create a sibling translation of this existing document"

## Approved Approach

Keep one create endpoint and add an explicit variant-creation mode.

`POST /api/v1/content` now has two behaviors:

1. **New logical document**
   - request omits `sourceDocumentId`
   - server generates a new `document_id`
   - server generates a new `translation_group_id`

2. **New locale variant**
   - request includes `sourceDocumentId`
   - server resolves the source document within the routed scope
   - server generates a new `document_id`
   - server reuses the source document's `translation_group_id`

This keeps the route surface minimal while making variant creation explicit and
safe. The request does not accept raw `translationGroupId`, because that would
let callers bypass scope and type checks.

## Request Contract

`POST /api/v1/content` continues to accept:

- `path`
- `type`
- `locale`
- `format`
- `frontmatter`
- `body`
- optional actor fields

New optional field:

- `sourceDocumentId`

Rules:

- callers must still send the full draft payload; the server does not
  auto-prefill content from the source document
- Studio can implement optional prefill client-side later by reading the source
  draft/published document and submitting copied content when desired
- `path` remains explicit input; the server does not infer translation groups
  from `path`

## Validation and Data Flow

### Variant creation

When `sourceDocumentId` is present:

1. resolve the source document inside the routed `project` and `environment`
2. reject missing or soft-deleted sources with `NOT_FOUND`
3. require request `type` to match the source document's `schema_type`
4. resolve the source type's schema registry entry in the same scope
5. reject variant creation for non-localized schema types with `INVALID_INPUT`
6. validate that the requested locale does not already exist in the source
   translation group for a non-deleted document
7. create the new row with:
   - fresh `document_id`
   - inherited `translation_group_id`
   - caller-provided `path`, `locale`, `format`, `frontmatter`, and `body`

### Locale policy enforcement

CMS-20 adds schema-backed locale validation only where it is required for the
new translation-group behavior.

- in variant-creation mode, the server uses scoped schema registry data to
  verify that the type is localized and that the requested locale is allowed for
  the environment's synced locale configuration
- CMS-20 does **not** broaden content writes into full schema-aware validation
  for every create/update path; that stays aligned with later content-core work

This keeps the task scoped while preventing invalid translation-group writes.

## Error Handling

Existing deterministic errors remain unchanged where they still apply:

- `CONTENT_PATH_CONFLICT` (`409`) remains the `(project, environment, locale,
path)` uniqueness error
- `NOT_FOUND` (`404`) remains the missing/out-of-scope/soft-deleted source
  error for `sourceDocumentId`
- `INVALID_INPUT` (`400`) covers malformed or invalid variant requests, such as:
  - `sourceDocumentId` type mismatch
  - `sourceDocumentId` used for a non-localized type
  - locale rejected by the synced supported-locale set

New deterministic conflict:

- `TRANSLATION_VARIANT_CONFLICT` (`409`) when the translation group already has
  a non-deleted document in the requested locale

The DB-backed store should map the existing unique index on
`(project_id, environment_id, translation_group_id, locale)` to
`TRANSLATION_VARIANT_CONFLICT` so race conditions still return the same public
error code.

## Testing

Add coverage in `apps/server/src/lib/content-api.test.ts` for:

- in-memory create flow reusing `translationGroupId` when `sourceDocumentId` is
  provided
- duplicate locale rejection within one translation group
- DB-backed variant creation reusing `translationGroupId` while generating a new
  `documentId`
- rejection of `sourceDocumentId` from another project/environment
- rejection of soft-deleted sources
- rejection of non-localized source types
- rejection of unsupported locales for localized types

Verification commands:

- `bun test apps/server/src/lib/content-api.test.ts`
- `bun run format:check`
- `bun run check`

## Documentation

Document the new create contract in `apps/server/README.md` at the point of
use:

- `POST /api/v1/content` supports optional `sourceDocumentId`
- omitted `sourceDocumentId` creates a new logical document
- provided `sourceDocumentId` creates a locale variant in the source
  translation group
- duplicate locale conflicts return `TRANSLATION_VARIANT_CONFLICT`

## Repo Policy Note

This design file is intentionally stored in `docs/plans/` as a local planning
artifact and should remain untracked per the repository instructions in
`AGENTS.md`.
