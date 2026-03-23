---
status: live
canonical: true
created: 2026-03-11
last_updated: 2026-03-23
---

# SPEC-006 Studio Runtime and UI

This is the live canonical document under `docs/`.

## Studio Runtime Delivery Contract (Approach C)

Studio is loaded through `@mdcms/studio` embedded in host app. The component fetches a bootstrap startup payload and executes backend-served Studio runtime.

```typescript
export type StudioExecutionMode = "module";

export type StudioBootstrapManifest = {
  apiVersion: "1";
  studioVersion: string;
  mode: StudioExecutionMode;
  entryUrl: string;
  integritySha256: string;
  signature: string;
  keyId: string;
  buildId: string;
  minStudioPackageVersion: string;
  minHostBridgeVersion: string;
  expiresAt: string;
};

export type StudioBootstrapRejectionReason =
  | "integrity"
  | "signature"
  | "compatibility";

export type StudioBootstrapReadyResponse = {
  data:
    | {
        status: "ready";
        source: "active";
        manifest: StudioBootstrapManifest;
      }
    | {
        status: "ready";
        source: "lastKnownGood";
        manifest: StudioBootstrapManifest;
        recovery?: {
          rejectedBuildId: string;
          rejectionReason: StudioBootstrapRejectionReason;
        };
      };
};
```

`module` mode remote entry contract:

```typescript
export type RemoteStudioModule = {
  mount: (container: HTMLElement, ctx: StudioMountContext) => () => void;
};

export type StudioMountContext = {
  apiBaseUrl: string;
  basePath: string;
  auth: { mode: "cookie" | "token"; token?: string };
  hostBridge: HostBridgeV1;
};
```

`auth` semantics:

- `cookie` mode is the default. The remote Studio runtime uses credentialed browser requests against `apiBaseUrl` and obtains CSRF bootstrap state from the auth/session endpoints.
- `token` mode uses `Authorization: Bearer <token>` on Studio API requests. In MVP, this bearer token is an MDCMS API key.

Host bridge (minimum):

```typescript
export type HostBridgeV1 = {
  version: "1";
  resolveComponent: (name: string) => React.ComponentType<any> | null;
  renderMdxPreview: (input: {
    container: HTMLElement;
    componentName: string;
    props: Record<string, unknown>;
    key: string;
  }) => () => void;
};
```

## Studio UI

### Embedding

The Studio is a React component published as `@mdcms/studio`. Developers embed it in their app at a catch-all route and pass the Studio subtree root through `basePath`. On mount, the shell fetches `/studio/bootstrap`, verifies the returned runtime manifest and asset, creates the host bridge, and calls the remote `mount(...)` entrypoint.

```tsx
// app/admin/[[...path]]/page.tsx (Next.js App Router example)
import { Studio } from "@mdcms/studio";
import config from "../../../mdcms.config";

export default function AdminPage() {
  return <Studio config={config} basePath="/admin" />;
}
```

The backend may live on a different origin from the host app. Cross-origin Studio embedding is a first-class path; a same-origin reverse proxy is optional, not required. Browser access to the backend follows the Studio origin allowlist and CORS contract defined in `SPEC-005`.

Studio runtime publication selection is server-owned:

- The server tracks one `active` runtime build, an optional `lastKnownGood` runtime build, and an operator kill-switch state.
- `lastKnownGood` is the previously promoted verified publication snapshot. The server may serve it only as a recovery fallback; the shell never promotes or persists fallback builds on its own.
- `GET /api/v1/studio/bootstrap` returns exactly one startup outcome for the caller:
  - a ready payload for the `active` build
  - a ready payload for the `lastKnownGood` build when the active build was rejected during startup validation
  - a deterministic disabled or unavailable error response when no runtime should be started
- The shell never keeps browser-local fallback state and never selects between builds on its own.
- The MVP operator control surface for the kill switch is server configuration or environment only. Enabling or disabling it requires an operator configuration change followed by process restart or redeploy. No Studio UI toggle or public mutation endpoint is exposed in v1.

The shell owns only fatal startup failures and startup-disabled outcomes:

- bootstrap fetch failed
- bootstrap response invalid or incompatible
- bootstrap returned `STUDIO_RUNTIME_DISABLED` or `STUDIO_RUNTIME_UNAVAILABLE`
- runtime asset load failed
- remote `mount(...)` failed

If runtime validation fails because of integrity, signature, or compatibility rejection, the shell retries `GET /api/v1/studio/bootstrap` exactly once with:

- `rejectedBuildId=<buildId>`
- `rejectionReason=integrity|signature|compatibility`

Retry query parameters are optional only as a pair. If either parameter is provided without the other, or if `rejectionReason` is outside the allowed values, bootstrap returns `INVALID_QUERY_PARAM` (`400`).

The server then decides whether to serve `lastKnownGood` or return a deterministic disabled or unavailable response. The shell does not loop beyond that single retry.

After `mount(...)` succeeds, the remote Studio runtime owns all user-visible Studio UI states.

### Routing

The remote Studio runtime uses its own internal path-based router within the catch-all route subtree. The host app framework must be configured to pass all `/admin/*` routes to the Studio shell, and the shell must provide the subtree root through `basePath`.

The remote runtime owns browser-path syncing through the History API after startup. No framework-specific router adapter is required beyond the catch-all route.

Internal Studio routes (examples):

- `/admin` — Dashboard
- `/admin/content` — Content browser (schema-first navigation)
- `/admin/content/:type` — List documents of a specific type
- `/admin/content/:type/:documentId` — Document editor
- `/admin/environments` — Environment management
- `/admin/users` — User management (admin only)
- `/admin/settings` — CMS settings (admin only)
- `/admin/trash` — Deleted content recovery

### Content Navigation

The primary navigation model is **schema-first**: users navigate by content type (BlogPost, Page, Author) rather than folder structure. Each type shows a sortable, filterable list of documents.

Secondary navigation by folder path is available as an alternative view.

### Project Scope and Switching

Each embedded Studio instance is configured with a specific project through `mdcms.config.ts` and shows only that project's content and schema.

For users who manage multiple projects, the Studio header provides a project switcher that links to the other Studio instances they are allowed to access.

### Branding

Fixed MDCMS branding. No white-labeling in MVP. Configurable accent color may be considered.

### Bulk Operations (Post-MVP)

Bulk operations are Post-MVP. When implemented, the content list view supports multi-select with bulk actions:

- **Publish** — Publish all selected drafts
- **Unpublish** — Revert selected documents to draft
- **Delete** — Soft-delete all selected documents
- **Move** — Move selected documents to a different path/folder

### Extensibility Surfaces (Backend-First + Runtime Bundle)

Studio behavior is resolved in this order:

1. Read backend action catalog contract (`/actions` + `/actions/:id`) including action metadata.
2. Fetch and verify Studio bootstrap startup payload (`/studio/bootstrap`) and runtime artifact.
3. Execute the verified Studio runtime in `module` mode.
4. Remote Studio runtime builds its internal composition registry and validates it before first render.
5. Remote Studio runtime renders default UI for actions/forms/widgets from metadata and applies runtime customizations.

Supported Studio extension surfaces in v1:

These are Studio runtime composition surfaces used by first-party/custom runtime builds; they are not an untrusted third-party runtime plugin marketplace API in v1.

- `routes` (additional pages/views)
- `navItems` (navigation entries)
- `slotWidgets` (UI injections into standard slot IDs)
- `fieldKinds` (custom field editors/validators)
- `editorNodes` (TipTap/editor node integrations)
- `actionOverrides` (replace/enhance backend-generated action UI)
- `settingsPanels` (custom settings pages)

Standard slot IDs:

1. `dashboard.main`
2. `content.list.toolbar`
3. `content.list.row.actions`
4. `content.editor.header.actions`
5. `content.editor.sidebar`
6. `content.editor.footer`
7. `settings.sidebar`
8. `settings.panel.<id>`

Runtime composition rules:

- `routes` must be unique after normalized path matching; `/settings` and `/settings/` conflict, and equivalent parameterized shapes also conflict.
- `navItems` sort deterministically by explicit order, then `id`.
- `slotWidgets` must declare explicit numeric `priority`; widgets sort by `priority` descending, then `id` ascending.
- `fieldKinds`, `editorNodes`, `actionOverrides`, and `settingsPanels` must be unique by identifier.
- `settings.sidebar` entries must reference a registered settings panel.
- Unknown or unregistered field kinds fall back to a safe JSON editor and emit structured warning logs instead of failing the runtime.

Security model:

- Action catalog metadata is non-executable and drives generated defaults only.
- `module` mode: remote Studio executes in host JS context via verified runtime artifacts and capability-limited host bridge.
- Backend authorization remains final authority for every operation.

Execution mode:

- `module` is the only supported Studio execution mode in MVP.

---

## Core Runtime and Studio Runtime Endpoints

| Method | Path                               | Auth Mode | Required Scope | Target Routing | Request                                                   | Success                                                     | Deterministic Errors                                                                                                                                         |
| ------ | ---------------------------------- | --------- | -------------- | -------------- | --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/healthz`                         | public    | none           | none           | no body                                                   | `200` health payload (service/version/uptime/startedAt/now) | `INTERNAL_ERROR` (`500`) when health provider fails                                                                                                          |
| GET    | `/api/v1/studio/bootstrap`         | public    | none           | none           | optional query pair: `rejectedBuildId`, `rejectionReason` | `200` `StudioBootstrapReadyResponse`                        | `INVALID_QUERY_PARAM` (`400`), `FORBIDDEN_ORIGIN` (`403`), `STUDIO_RUNTIME_DISABLED` (`503`), `STUDIO_RUNTIME_UNAVAILABLE` (`503`), `INTERNAL_ERROR` (`500`) |
| GET    | `/api/v1/studio/assets/:buildId/*` | public    | none           | none           | `buildId` path param                                      | `200` immutable runtime asset stream                        | `FORBIDDEN_ORIGIN` (`403`), `NOT_FOUND` (`404`)                                                                                                              |
