# Studio Review App

Private Next.js review surface for MDCMS Studio.

## Purpose

- Provide deterministic Studio PR preview routes without the full Compose stack
- Exercise the real `@mdcms/studio` shell against a review-only bootstrap and runtime asset subtree
- Keep mock data and review scenarios isolated from the production example app

## Local Run

From the workspace root:

```bash
bun run studio:review:dev
```

This command:

1. Builds review runtime artifacts into `apps/studio-review/.generated/runtime`
2. Starts a workspace package watch for `@mdcms/shared`, `@mdcms/cli`, and `@mdcms/studio`
3. Keeps review runtime artifacts in sync while Studio runtime sources change
4. Starts the review app on `http://127.0.0.1:3000`

## Scenario Routes

| Route | Description |
| --- | --- |
| `/review/editor/admin` | Editor role view |
| `/review/editor/admin/content/post/:id` | Editor document view |
| `/review/owner/admin` | Owner role view |
| `/review/owner/admin/schema` | Owner schema view |
| `/review/viewer/admin` | Viewer role view |
| `/review/schema-error/admin/schema` | Schema error state |

## Notes

- This is repo-internal tooling and does not change production Studio contracts.
- Review API responses live under the app-local `/review-api/:scenario/api/v1/*` subtree.
- The `apps/studio-example` app remains the real host-app integration target.
