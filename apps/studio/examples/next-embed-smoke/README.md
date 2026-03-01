# Next.js Studio Embed Smoke App

This sample app exists for CMS-8 verification.

## Purpose

- Demonstrate host app embedding of `@mdcms/studio` at a catch-all route.
- Provide a deterministic smoke target for CI (`/admin/*` route boot).

## Routes

- `/` - host app page (no Studio mount expected)
- `/admin` - Studio embed shell
- `/admin/<any>` - Studio embed shell via catch-all route

## Local Run

From workspace root:

```bash
bun run studio:embed:smoke
```
