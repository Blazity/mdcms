# Changesets

This folder is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs for the published `@mdcms/*` packages.

## Published packages

- `@mdcms/shared` — Shared contracts, types, and validators
- `@mdcms/sdk` — Client SDK
- `@mdcms/studio` — Embeddable Studio UI component
- `@mdcms/cli` — CLI for content workflows

## Workflow

1. When making a change that should be released, run `bun changeset` to create a changeset file.
2. Before releasing, run `bun changeset version` to bump versions and update changelogs.
3. Publish with `bun changeset publish`.
