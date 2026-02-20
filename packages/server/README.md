# @mdcms/server

Backend API/runtime package boundary for MDCMS.

## Runtime Contracts (CMS-2)

- `GET /healthz` is the foundational health endpoint for runtime process checks.
- Runtime errors are normalized to the shared `ErrorEnvelope` contract from `@mdcms/shared`.
- Server env parsing extends shared `CoreEnv` with:
  - `PORT` (default `4000`, validated integer in range 1-65535)
  - `SERVICE_NAME` (default `mdcms-server`)

### `/healthz` Response

Process-only payload:

```json
{
  "status": "ok",
  "service": "mdcms-server",
  "version": "0.0.0",
  "uptimeSeconds": 12,
  "timestamp": "2026-02-20T00:00:12.000Z"
}
```

### Error Envelope

Error responses follow:

```json
{
  "status": "error",
  "code": "INTERNAL_ERROR",
  "message": "Unexpected runtime error.",
  "details": {},
  "requestId": "optional-request-id",
  "timestamp": "2026-02-20T00:00:12.000Z"
}
```

## Build and Test

- `bun nx build server`
- `bun nx typecheck server`
- `bun nx test server`
