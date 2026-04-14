# @mdcms/server

Backend API server for MDCMS, built with [Elysia](https://elysiajs.com/) and PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/).

## Getting Started

### With Docker Compose (recommended)

```bash
docker compose up -d --build
```

This starts PostgreSQL, Redis, MinIO, and Mailhog. Migrations run automatically.

### Start the server

```bash
bun --cwd apps/server run start
```

The server starts on `http://localhost:4000`. Verify with `GET /healthz`.

## API Endpoints

| Group | Path | Description |
| --- | --- | --- |
| Health | `GET /healthz` | Process health check |
| Content | `/api/v1/content` | CRUD, publish/unpublish, version history, restore |
| Schema | `/api/v1/schema` | Schema registry sync and read |
| Environments | `/api/v1/environments` | List, create, delete environments |
| Auth | `/api/v1/auth` | Session login/logout, OIDC, SAML, API key management |
| Studio | `/api/v1/studio/bootstrap` | Studio runtime publication and asset delivery |
| Actions | `/api/v1/actions` | Action catalog (typed endpoint metadata) |
| Collaboration | `/api/v1/collaboration` | Collaboration handshake authorization |

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | | PostgreSQL connection string |
| `PORT` | No | `4000` | Server listen port |
| `MDCMS_STUDIO_ALLOWED_ORIGINS` | No | | Comma-separated origins for cross-origin Studio embedding |
| `MDCMS_AUTH_OIDC_PROVIDERS` | No | | JSON array of OIDC provider configurations |
| `MDCMS_AUTH_SAML_PROVIDERS` | No | | JSON array of SAML provider configurations |
| `MDCMS_AUTH_ADMIN_USER_IDS` | No | | Comma-separated admin user IDs |
| `MDCMS_AUTH_ADMIN_EMAILS` | No | | Comma-separated admin emails |
| `MDCMS_AUTH_INSECURE_COOKIES` | No | `false` | Set `true` for local dev without HTTPS |

## Database Migrations

```bash
# Generate migrations from schema changes
bun run --cwd apps/server db:generate

# Apply pending migrations
bun run --cwd apps/server db:migrate
```

In Docker Compose, migrations run automatically before the server starts.

## Documentation

Full API reference at [docs.mdcms.ai](https://docs.mdcms.ai/).
