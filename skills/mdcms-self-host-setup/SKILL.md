---
name: mdcms-self-host-setup
description: Use this skill when the user wants to self-host MDCMS, run MDCMS locally, stand up the MDCMS backend, bring up the MDCMS server, or says things like "I need an MDCMS server", "spin up MDCMS in Docker", "run MDCMS on my own infra", or similar. Also use it when another skill (e.g. `mdcms-setup`) has determined the user has no reachable MDCMS server yet. Walks through cloning the repo, configuring env, `docker compose up`, and verifying `/healthz`.
---

# MDCMS Self-Host Setup

Stand up an MDCMS backend the user can point the CLI, Studio, and SDK at. The official self-hosting story is Docker Compose from the MDCMS source repo.

## When to use this skill

The user has decided to run MDCMS themselves (local development, staging, or production), and there is no existing server URL they can use. If they already have a hosted MDCMS endpoint, skip this skill.

## Prerequisites

- Docker **24+** and Docker Compose **v2+** on the target machine (Docker Desktop covers both on macOS/Windows).
- Git, to clone the MDCMS source.
- Outbound network access to `github.com`, `ghcr.io` (or Docker Hub), and any package registries the images pull from.
- A free TCP port for the server (default `4000`) and dependencies (`5432`, `6379`, `9000`, `9001`, `1025`, `8025`).

## Steps

### 1. Clone the MDCMS source

```bash
git clone https://github.com/Blazity/mdcms.git
cd mdcms
```

The project lives in a monorepo but Docker Compose handles everything — the host does not need Bun or Node.js to run the server.

### 2. Create the env file

```bash
cp .env.example .env
```

The example defaults are suitable for local evaluation. For staging or production, change:

- Database credentials (`POSTGRES_PASSWORD`, `DATABASE_URL`).
- S3/MinIO credentials (`MDCMS_S3_*`) if switching to a real S3 bucket.
- Auth provider settings if using OIDC/SAML/email.
- `MDCMS_STUDIO_ALLOWED_ORIGINS` — the list of origins Studio is allowed to embed from. Add the URL(s) of the host apps that will embed `<Studio />`.

Keep the file out of version control.

### 3. Bring up the stack

```bash
docker compose up -d --build
```

This starts:

| Service       | Port            | Purpose                      |
| ------------- | --------------- | ---------------------------- |
| MDCMS Server  | `4000`          | API backend                  |
| PostgreSQL 16 | `5432`          | primary database             |
| Redis 7       | `6379`          | sessions + cache             |
| MinIO         | `9000` / `9001` | S3-compatible object storage |
| Mailhog       | `1025` / `8025` | dev email capture            |

Database migrations run automatically before the server starts.

### 4. Smoke-test the backend

```bash
curl -sf http://localhost:4000/healthz
```

Expect a `200 OK`. If the server is still booting, wait a few seconds and retry.

### 5. Create the first admin user

Options, in preference order:

1. **Signup endpoint** — if `MDCMS_AUTH_EMAIL_SIGNUPS_ENABLED=true` (default in local dev): POST `/api/v1/auth/signup` with an email and password, then check Mailhog at `http://localhost:8025` for the verification email.
2. **Preseeded demo user** — `docker compose -f docker-compose.dev.yml up` includes a seeded admin (`demo@mdcms.local` / `Demo12345!`) for instant local dev. Treat this as disposable; delete it before production.
3. **Custom bootstrap** — for production, run the server's admin-bootstrap command (see `docs/guide/self-hosting.mdx` for the current command name and flags).

### 6. Capture the server URL

For local dev the server URL is usually `http://localhost:4000`. For production, it's whatever origin is exposed to the internet (Studio and the CLI talk to it directly). Save it — all downstream skills need it.

## Verification checklist

Before moving on to `mdcms init` or Studio embed, confirm:

- `curl -sf <server-url>/healthz` returns 200.
- You can sign in via `/api/v1/auth/login` or the demo credentials and receive a session cookie.
- Studio can be loaded at `<server-url>/admin/studio` (the standalone Studio mount) and you can log in with the admin user.
- The Studio settings page shows your admin user listed.

## Related skills

- After the server is up, continue with **`mdcms-brownfield-init`** or **`mdcms-greenfield-init`** to bootstrap the CLI + config.
- If the host app will embed Studio, **`mdcms-studio-embed`** needs `MDCMS_STUDIO_ALLOWED_ORIGINS` set on this server.

## Assumptions and limitations

- Assumes Docker is available and the user has permission to run containers on their machine.
- Does not cover TLS termination, domain configuration, or container orchestrators (Kubernetes, ECS). Treat those as out of scope.
- Env var names match the contract in `docs/guide/self-hosting.mdx` and `.env.example`. If the repo's schema changes, trust the source `.env.example` over this skill.
- Demo user (`demo@mdcms.local`) is for local dev only. Remove it before exposing the instance.
