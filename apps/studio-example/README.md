# Next.js Studio Embed Smoke App

This sample app exists for CMS-47 verification.

## Purpose

- Demonstrate host app embedding of `@mdcms/studio` at a catch-all route.
- Provide a deterministic smoke target for CI (`/admin/*` route boot).
- Provide a local MDX component registration surface for Studio editor testing.

## Routes

- `/` - host app page (no Studio mount expected)
- `/admin` - Studio embed shell
- `/admin/<any>` - Studio embed shell via catch-all route
- `/demo/content` - raw content API demo list (draft scope)
- `/demo/content/:documentId` - raw content API demo detail
- `/demo/sdk-content` - SDK-backed content demo list (`@mdcms/sdk`, draft scope)
- `/demo/sdk-content/:documentId` - SDK-backed content demo detail
- Internal surfaces are mapped by first segment after `/admin`:
- `/admin/content`
- `/admin/content/by-path/*` (folder-path navigation mode)
- `/admin/content/:type`
- `/admin/content/:type/:documentId` (document shell with scoped API load)
- `/admin/environments`
- `/admin/media` (shell/mock surface)
- `/admin/schema` (shell/mock surface)
- `/admin/users` (admin/owner only)
- `/admin/settings` (admin/owner only)
- `/admin/workflows` (shell/mock surface)
- `/admin/api` (shell/mock surface)
- `/admin/trash`

## Local Run

From workspace root:

```bash
bun run studio:embed:smoke
```

For interactive development, run:

```bash
bun run dev
```

This starts all required processes in one terminal:

- `bun nx run studio:dev`
- `bun nx run server:dev`
- `next dev` for this app

Environment overrides:

- `MDCMS_STUDIO_EXAMPLE_HOST` (default `127.0.0.1`)
- `MDCMS_STUDIO_EXAMPLE_PORT` (default `4173`)
- `DATABASE_URL` for `server:dev` (default `postgresql://mdcms:mdcms@localhost:5432/mdcms`)
- `MDCMS_DEMO_API_KEY` for `/demo/content*` and `/demo/sdk-content*` routes
  when no session cookie is present (in `compose:dev` it defaults to a seeded
  demo key)

Document shell locale can be provided via query parameter (forwarded as
`X-MDCMS-Locale`), for example:

- `/admin/content/BlogPost/<documentId>?locale=en`

For a fully containerized dev loop (infra + migrations + app/server/studio watchers), run:

```bash
bun run compose:dev

`compose:dev` keeps the server, Next.js host app, and backend-served Studio
runtime artifact in watch mode. Changes under `packages/studio/src/**` rebuild
the runtime bundle automatically; a browser refresh should pick up the new
bundle without restarting the stack.
```

## Demo Runbook (Pull -> Edit -> Push -> Verify)

1. Start runtime + infra:
   - local process mode: `bun run dev` (requires local Postgres/Redis/MinIO/Mailhog)
   - container mode: `bun run compose:dev`
2. Authenticate CLI via browser flow:
   - `bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts login --config apps/studio-example/mdcms.config.ts`
3. Pull current content to local files:
   - `bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts pull --force`
4. Edit one pulled `.md`/`.mdx` content file.
5. Push local edits back:
   - `bun --conditions @mdcms/source apps/cli/src/bin/mdcms.ts push --force`
6. Open:
   - `http://127.0.0.1:4173/demo/content`
   - `http://127.0.0.1:4173/demo/sdk-content`
7. Confirm the updated content is visible in both views:
   - `/demo/content*` shows the raw API fetch surface
   - `/demo/sdk-content*` shows the `@mdcms/sdk` surface

Notes:

- In `compose:dev`, `/demo/content*` and `/demo/sdk-content*` use a seeded
  default key, so no manual API-key copy is required for demo page reads.
- Seeded demo key is read-only for content reads (`content:read` +
  `content:read:draft`) and does not allow draft mutations.
- `compose:dev` also seeds demo browser-login user defaults:
  - email: `demo@mdcms.local`
  - password: `Demo12345!`
- `apps/studio-example/mdcms.config.ts` includes ready `types` mappings for
  `post`, `author`, `page`, and localized `campaign`, and uses the shared
  `defineConfig(...)` contract from `@mdcms/cli`, so `pull/push` path mapping
  works out of the box.
- `apps/studio-example/mdcms.config.ts` also declares explicit demo locales
  (`en`, `fr`) so localized Studio and API flows can be exercised in the
  embedded app.
- `apps/studio-example/mdcms.config.ts` also registers example local MDX
  components (`Chart`, `Callout`, `PricingTable`) for Studio insertion,
  preview, and props-panel testing.
- `/admin/*` prepares the full Studio config through
  `prepareStudioConfig(...)`, so the embedded Studio runtime receives local MDX
  component metadata, extracted props, and custom props editor loaders.
- `compose:dev` seeds example content in `marketing-site/staging`
  (posts/pages/localized campaigns), including an `en` + `fr` campaign
  translation group for `/admin/content` and `/demo/content*` checks, so first
  `mdcms pull` returns real files immediately.
- `/demo/content*` remains a raw-content inspection surface and does not render
  those MDX components.
- `/demo/sdk-content*` demonstrates the same seeded scope through
  `@mdcms/sdk`; the list view intentionally uses `client.list("post", ...)`
  to show the typed SDK read path.

Current demo-track limitation:

- active-collaboration rejection for push is deferred until CMS-53/CMS-82
  closure.
