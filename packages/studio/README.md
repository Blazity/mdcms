# @mdcms/studio

Host-embedded Studio package boundary for MDCMS.

## Studio Embed Shell (CMS-47)

- `Studio` is exported from `@mdcms/studio` as the host app entrypoint.
- Internal Studio surfaces are resolved from catch-all route path segments:
  - `dashboard`
  - `content`
    - schema-first mode: `/admin/content`
    - folder-path mode: `/admin/content/by-path/*`
  - `trash`
  - `environments`
  - `users`
  - `settings`
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
- Admin-only surfaces (`users`, `settings`) render `forbidden` for
  non-admin/non-owner roles when state is otherwise `ready`.
- Content surface supports deterministic mode switching between:
  - schema-first navigation
  - folder-path navigation
- Runtime loader/bootstrap execution is deferred to later roadmap tasks.
- Shell composition follows a Tailwind + shadcn-style component approach.

Usage:

```tsx
import config from "../../apps/studio-example/mdcms.config";
import { Studio } from "@mdcms/studio";

export default function AdminPage() {
  return <Studio config={config} path={["content", "posts"]} />;
}
```

- `config.environment` is required by the Studio shell even though the shared
  `mdcms.config.ts` contract keeps it optional for CLI default-routing use
  cases.
- The recommended host-app setup is to keep a single `mdcms.config.ts`
  authored with `defineConfig(...)` from `@mdcms/cli`, then pass that object to
  Studio.

## Document Shell Route (CMS-50)

- Route contract: `/admin/content/:type/:documentId`
- `loadStudioDocumentShell(config, { type, documentId, locale })` fetches draft
  content from:
  - `GET /api/v1/content/:documentId?draft=true`
  - with explicit headers:
    - `X-MDCMS-Project`
    - `X-MDCMS-Environment`
    - `X-MDCMS-Locale`
- `Studio` accepts `documentShell` data so host apps can render scoped
  load/error/ready shell states without losing route context.
- Error states include typed `errorCode` values (`UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `DOCUMENT_LOAD_FAILED`, `INTERNAL_ERROR`, `UNKNOWN_ERROR`) plus
  an operator-facing `errorMessage`.

## TipTap Markdown Baseline (CMS-51)

- Markdown editor baseline is wired through TipTap:
  - `@tiptap/core`
  - `@tiptap/starter-kit`
  - `@tiptap/markdown`
- Reusable pipeline helpers:
  - `parseMarkdownToDocument(markdown)`
  - `serializeDocumentToMarkdown(jsonDoc)`
  - `roundTripMarkdown(markdown)`
- Serialization now fails with explicit runtime errors when TipTap markdown
  serializer hooks are unavailable or return invalid data.
- Round-trip stability is covered in unit tests to reduce phantom diff risk in
  downstream collaboration and autosave work.

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
- Under CMS-34, runtime artifacts are still built in `@mdcms/studio`, but publication now happens from `@mdcms/server` through:
  - `GET /api/v1/studio/bootstrap`
  - `GET /api/v1/studio/assets/:buildId/*`
- The MVP bootstrap contract is fixed to `mode: "module"`.
- Loader-side runtime fetch, integrity verification, and execution remain deferred to CMS-60.

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
