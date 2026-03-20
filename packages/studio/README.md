# @mdcms/studio

Host-embedded Studio package boundary for MDCMS.

## Studio Embed Shell

- `Studio` is exported from `@mdcms/studio` as the host app entrypoint.
- The shell is intentionally thin:
  - fetches `GET /api/v1/studio/bootstrap`
  - validates compatibility and runtime integrity
  - loads the remote Studio module
  - creates the host bridge
  - passes `basePath` plus auth/api config into `mount(...)`
- The shell owns only fatal startup failures:
  - bootstrap fetch failed
  - bootstrap manifest invalid/incompatible
  - runtime asset load failed
  - remote mount failed
- After `mount(...)` succeeds, the remote runtime owns routing, navigation,
  loading/empty/forbidden/error states, and all normal Studio rendering.
- MVP runtime execution is `module` only.

Usage:

```tsx
import config from "../../apps/studio-example/mdcms.config";
import { Studio } from "@mdcms/studio";

export default function AdminPage() {
  return <Studio config={config} basePath="/admin" />;
}
```

- `config.environment` is required by the Studio shell even though the shared
  `mdcms.config.ts` contract keeps it optional for CLI default-routing use
  cases.
- `basePath` is required because the remote runtime cannot infer its subtree
  root from deep links alone.
- The recommended host-app setup is to keep a single `mdcms.config.ts`
  authored with `defineConfig(...)` from `@mdcms/cli`, then pass that object to
  Studio.

## Document Shell Route (CMS-50)

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
- `src/lib/remote-module.ts` provides the typed `RemoteStudioModule` mount entrypoint for the full remote Studio app.
- Runtime artifacts are built in `@mdcms/studio`, but publication happens from `@mdcms/server` through:
  - `GET /api/v1/studio/bootstrap`
  - `GET /api/v1/studio/assets/:buildId/*`
- The bootstrap contract is fixed to `mode: "module"`.
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
