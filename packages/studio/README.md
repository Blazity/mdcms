# @mdcms/studio

Host-embedded Studio package boundary for MDCMS.

## Studio Embed Shell

- `Studio` is exported from `@mdcms/studio` as the host app entrypoint.
- `PropsEditorComponent` and `PropsEditorComponentProps` are exported from
  `@mdcms/studio` for authoring custom MDX props editors that run inside the
  embedded Studio runtime.
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
- `components[*].loadPropsEditor` should resolve a `PropsEditorComponent`. The
  runtime resolves that editor lazily and moves through these states:
  - `loading` while the async resolver is pending
  - `ready` when the custom editor resolves
  - `auto-form` when no custom editor resolves but extracted props can still be
    mapped into generated controls
  - `empty` when the component has no editable props
  - `error` when editor resolution fails
  - `forbidden` when editing is unavailable for the current session
- `PropsEditorComponent<T>` receives `value: Partial<T>` because component
  props may still be incomplete during initial insertion. `readOnly` keeps the
  editor mounted for inspection and blocks mutation through `onChange(...)`.
- The authored `mdcms.config.ts` object is the source of truth for local MDX
  component metadata and runtime loaders. No backend component sync is
  required.
- `prepareStudioConfig(...)` is the node-side helper for enriching component
  registrations with `extractedProps` metadata before render, but the result
  must still respect the server-to-client serialization boundary.
- `prepareStudioConfig(...)` also validates authored `propHints` against the
  extracted component prop shapes, so invalid widget overrides fail before the
  browser runtime mounts.
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

## Routed Document Editor

- Remote runtime route: `/admin/content/:type/:documentId`
- The embedded Studio mount context now carries `documentRoute` alongside the
  existing auth and host-bridge data:
  - `project`
  - `environment`
  - `write.canWrite`
  - `write.schemaHash` when draft writes are allowed, or `write.message` when
    the route must stay read-only
- `loadStudioRuntimeFromBootstrap(...)` derives `documentRoute.write` from the
  local authored config. Write-enabled routes require enough local config data
  to deterministically derive the active environment schema hash.
- In practice that means the host must provide authored config with:
  - `project`
  - `environment`
  - the local schema/config data required by
    `resolveStudioDocumentRouteSchemaCapability(...)`
- If the runtime cannot derive that local schema hash, the routed editor still
  loads draft content and version history but stays read-only for draft
  mutations.
- The routed document page now owns the live MVP document workflow against the
  existing content API contracts:
  - draft load via `GET /api/v1/content/:documentId?draft=true`
  - debounced draft save via `PUT /api/v1/content/:documentId`
  - publish via `POST /api/v1/content/:documentId/publish`
  - version history via `GET /api/v1/content/:documentId/versions`
  - arbitrary version diff by fetching any two selected immutable versions from
    `GET /api/v1/content/:documentId/versions/:version`
- The current routed editor is intentionally truthful about MVP scope:
  - publish, version history, and arbitrary version comparison are live
  - schema-hash mismatch recovery UX, locale switching, unpublish, restore, and
    other follow-up workflows remain owned by their later tasks and are not
    exposed here as fake controls

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
- The markdown pipeline now runs through real TipTap parsing/serialization in
  the Bun test runtime as well as the browser-facing editor surface, so
  round-trip tests exercise the same engine used by the document route.
- Serialization now fails with explicit runtime errors when TipTap markdown
  serializer hooks are unavailable or return invalid data.
- Round-trip stability is covered in unit tests to reduce phantom diff risk in
  downstream collaboration and autosave work.

## Nested MDX Wrapper Content (CMS-73)

- The document route now uses a real `@tiptap/react` editor surface instead of
  the previous textarea mock while keeping the current page shell and sidebar
  layout intact.
- MDX wrapper and self-closing components are represented by one generic
  `mdxComponent` node inside `@mdcms/studio`.
- Wrapper components serialize as:
  - `<Component ...> ...markdown children... </Component>`
- Self-closing components serialize as:
  - `<Component ... />`
- Wrapper child content stays in the same editor document and `onChange`
  pipeline as the surrounding markdown, which keeps autosave and future
  collaboration wiring on one draft body string.

## MDX Component Node Views (CMS-74)

- The editor now supports two insertion entrypoints for local MDX components:
  - the `Insert Component` toolbar action
  - `/` slash-triggered insertion inside markdown text blocks
- Both entrypoints use the same local MDX catalog derived from the host config.
- Inserted components continue to use one generic `mdxComponent` node in the
  TipTap schema; the runtime distinguishes:
  - `Void` components rendered as self-closing tags
  - `Wrapper` components rendered with opening/closing tags and nested rich
    text content
- Wrapper insertions seed an editable nested block, but empty wrapper bodies now
  serialize back to clean MDX without placeholder `&nbsp;` output.
- The sidebar MDX props panel is selection-bound:
  - no component selected -> idle state
  - selected component missing from local catalog -> unresolved state
  - selected component with custom editor -> existing async custom-editor
    lifecycle applies
  - selected component without custom editor -> auto-form fallback applies
- Auto-form generation for wrapper components excludes the `children` rich-text
  prop from the props panel because nested content is edited directly inside the
  node view.
- Inline preview now renders through the host bridge inside each node view using
  `hostBridge.renderMdxPreview(...)`, with deterministic fallback copy when the
  local host app cannot resolve that component.
- Read-only / forbidden editor states keep preview visible while blocking
  insertion and prop mutation.

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
- `bun nx run studio:dev` (watches TypeScript output and rebuilds the runtime artifact)
- `bun nx typecheck studio`
- `bun nx test studio`

## Embed Smoke Scaffold

- Sample host app: `apps/studio-example`
- Catch-all embed route: `app/admin/[[...path]]/page.tsx`
- CI-blocking smoke command:

```bash
bun run studio:embed:smoke
```
