# Studio Review App

Private Next.js review surface for MDCMS Studio.

## Purpose

- Provide deterministic Studio PR preview routes without the full Compose stack.
- Exercise the real `@mdcms/studio` shell against a review-only bootstrap and
  runtime asset subtree.
- Keep mock data and review scenarios isolated from the production example app.

## Local Run

From the workspace root:

```bash
bun run studio:review:dev
```

This command:

1. builds review runtime artifacts into `apps/studio-review/.generated/runtime`
2. starts the review app on `http://127.0.0.1:4273`

## Scenario Routes

- `/review/editor/admin`
- `/review/editor/admin/content/post/11111111-1111-4111-8111-111111111111`
- `/review/owner/admin`
- `/review/owner/admin/schema`
- `/review/viewer/admin`
- `/review/schema-error/admin/schema`

## Notes

- The review app is repo-internal tooling and does not change production Studio
  contracts.
- Review API responses live under the app-local
  `/review-api/:scenario/api/v1/*` subtree.
  subtree.
- The normal `apps/studio-example` app remains the real host-app smoke target.
