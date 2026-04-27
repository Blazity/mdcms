# Docker stack

## What it is + why

Local infrastructure for development. MDCMS depends on PostgreSQL, Redis, MinIO (S3-compatible object storage), and MailHog (SMTP catch-all for dev email testing). All four run via `docker-compose.yml` at the repo root.

## Configuration

```bash
docker compose up -d --build         # Bring up the stack
docker compose down                  # Tear down
docker compose logs -f <service>     # Tail a service
```

Services:

- **postgres** — PostgreSQL 16. Used for content, auth, sessions, and audit logs.
- **redis** — Provisioned for caching, queues, and rate-limiting. Not currently a session store.
- **minio** — Media uploads (S3-compatible).
- **mailhog** — Dev-only SMTP capture; web UI at `localhost:8025`.

The server expects this stack on default ports. Ports and credentials live in `docker-compose.yml` and the server's `.env` (local-only).

## How agents interact

Mostly indirectly — agents run server commands that assume the stack is up:

```bash
bun --cwd apps/server run start    # Server on :4000, expects docker stack up
bun run integration                 # Runs Docker health + migration check
```

For a clean re-run during debugging:

```bash
docker compose down -v && docker compose up -d --build
```

The `-v` flag drops volumes — useful when starting from a clean DB state, **not safe** if you want to preserve seeded content.

## Failure modes

- **Port conflicts.** If Postgres 5432 or Redis 6379 are already in use locally, `docker compose up` fails. Check with `lsof -i :5432`.
- **Volume corruption from killed containers.** `docker compose down -v` resets state.
- **Stale image after dependency upgrades.** `--build` rebuilds; without it, you might run an outdated server image.
- **MinIO bucket missing.** First-time setup may need explicit bucket creation (`mc mb local/mdcms`); check server logs for `NoSuchBucket`.

## Cross-refs

- Compose file: `docker-compose.yml`
- Per-package: `apps/server/AGENTS.md`
- Related: [`../stack.md`](../stack.md) for the broader stack context.
