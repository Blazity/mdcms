# @mdcms/studio

Host-embedded Studio package boundary for MDCMS.

## Studio Embed Shell

- `Studio` is exported from `@mdcms/studio` as the host app entrypoint.
- The package root is intentionally client-only so host-app imports do not pull
  remote runtime internals into server-component graphs.
- The shell is intentionally thin:
  - fetches `GET /api/v1/studio/bootstrap`
  - validates compatibility and runtime integrity
  - loads the remote Studio module
  - creates the host bridge
  - passes `basePath` plus auth/api config into `mount(...)`
- The server owns Studio publication selection:
  - one `active` build
  - optional `lastKnownGood` build
  - operator kill-switch state
- The shell owns only fatal startup failures and startup-disabled outcomes:
  - bootstrap fetch failed
  - bootstrap response invalid/incompatible
  - bootstrap returned `STUDIO_RUNTIME_DISABLED` or `STUDIO_RUNTIME_UNAVAILABLE`
  - runtime asset load failed
  - remote mount failed
- If integrity, signature, or compatibility validation rejects the served build,
  the shell retries `GET /api/v1/studio/bootstrap` exactly once with:
  - `rejectedBuildId`
  - `rejectionReason`
- The shell does not keep browser-local fallback state and does not choose
  between active and fallback builds on its own.
- After `mount(...)` succeeds, the remote runtime owns routing, navigation,
  loading/empty/forbidden/error states, and all normal Studio rendering.
- MVP runtime execution is `module` only.
- The current remote runtime route set includes:
  - `/admin`
  - `/admin/content`
  - `/admin/content/:type`
  - `/admin/content/:type/:documentId`
  - `/admin/environments`
  - `/admin/media`
  - `/admin/schema`
  - `/admin/users`
  - `/admin/settings`
  - `/admin/workflows`
  - `/admin/api`
  - `/admin/trash`
- `/admin/media`, `/admin/schema`, `/admin/workflows`, and `/admin/api` are
  present as runtime-owned UI surfaces in the current phase and may render
  shell-only/mock content until their backend wiring is implemented.

Usage:

```tsx
// app/admin/[[...path]]/page.tsx
import { createStudioEmbedConfig } from "@mdcms/studio/runtime";

import config from "../../apps/studio-example/mdcms.config";
import { AdminStudioClient } from "./admin-studio-client";

export default async function AdminPage() {
  return <AdminStudioClient config={createStudioEmbedConfig(config)} />;
}
```

```tsx
// app/admin/admin-studio-client.tsx
"use client";

import { Studio, type MdcmsConfig } from "@mdcms/studio";

export function AdminStudioClient({ config }: { config: MdcmsConfig }) {
  return <Studio config={config} basePath="/admin" />;
}
```

- When authored MDX component registrations include runtime loader callbacks
  (`components[*].load`, `components[*].loadPropsEditor`), the embedding
  component must be client-side because those callbacks are not
  server-to-client serializable.
- The authored `mdcms.config.ts` object is the source of truth for local MDX
  component metadata and runtime loaders. No backend component sync is
  required.
- `prepareStudioConfig(...)` is the node-side helper for enriching component
  registrations with `extractedProps` metadata before render, but the result
  must still respect the server-to-client serialization boundary.
- `prepareStudioConfig(...)` accepts `{ cwd, resolveImportPath?, tsconfigPath? }`.
  Use `resolveImportPath` when authored `importPath` values rely on workspace
  aliases that are not resolvable from plain filesystem paths alone.
- `Studio` still accepts the authored config directly as long as `environment`
  is present; that path simply skips node-side MDX prop extraction.
- `createStudioEmbedConfig(...)` remains available from `@mdcms/studio/runtime`
  for server-safe routes that need only the plain
  `{ project, environment, serverUrl }` shell config. It intentionally strips
  client-only MDX loader callbacks.
- `config.environment` must still be present in authored config even though the
  shared `mdcms.config.ts` contract keeps it optional for CLI default-routing
  use cases.
- `basePath` is required because the remote runtime cannot infer its subtree
  root from deep links alone.
- The recommended host-app setup is to keep a single `mdcms.config.ts`
  authored with `defineConfig(...)` from `@mdcms/cli`, then pass that object to
  Studio from a client component.

## Document Shell Route (CMS-50)

- Import path: `@mdcms/studio/document-shell`
- This helper remains available for the current shell-first implementation
  slices, but the remote runtime becomes the owner of document-route behavior
  once the runtime loader path is fully enabled.
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

- Import path: `@mdcms/studio/markdown-pipeline`
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

- Import path: `@mdcms/studio/action-catalog-adapter`
- `createStudioActionCatalogAdapter(baseUrl, options?)` provides a typed Eden/Treaty client for:
  - `list()` -> `GET /api/v1/actions`
  - `getById(actionId)` -> `GET /api/v1/actions/:id`
- Treaty typing is sourced from `@mdcms/server` (`ActionCatalogContractApp`) so backend routes remain the contract source of truth.
- Adapter payloads are validated with shared runtime contract validators from `@mdcms/shared`.
- The adapter is metadata-only and does not bypass backend authorization rules.

## Runtime Artifact Builder

- Import path: `@mdcms/studio/build-runtime`
- `buildStudioRuntimeArtifacts(...)` bundles the remote Studio module entry and emits immutable artifacts:
  - `dist/assets/<buildId>/<entryFile>`
  - `dist/bootstrap/<buildId>.json`
- `buildId` and `integritySha256` are derived from bundled artifact bytes.
- `src/lib/remote-module.ts` provides the typed `RemoteStudioModule` mount entrypoint for the full remote Studio app.
- Runtime artifacts are built in `@mdcms/studio`, but publication happens from `@mdcms/server` through:
  - `GET /api/v1/studio/bootstrap`
  - `GET /api/v1/studio/assets/:buildId/*`
- The bootstrap contract is fixed to `mode: "module"`.
- Bootstrap success returns a ready payload that identifies whether the served
  runtime came from `active` or `lastKnownGood`.
- The shell validates manifest shape, compatibility bounds, runtime-byte
  integrity, and the current placeholder signature/key invariants before mount.

## Remote Runtime Composition

- The remote runtime is the full Studio app after startup.
- Composition surfaces are resolved inside the remote runtime, not registered by
  the shell:
  - `routes`
  - `navItems`
  - `slotWidgets`
  - `fieldKinds`
  - `editorNodes`
  - `actionOverrides`
  - `settingsPanels`
- Collision rules are deterministic:
  - normalized route conflicts fail startup
  - `slotWidgets` require explicit numeric `priority`
  - slot ordering sorts by `priority` descending, then `id` ascending
  - unknown field kinds fall back to a safe JSON editor with warning logs

## Runtime Helpers

- Import path: `@mdcms/studio/runtime`
- `prepareStudioConfig(...)` runs node-side TypeScript prop extraction for
  local MDX component registrations and returns the Studio-aware config shape.
- `createStudioEmbedConfig(...)`, `resolveStudioEnv(...)`,
  `createStudioRuntimeContext(...)`, and `formatStudioErrorEnvelope(...)`
  remain available as explicit runtime helpers without widening the client root
  entry.

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
