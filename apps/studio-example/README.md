# Next.js Studio Embed Smoke App

This sample app exists for CMS-47 verification.

## Purpose

- Demonstrate host app embedding of `@mdcms/studio` at a catch-all route.
- Provide a deterministic smoke target for CI (`/admin/*` route boot).

## Routes

- `/` - host app page (no Studio mount expected)
- `/admin` - Studio embed shell
- `/admin/<any>` - Studio embed shell via catch-all route
- Internal surfaces are mapped by first segment after `/admin`:
  - `/admin/dashboard`
  - `/admin/content`
  - `/admin/trash`
  - `/admin/environments`
  - `/admin/users` (admin/owner only)
  - `/admin/settings` (admin/owner only)

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

For a fully containerized dev loop (infra + migrations + app/server/studio watchers), run:

```bash
bun run compose:dev
```
