# @mdcms/studio

## What this is

An embeddable React component that provides the full CMS editing interface. The host app (typically Next.js) renders `<Studio />` in a catch-all route. On mount, Studio fetches a runtime bundle from the MDCMS server, verifies its integrity, and boots the admin UI inside the host app's process.

The editor is TipTap-based with support for MDX components. The UI is schema-driven: form fields, validation, and component catalogs are all generated from the content type definitions synced to the server.

## Boundaries

- Does not define content types or schema. It reads them from the server's schema registry.
- Does not persist content directly. All writes go through the server API.
- Does not handle authentication on its own. It uses the server's session or API key auth.
- Does not run independently. It must be embedded in a host React application.

## Relevant specs

- `docs/specs/SPEC-006-studio-runtime-and-ui.md`
- `docs/specs/SPEC-007-editor-mdx-and-collaboration.md`
- `docs/adrs/ADR-003-studio-delivery-approach-c.md`

## Dev

```bash
bun nx dev studio-example
```
