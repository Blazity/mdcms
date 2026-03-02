# @mdcms/studio

Host-embedded Studio package boundary for MDCMS.

## Studio Embed Shell (CMS-47)

- `Studio` is exported from `@mdcms/studio` as the host app entrypoint.
- CMS-47 shell states are supported via `state` prop:
  - `loading`
  - `ready` (default)
  - `empty`
  - `error`
  - `forbidden`
- Role-aware shell behavior is supported via `role` prop:
  - `owner`
  - `admin`
  - `editor`
  - `viewer` (default; viewer-safe action constraints)
- Branding is fixed to `MDCMS` in MVP.
- Runtime loader/bootstrap execution is deferred to later roadmap tasks.
- Shell composition follows a Tailwind + shadcn-style component approach.

Usage:

```tsx
import { Studio, type StudioConfig } from "@mdcms/studio";

const config: StudioConfig = {
  project: "marketing-site",
  serverUrl: "http://localhost:4000",
};

export default function AdminPage() {
  return <Studio config={config} />;
}
```

## Action Catalog Adapter (CMS-5)

- `createStudioActionCatalogAdapter(baseUrl, options?)` provides a typed Eden/Treaty client for:
  - `list()` -> `GET /api/v1/actions`
  - `getById(actionId)` -> `GET /api/v1/actions/:id`
- Treaty typing is sourced from `@mdcms/server` (`ActionCatalogContractApp`) so backend routes remain the contract source of truth.
- Adapter payloads are validated with shared runtime contract validators from `@mdcms/shared`.
- The adapter is metadata-only and does not bypass backend authorization rules.

## Runtime Artifact Builder

- `buildStudioRuntimeArtifacts(...)` bundles the remote Studio module entry and emits immutable artifacts:
  - `dist/assets/<buildId>/<entryFile>`
  - `dist/bootstrap/<buildId>.json`
- `buildId` and `integritySha256` are derived from bundled artifact bytes.
- `src/lib/remote-module.ts` provides the typed `RemoteStudioModule` mount entrypoint.

## Build

- `bun nx build studio`
- `bun nx run studio:dev`
- `bun nx typecheck studio`
- `bun nx test studio`

## Embed Smoke Scaffold

- Sample host app: `apps/studio-example`
- Catch-all embed route: `app/admin/[[...path]]/page.tsx`
- CI-blocking smoke command:

```bash
bun run studio:embed:smoke
```
