---
status: live
canonical: true
created: 2026-03-11
last_updated: 2026-04-10
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
  mdx?: {
    catalog: MdxComponentCatalog; // Contract owned by SPEC-007
    resolvePropsEditor: (name: string) => unknown | null;
  };
};
```

`auth` semantics:

- `cookie` mode is the default. The remote Studio runtime uses credentialed browser requests against `apiBaseUrl` and obtains CSRF bootstrap state from the auth/session endpoints.
- `token` mode uses `Authorization: Bearer <token>` on Studio API requests. In MVP, this bearer token is an MDCMS API key.
- In both auth modes, the runtime may call `GET /api/v1/me/capabilities` with explicit `X-MDCMS-Project` and `X-MDCMS-Environment` routing to determine target-scoped UI capabilities. Capability responses drive UI gating only; backend authorization remains the final authority.

Host bridge (minimum):

```typescript
export type HostBridgeV1 = {
  version: "1";
  resolveComponent: (name: string) => unknown | null;
  renderMdxPreview: (input: {
    container: HTMLElement;
    componentName: string;
    props: Record<string, unknown>;
    key: string;
  }) => () => void;
};
```

The shared shell/runtime boundary keeps executable component values opaque at the
type level (`unknown | null`). In the host app these are normally React
components, but the shared contract does not depend on React type imports.

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

When the host app supplies MDX loader callbacks, Studio takes a client-side
embedding path for MDX-aware features. The shell consumes the local component
catalog metadata from `mdcms.config.ts` and a local
`resolvePropsEditor(...)` capability from the host bundle, then passes them to
the embedded runtime. For MDX prop editing features, the host may prepare that
catalog on a Node-side integration path before the client shell renders so the
runtime receives serializable `extractedProps` metadata as defined in
`SPEC-007`; the runtime does not inspect TypeScript source in the browser.
Preview rendering remains host-bridge-driven through `resolveComponent(...)`
and `renderMdxPreview(...)`. The backend bootstrap/runtime publication model
stays unchanged; it still serves the signed runtime bundle and does not publish
the component catalog.

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

Bootstrap fetch failure handling:

- A bootstrap fetch failure means the shell could not obtain a usable bootstrap HTTP response from `GET /api/v1/studio/bootstrap`.
- When the failure is transport-level and no HTTP response was received, the shell retries the same bootstrap URL up to two additional times with short client-side backoff before surfacing a fatal startup error.
- This bounded transport retry is separate from the manifest-rejection retry below. It does not change query parameters and does not apply to HTTP error responses, invalid bootstrap payloads, disabled/unavailable responses, or runtime asset failures.
- User-facing startup copy may mention cross-origin or CORS guidance only when the shell has concrete evidence that browser origin policy caused the failure.
- When the shell only knows that a cross-origin bootstrap request failed without a usable response, it must use neutral startup copy and expose the underlying fetch error cause in technical details.

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
- `/admin/media` — Media library shell surface
- `/admin/schema` — Read-only schema explorer
- `/admin/users` — User management (admin only)
- `/admin/settings` — CMS settings (admin only)
- `/admin/workflows` — Workflow shell surface
- `/admin/api` — API playground shell surface
- `/admin/trash` — Deleted content recovery

For `/admin/media`, `/admin/workflows`, and `/admin/api`, the current phase
permits Studio-runtime-owned shell rendering backed by local mock state or
placeholder content while their future live data and mutation contracts remain
deferred to the owning work for those domains.

The `/admin/schema` route is a live read-only schema browser for the active
`(project, environment)` target. It is backed by `GET /api/v1/schema`, is
visible when the current caller has `schema.read`, and never authors schema
changes in the UI.

### Content Navigation

The primary navigation model is **schema-first**: users navigate by content type (BlogPost, Page, Author) rather than folder structure. Each type shows a sortable, filterable list of documents.

Secondary navigation by folder path is available as an alternative view.

### Content Overview (`/admin/content`)

The `/admin/content` route is a live schema-first overview for the active
`(project, environment)` target. It is backed by:

- `GET /api/v1/me/capabilities` for target-scoped capability gating
- `GET /api/v1/schema` for the canonical list of schema types
- `GET /api/v1/content/overview` for metadata-only per-type counts

Normative behavior:

- Overview cards are keyed by live schema registry entries. Studio must not use
  mock content-type fixtures to decide which types appear.
- Each card links to `/admin/content/:type` only when the current caller can
  read content for that target. When the caller cannot read content, Studio
  keeps the card visible for schema discovery but disables list navigation.
- Studio must not present a count or label that the current route contracts
  cannot prove. Unsupported metrics are omitted instead of estimated.
- When `capabilities.content.read` is `true`, Studio may show a per-type
  `total`, `published`, and `drafts` counts derived from
  `GET /api/v1/content/overview`.
- On `/admin/content`, `drafts` means non-deleted documents whose current head
  has no published version. It does not include published documents that also
  have newer unpublished changes.
- The overview count contract is metadata-only. Showing these counts does not
  grant access to draft document rows, draft document bodies, or any broader
  draft list access outside the overview itself.
- Localization presentation on `/admin/content` is schema-derived in MVP:
  localized types may show a `Localized` badge from the schema contract and
  non-localized types may show `Single locale`.
- When the embedded runtime has explicit locale configuration for the active
  project, `/admin/content` may show that configured locale-code list next to a
  localized type badge. This list is config-derived only and must not be
  presented as translation coverage.

Deterministic states:

- If `GET /api/v1/schema` returns `401` or `403`, the route renders a forbidden
  state because Studio cannot determine which schema types exist.
- If schema loading succeeds but both `capabilities.content.read` and
  `capabilities.content.readDraft` are `false`, the route renders a
  permission-constrained overview: schema cards stay visible, all content
  counts are omitted, list navigation is disabled, and the page shows a clear
  permission banner instead of a full route-level forbidden state.
- If schema loading succeeds and returns zero types, the route renders a
  deterministic empty state for the active target.
- Non-auth, non-forbidden failures from the live schema or content overview
  requests render a deterministic error state. Partial metric failures must not
  fall back to mock values.

### Content Type List (`/admin/content/:type`)

The `/admin/content/:type` route is a live document list for a specific schema
type within the active `(project, environment)` target. It is backed by:

- `GET /api/v1/content?type=<typeId>` for the paginated document list with
  server-side search, status filtering, sort, and pagination
- `GET /api/v1/schema` for type metadata (name, directory, localized flag)
- `GET /api/v1/me/capabilities` for action gating (inherited from layout)

The list response includes an optional `users` sidecar map that batch-resolves
`createdBy` user IDs to `{ name, email }` for author display without per-user
lookups.

Normative behavior:

- The document list is keyed by the `type` route parameter resolved against live
  schema entries. Studio must not use mock content-type fixtures.
- Server-side search uses the `q` query parameter. The Studio search input is
  debounced before issuing requests.
- Status filtering maps UI states (`published`, `draft`, `changed`) to the
  `published` and `hasUnpublishedChanges` query parameters.
- Pagination is server-side with `limit` and `offset`. Page size is fixed at 20.
- Author initials are derived from the `users` sidecar email. When a user
  cannot be resolved, a placeholder is shown.

Deterministic states:

- If the content list API returns `401` or `403`, the route renders a forbidden
  state with a permission banner.
- If the content list API returns a non-auth, non-forbidden error, the route
  renders an error state with a retry action.
- If the content list returns zero documents and no filters are active, the
  route renders a deterministic empty state encouraging document creation.
- If the content list returns zero documents with active filters (search or
  status), the route renders a "no results" state within the ready view.

Document creation:

- The "New Document" button is gated by `capabilities.content.write`. When
  the caller lacks write capability, the button is hidden.
- Clicking the button opens an inline creation dialog with:
  - **Path** (required text input, pre-populated with the type's directory
    prefix from the schema entry)
  - **Locale** (select, shown only when the type is localized and the project
    has configured `locales.supported`; for non-localized types, the document
    is created with the implicit default locale `__mdcms_default__`)
- On success, the dialog closes, the content list cache is invalidated, and
  Studio navigates to the new document editor at
  `/admin/content/:type/:documentId`.

Row-level actions:

- Each document row has a dropdown menu with the following default actions:

| Action    | Behavior                                       | Capability gate                  | Visibility condition    |
| --------- | ---------------------------------------------- | -------------------------------- | ----------------------- |
| Edit      | Navigate to document editor                    | None                             | Always                  |
| Publish   | `POST .../publish`, invalidate list            | `capabilities.content.publish`   | Draft or changed status |
| Unpublish | `POST .../unpublish`, invalidate list          | `capabilities.content.unpublish` | Published status        |
| Duplicate | `POST .../duplicate`, navigate to new document | `capabilities.content.write`     | Always                  |
| Delete    | `DELETE .../content/:id`, invalidate list      | `capabilities.content.delete`    | Always                  |

- Row action failures are surfaced inline with a dismissible error banner.
- The `content.list.row.actions` extensibility slot applies to these actions.

### Document Editor (`/admin/content/:type/:documentId`)

The `/admin/content/:type/:documentId` route is the live document editor for a
single document head in the active `(project, environment)` target. It is
backed by:

- `GET /api/v1/content/:documentId?draft=true` for the current draft snapshot
  (`draft=true` is an authorization/read-model switch that returns the mutable
  head content snapshot for the addressed document when the caller is
  authorized; it is not a server-side status filter for "draft-only" or
  "show unpublished" documents)
- `PUT /api/v1/content/:documentId` for draft persistence
- `POST /api/v1/content/:documentId/publish` for publish
- `GET /api/v1/content/:documentId/versions` and
  `GET /api/v1/content/:documentId/versions/:version` for history and diff
- `GET /api/v1/content/:documentId/variants` for locale variant discovery
- `GET /api/v1/schema` for live type and field metadata
- `GET /api/v1/me/capabilities` for write/publish gating

Normative behavior:

- The editor route is keyed by the routed `type`, `documentId`, and active
  environment. Studio must reject stale async results when the active
  environment or routed document changes.
- `GET /api/v1/content/:documentId?draft=true` reads the mutable head snapshot
  for that single document in the active target. Authorization controls access
  to that mutable head snapshot.
- The primary canvas edits the document `body` through the editor engine owned
  by SPEC-007.
- The right sidebar exposes three tabs in this order:
  - `Info` for document system metadata
  - `Properties` for schema-driven frontmatter editing
  - `History` for publish history and version comparison
- `Properties` is dedicated to schema-derived frontmatter fields for the
  current type in the active environment.
- `Properties` does not render document system metadata such as `status`,
  `publishedVersion`, `locale`, `updatedAt`, or `path`.
- `Info` shows the existing read-only document metadata (`status`,
  `publishedVersion`, `locale`, `updatedAt`, `path`).
- The default selected sidebar tab is `Properties` even though `Info` appears
  first in the tab strip.
- Frontmatter controls are derived from the live resolved schema. Studio must
  not ship hard-coded per-type property forms for routed document editing.
- Every property row shows an always-visible compact type label derived from
  the resolved schema for the active environment.
- MVP editable field support is intentionally narrow:
  - `string` fields render as single-line text inputs
  - `number` fields render as numeric inputs
  - `boolean` fields render as switches
  - enum-like fields render as selects when the resolved schema exposes a
    closed value set
  - optional wrappers of supported kinds reuse the same control and allow an
    empty/unset value
- Unsupported field shapes render deterministically as read-only property rows
  with a type label and a “Not editable in Studio yet” message. Unsupported
  shapes include reference fields, arrays, objects, tuples, unions, executable
  custom schemas, and any unrecognized field kind.
- Unsupported frontmatter values must be preserved in the local draft state and
  in subsequent `PUT /api/v1/content/:documentId` writes. Studio must not drop
  a field solely because the current UI cannot edit it.
- Property field order follows the resolved schema order for the current type.
- Fields that only exist in specific environments remain first-class controls
  when they are present in the active environment. Their environment badge is
  shown inline with the field label/control (for example `staging only`); a
  summary-only list without an editable control does not satisfy this contract.
- Fields omitted from the resolved schema for the active environment are not
  rendered as editable controls in that environment.
- Frontmatter edits participate in the same unsaved/saving/saved indicator model
  as body edits. Changing only a property field is sufficient to mark the draft
  unsaved and trigger draft persistence.
- Existing write-blocking states continue to apply to both body and property
  editing. When Studio is read-only because of RBAC, schema mismatch, or other
  guarded write conditions, the properties editor is disabled consistently with
  the main editor canvas.
- Validation failures returned by `PUT /api/v1/content/:documentId` should be
  anchored to the corresponding property control when the failure can be mapped
  to a named frontmatter field; otherwise Studio falls back to the route-level
  mutation error banner.

### Theme Preference Persistence

Studio-owned theme preference persists in browser-local storage.

Normative behavior:

- The runtime stores the selected theme in `localStorage`; it is not persisted
  through the backend and is not host-bridge-owned in MVP.
- Preference precedence is:
  1. persisted Studio preference
  2. explicit runtime `defaultTheme`
  3. system theme when `enableSystem` is enabled
  4. `light`
- Persistence scope is browser-local across full page reloads and Studio
  remounts for the same browser profile.
- The theme toggle must continue to support both light and dark rendering even
  when the persisted preference was set by an earlier Studio runtime version.

### Project Scope and Switching

Each embedded Studio instance is configured with a specific project through `mdcms.config.ts` and shows only that project's content and schema.

For users who manage multiple projects, the Studio header provides a project switcher that links to the other Studio instances they are allowed to access.

### Environment Scope and Switching

The active environment is Studio-owned state. The host app provides the initial
environment through `documentRoute.environment` at mount time. Once mounted,
Studio owns the active environment and can switch it through an in-shell
environment selector without host involvement or page reload.

Normative behavior:

- The shell header displays an environment selector when the environment list API
  returns more than one environment for the current project.
- Selecting a different environment updates Studio-internal state. All
  environment-scoped API queries (capabilities, schema, content, trash) re-fetch
  against the new environment automatically.
- When only one environment exists, the header shows a read-only environment
  badge instead of a selector.
- Environment switching does not require host bridge cooperation. The host bridge
  does not define an environment navigation callback.

### Environment Management (`/admin/environments`)

The `/admin/environments` route is a live project-scoped environment management
surface for the currently mounted project. It is backed by:

- `GET /api/v1/environments` for the current project environment list
- `POST /api/v1/environments` for environment creation
- `DELETE /api/v1/environments/:id` for environment deletion
- `GET /api/v1/me/capabilities` for shell-level admin navigation visibility

Normative behavior:

- The route manages only list/create/delete behavior in MVP. Clone, promote,
  rename, description editing, and other environment workflows are out of scope
  for this route until their owning work is specified.
- Environment rows are rendered from the live `EnvironmentSummary[]` contract.
  Studio must not render mock environment metadata, synthetic document counts,
  or fake promotion history on this route.
- The create flow submits `{ name }` to `POST /api/v1/environments`. Studio may
  omit `extends` and rely on the server-side config validation rules defined by
  the environment-management contract.
- On successful create, the creation dialog closes and the environment list
  reloads from the live API before the new row is presented as ready.
- The default `production` environment is rendered as the non-deletable default
  environment. Its delete action is disabled or omitted in the ready state.
- Deleting a non-default environment requires an explicit confirmation step and,
  on success, reloads the live environment list before removing the row from the
  UI.
- The route must surface deterministic server failures truthfully:
  - `INVALID_INPUT` (`400`) on create is shown inline on the creation form.
  - `CONFLICT` (`409`) on create or delete is shown inline without replacing the
    current ready view.
  - `NOT_FOUND` (`404`) on delete is surfaced as a non-destructive row/action
    failure and followed by a live list reload.
- The shell navigation entry for `/admin/environments` follows the same
  admin-owned visibility policy as other admin surfaces. Until a dedicated
  environment-management capability exists, Studio may use the current
  capability snapshot to hide the entry unless the caller exposes at least one
  admin-only capability (`capabilities.users.manage` or
  `capabilities.settings.manage`).
- Direct navigation to `/admin/environments` remains supported even when the
  navigation entry is hidden. Route authorization still depends on the
  environment-management endpoints; hidden navigation is advisory UI gating, not
  the security boundary.

Deterministic states:

- While the initial environment list request is pending, the route renders a
  dedicated loading state for environment management instead of mock cards.
- If `GET /api/v1/environments` returns `401` or `403`, the route renders a
  forbidden state for the active project.
- If `GET /api/v1/environments` returns a non-auth, non-forbidden failure, the
  route renders an error state with a retry action.
- If `GET /api/v1/environments` succeeds with zero rows, the route renders an
  empty state for the active project. When the current caller is allowed to use
  the route, the empty state may include the create affordance.
- When the list request succeeds with one or more rows, the route renders a
  ready state with per-row metadata limited to the live environment summary
  contract (`name`, `extends`, default status, `createdAt`).

### Target-Scoped Capabilities and Schema Recovery

Studio uses `GET /api/v1/me/capabilities` as the canonical source for
target-scoped UI capability gating.

Normative behavior:

- The runtime requests capabilities for the active `(project, environment)`
  target using the same explicit routing contract as other environment-scoped
  APIs.
- Schema route visibility depends on `capabilities.schema.read`.
- The `Sync Schema` action depends on both `capabilities.schema.write` and the
  runtime having a local schema sync payload available from the embedded
  `mdcms.config.ts` snapshot.
- The runtime must not infer write authority from local schema availability
  alone.
- Content list page action gating uses `capabilities.content.write` (create,
  duplicate), `capabilities.content.publish` (publish), `capabilities.content.unpublish`
  (unpublish), and `capabilities.content.delete` (delete).

Schema mismatch recovery:

- If a content write operation fails with `SCHEMA_NOT_SYNCED` (`409`) or
  `SCHEMA_HASH_MISMATCH` (`409`), Studio transitions the affected document
  editor into guarded read-only recovery mode.
- Guarded read-only recovery shows a schema mismatch banner, disables document
  write/publish/delete actions, and surfaces the local and server schema hashes
  when known.
- If `capabilities.schema.write` is `true`, the recovery UI may offer `Sync
Schema` as the privileged remediation action.
- If `capabilities.schema.write` is `false`, Studio must keep the recovery UI
  read-only and direct the user to the read-only schema browser and/or an
  authorized operator.

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

| Method | Path                               | Auth Mode          | Required Scope | Target Routing      | Request                                                                                                                     | Success                                                     | Deterministic Errors                                                                                                                                         |
| ------ | ---------------------------------- | ------------------ | -------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/healthz`                         | public             | none           | none                | no body                                                                                                                     | `200` health payload (service/version/uptime/startedAt/now) | `INTERNAL_ERROR` (`500`) when health provider fails                                                                                                          |
| GET    | `/api/v1/studio/bootstrap`         | public             | none           | none                | optional query pair: `rejectedBuildId`, `rejectionReason`                                                                   | `200` `StudioBootstrapReadyResponse`                        | `INVALID_QUERY_PARAM` (`400`), `FORBIDDEN_ORIGIN` (`403`), `STUDIO_RUNTIME_DISABLED` (`503`), `STUDIO_RUNTIME_UNAVAILABLE` (`503`), `INTERNAL_ERROR` (`500`) |
| GET    | `/api/v1/studio/assets/:buildId/*` | public             | none           | none                | `buildId` path param                                                                                                        | `200` immutable runtime asset stream                        | `FORBIDDEN_ORIGIN` (`403`), `NOT_FOUND` (`404`)                                                                                                              |
| GET    | `/api/v1/me/capabilities`          | session_or_api_key | none           | project+environment | session cookie or `Authorization: Bearer <mdcms_key_...>` plus explicit `X-MDCMS-Project` and `X-MDCMS-Environment` routing | `200` `{ data: { project, environment, capabilities } }`    | `UNAUTHORIZED` (`401`), `MISSING_TARGET_ROUTING` (`400`), `TARGET_ROUTING_MISMATCH` (`400`), `FORBIDDEN_ORIGIN` (`403`)                                      |
