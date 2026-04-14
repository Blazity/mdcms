# @mdcms/sdk

## What this is

A thin TypeScript client for reading content from the MDCMS API. `createClient()` takes server URL, API key, project, and environment. Then `client.get()` and `client.list()` fetch documents with optional reference resolution, locale filtering, and pagination.

The SDK is framework-agnostic. It works in Next.js, Remix, Astro, or any environment with `fetch`. The goal is to stay minimal and predictable.

## Boundaries

- Read-only. Does not create, update, publish, or delete content.
- Does not manage auth flows. It takes an API key and sends it as a Bearer token.
- Does not handle caching, revalidation, or ISR. That's the consuming framework's responsibility.
- Does not depend on any other MDCMS package at runtime except `@mdcms/shared` for types.

## Relevant specs

- `docs/specs/SPEC-008-cli-and-sdk.md`

## Dev

```bash
bun nx test sdk
```
