# Deployment Guide

## Overview

MDCMS deploys as a Docker Compose stack consisting of:

- **Server** — Bun/Elysia HTTP server (port 4000)
- **PostgreSQL 16** — primary data store
- **Redis 7** — caching and session storage
- **MinIO** — S3-compatible object storage (media uploads)
- **SMTP** — email delivery (Mailhog for development)

## Prerequisites

- Docker and Docker Compose
- Bun 1.3.11+ (for local CLI builds and migrations outside Docker)

## Building the Server Image

The server image is built from `apps/server/Dockerfile` with the workspace root as build context:

```dockerfile
FROM oven/bun:1
WORKDIR /workspace

COPY bun.lock package.json nx.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun nx build server

WORKDIR /workspace/apps/server
EXPOSE 4000
CMD ["bun", "dist/bin/http-server.js"]
```

Build manually with:

```bash
docker build -f apps/server/Dockerfile -t mdcms-server .
```

## Infrastructure Services

### PostgreSQL 16

- Image: `postgres:16`
- Default credentials: `mdcms` / `mdcms`, database `mdcms`
- Data persisted to the `pgdata` named volume
- Health check: `pg_isready -U mdcms -d mdcms`

### Redis 7

- Image: `redis:7-alpine`
- AOF persistence enabled (`--appendonly yes`, snapshots every 60s)
- Health check: `redis-cli ping`

### MinIO (S3-compatible storage)

- Image: `minio/minio`
- API on port 9000, console on port 9001
- Default credentials: `minioadmin` / `minioadmin`
- Data persisted to the `miniodata` named volume
- Health check: `curl -f http://localhost:9000/minio/health/live`

### SMTP (Mailhog)

- Image: `mailhog/mailhog`
- SMTP on port 1025, web UI on port 8025
- Health check: `wget --spider --quiet http://127.0.0.1:8025/`
- **Production:** replace with a real SMTP relay

## Environment Variables

Copy `.env.example` to `.env` and adjust values. When absent, Compose uses the inline defaults from `docker-compose.yml`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://mdcms:mdcms@postgres:5432/mdcms` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `S3_ENDPOINT` | `http://minio:9000` | S3-compatible API endpoint |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `S3_BUCKET` | `mdcms-media` | S3 bucket name for media |
| `SMTP_HOST` | `mailhog` | SMTP server hostname |
| `SMTP_PORT` | `1025` | SMTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Log verbosity |
| `APP_VERSION` | `0.0.0` | Application version tag |
| `PORT` | `4000` | Server listen port |
| `SERVICE_NAME` | `mdcms-server` | Service identifier for logging |

### Optional SSO Variables

| Variable | Description |
|----------|-------------|
| `MDCMS_AUTH_OIDC_PROVIDERS` | JSON array of OIDC provider profiles (enabled by presence) |
| `MDCMS_AUTH_SAML_PROVIDERS` | JSON array of SAML provider profiles (enabled by presence) |

See `.env.example` for full JSON schema examples.

## Database Migrations

Migrations run automatically via the `db-migrate` one-shot service before the server starts:

- The server depends on `db-migrate` with `condition: service_completed_successfully`
- Command: `bun run db:migrate`
- Requires a healthy PostgreSQL instance

To run migrations manually outside Docker:

```bash
bun run --cwd apps/server db:migrate
```

## Running the Stack

Start all services:

```bash
docker compose up -d --build
```

The startup order is:

1. **postgres**, **redis**, **minio**, **mailhog** — start and become healthy
2. **db-migrate** — runs migrations, then exits
3. **server** — starts after migrations succeed

Verify the server is ready:

```bash
curl http://localhost:4000/healthz
```

## Health Checks

All services have health checks configured in `docker-compose.yml`:

| Service | Test | Interval | Timeout | Retries | Start Period |
|---------|------|----------|---------|---------|--------------|
| server | `fetch http://127.0.0.1:4000/healthz` | 10s | 5s | 12 | 5s |
| postgres | `pg_isready -U mdcms -d mdcms` | 10s | 5s | 8 | — |
| redis | `redis-cli ping` | 10s | 3s | 8 | — |
| minio | `curl -f http://localhost:9000/minio/health/live` | 10s | 5s | 8 | — |
| mailhog | `wget --spider --quiet http://127.0.0.1:8025/` | 10s | 5s | 8 | — |

## Volumes and Persistence

Two named volumes are used:

- **`pgdata`** — PostgreSQL data directory (`/var/lib/postgresql/data`)
- **`miniodata`** — MinIO object storage (`/data`)

> **Warning:** Running `docker compose down -v` removes these volumes and all stored data.

## Production Considerations

- **Object storage:** Replace MinIO with a production S3-compatible service (AWS S3, GCS, etc.)
- **Email:** Replace Mailhog with a production SMTP relay (SES, SendGrid, etc.)
- **Credentials:** Set strong, unique passwords for PostgreSQL, MinIO, and S3 keys
- **Environment:** Set `NODE_ENV=production`
- **SSO:** Configure `MDCMS_AUTH_OIDC_PROVIDERS` and/or `MDCMS_AUTH_SAML_PROVIDERS` for single sign-on
- **TLS:** Terminate TLS at a reverse proxy or load balancer in front of the server
