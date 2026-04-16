# Studio Example App

Example Next.js host app demonstrating how to embed `@mdcms/studio` at a catch-all route.

## Purpose

- Show the recommended host-app integration pattern for Studio
- Provide a working reference for `<Studio />` embedding, content demo pages, and MDX component registration
- Serve as the local development host app for the monorepo

## Routes

| Route                           | Description                            |
| ------------------------------- | -------------------------------------- |
| `/`                             | Host app home page                     |
| `/admin/*`                      | Embedded Studio UI (catch-all)         |
| `/demo/content`                 | Raw content API demo (draft scope)     |
| `/demo/content/:documentId`     | Raw content detail                     |
| `/demo/sdk-content`             | SDK-backed content demo (`@mdcms/sdk`) |
| `/demo/sdk-content/:documentId` | SDK-backed content detail              |

## Local Run

From workspace root:

```bash
bun run dev
```

This starts the Studio build watcher, backend server, and this Next.js app together.

For a fully containerized dev loop (infra + migrations + watchers):

```bash
bun run compose:dev
```

Default demo credentials (seeded automatically in `compose:dev`):

- Email: `demo@mdcms.local`
- Password: `Demo12345!`

## Environment Variables

| Variable                    | Default                                         | Description                    |
| --------------------------- | ----------------------------------------------- | ------------------------------ |
| `MDCMS_STUDIO_EXAMPLE_HOST` | `127.0.0.1`                                     | Host address                   |
| `MDCMS_STUDIO_EXAMPLE_PORT` | `4173`                                          | Port                           |
| `DATABASE_URL`              | `postgresql://mdcms:mdcms@localhost:5432/mdcms` | For `server:dev`               |
| `MDCMS_DEMO_API_KEY`        | Seeded in compose                               | API key for demo content pages |

## Documentation

See [docs.mdcms.ai](https://docs.mdcms.ai/) for the full Studio embedding guide.
