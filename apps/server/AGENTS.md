# @mdcms/server

## What this is

The HTTP backend that everything connects to. Elysia on Bun, PostgreSQL for content, auth, and sessions; Redis is provisioned for caching/queues/rate-limiting; S3 for media. Every content operation (create, edit, publish, delete) and every auth flow (session, API key, CLI loopback OAuth, SSO) runs through here.

The server is organized around a module system. Core modules (`core.system`, `domain.content`) provide the built-in functionality. New capabilities should be added as modules rather than modifying core routes directly.

## Boundaries

- Does not serve the Studio UI directly. Studio is a separate React component that calls this server's API.
- Does not handle filesystem sync. That's the CLI's job.
- Does not define content types. Schema definitions come from the user's `mdcms.config.ts` and are synced via the schema API.

## Relevant specs

- `docs/specs/SPEC-002-system-architecture-and-extensibility.md`
- `docs/specs/SPEC-005-auth-authorization-and-request-routing.md`
- `docs/specs/SPEC-003-content-storage-versioning-and-migrations.md`
- `docs/adrs/ADR-001-backend-framework-bun-elysia.md`

## Dev

```bash
bun nx dev server
```
