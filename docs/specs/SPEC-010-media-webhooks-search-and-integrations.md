---
status: live
canonical: true
created: 2026-03-11
last_updated: 2026-03-11
legacy_sections:
  - 15
  - 16
  - 17
  - 6.7
  - 6.8
---

# SPEC-010 Media, Webhooks, Search, and Integrations

This is the live canonical document under `docs/`.

## Media Management (Post-MVP)

### Storage

Media files are stored in S3-compatible object storage and are **project-scoped** (reusable across environments in the same project). In development, MinIO provides a local S3-compatible API within the Docker Compose stack. In production, any S3-compatible service works (AWS S3, Cloudflare R2, DigitalOcean Spaces, etc.).

#### Upload Constraints Config

Media uploads are intentionally **not file-type restricted**: MDCMS accepts any MIME type/extension and stores it as media metadata + object storage.

Owner/Admin users can configure an optional image upload size limit in Studio Settings (project-level config), for example:

```json
{
  "media": {
    "image": {
      "maxUploadSizeBytes": 10485760
    }
  }
}
```

Rules:

- No MIME/extension allowlist is enforced for media uploads.
- `media.image.maxUploadSizeBytes` applies only to files classified as images (`mime_type` starts with `image/`).
- If `maxUploadSizeBytes` is omitted/null, image uploads are unlimited at the MDCMS layer (infrastructure/proxy limits may still apply).

### Planned Upload Flow

1. User drags/pastes/uploads a file in the editor context (or uses an upload button).
2. Studio uploads the file to the MDCMS backend API (`POST /api/v1/media/upload`).
3. Backend stores the file in S3, records metadata in PostgreSQL, and returns the URL.
4. The URL is inserted into the markdown content.

### Media Metadata

```sql
CREATE TABLE media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id),
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    size_bytes  BIGINT NOT NULL,
    s3_key      TEXT NOT NULL,
    url         TEXT NOT NULL,
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Scope Status

Media upload is **Post-MVP** in the reduced scope plan. When it ships, the first phase remains inline editor upload only. A full media library (browse, search, tag, organize, reuse across documents) stays Post-MVP beyond that initial upload flow.

---

## Webhooks (Post-MVP)

### Purpose

This chapter describes the deferred webhook system design. Webhook CRUD, delivery, signing, and history are not part of the current MVP.

Webhooks notify external systems of content events. Primary use case: triggering static site rebuilds when content is published.

### Configuration

Webhooks are configured in the Studio UI under Settings → Webhooks.

Each webhook has:

- **URL** — The endpoint to call
- **Events** — Which events trigger the webhook (multi-select)
- **Secret** — HMAC secret for payload verification
- **Active** — Enable/disable toggle

### Events

| Event                 | Trigger                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content.created`     | A new document is created                                                                                                                                                                                    |
| `content.updated`     | Draft content persisted (includes editor auto-save ticks and explicit draft writes). Intended for staging/preview cache invalidation — production consumers should subscribe to `content.published` instead. |
| `content.published`   | A document is published                                                                                                                                                                                      |
| `content.unpublished` | A document is unpublished (`published_version` cleared)                                                                                                                                                      |
| `content.deleted`     | A document is soft-deleted                                                                                                                                                                                   |
| `content.restored`    | A deleted document is restored                                                                                                                                                                               |
| `media.uploaded`      | A media file is uploaded                                                                                                                                                                                     |

### Payload Format

```json
{
  "event": "content.published",
  "timestamp": "2026-02-12T12:00:00Z",
  "project": "marketing-site",
  "environment": "production",
  "document": {
    "documentId": "uuid",
    "translationGroupId": "uuid",
    "path": "blog/hello-world",
    "type": "BlogPost",
    "locale": "en",
    "format": "md",
    "version": 5
  },
  "user": {
    "id": "uuid",
    "email": "alice@example.com"
  }
}
```

Payloads are signed with HMAC-SHA256 using the webhook secret.

#### Signing and Verification

- `X-MDCMS-Signature` format:
  - `t=<unix_timestamp>,v1=<hex_hmac_sha256(secret, t + "." + raw_body)>`
- Timestamp skew tolerance: 5 minutes.
- Webhook deliveries include:
  - `X-MDCMS-Delivery-Id` (UUID)
  - `X-MDCMS-Event-Id` (idempotency key)
- Receivers must reject stale, replayed, or duplicated events within the retention window.

### Delivery

- Webhooks are delivered asynchronously (fire-and-forget from the user's perspective).
- HTTPS-only delivery targets; non-HTTPS URLs are rejected.
- Retry targets are validated to avoid private network SSRF endpoints.
- Failed deliveries are retried with exponential backoff (3 attempts).
- Delivery history is viewable in the Studio UI (success/failure, response codes).
- MVP migrations do not emit webhooks because the webhook subsystem is deferred.

---

## Search (Post-MVP)

### Deferred Design Target

When implemented, full-text search uses PostgreSQL's built-in full-text search capabilities (`tsvector` / `tsquery`) over a **materialized latest-published index**.

Default behavior:

- Search indexes only latest published snapshots (same visibility as default content API).
- Draft search is opt-in (`draft=true`) and requires draft permissions.
- Text search config is selected by locale (locale-aware analyzer with fallback to `simple`).

```sql
CREATE TABLE published_search_index (
    project_id      UUID NOT NULL,
    environment_id  UUID NOT NULL,
    document_id     UUID NOT NULL,
    locale          TEXT NOT NULL,
    schema_type     TEXT NOT NULL,
    search_config   REGCONFIG NOT NULL, -- e.g., 'english', 'french', 'german', 'simple'
    search_vector   TSVECTOR NOT NULL,
    PRIMARY KEY (project_id, environment_id, document_id, locale),
    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
);

CREATE INDEX idx_published_search_vector
  ON published_search_index
  USING gin(search_vector);

CREATE INDEX idx_published_search_scope_type_locale
  ON published_search_index (project_id, environment_id, schema_type, locale);
```

### API Usage (When Implemented)

```
# Required headers:
# X-MDCMS-Project: marketing-site
# X-MDCMS-Environment: production

GET /api/v1/content?q=hello+world&type=BlogPost
```

Use `draft=true` to search draft content (requires draft access permissions) once search is implemented.

### Future

The search backend is designed to be pluggable. A post-MVP upgrade path to Meilisearch or Typesense can be implemented without API changes.

---

## Media Endpoints

These routes are **Post-MVP**. They are intentionally omitted from the canonical MVP endpoint appendix in §24.

| Method   | Endpoint        | Description                                                                                                            |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/media/upload` | Upload any file type to S3-compatible storage (no MIME/extension allowlist; optional image size cap from media config) |
| `GET`    | `/media/:id`    | Get media metadata                                                                                                     |
| `DELETE` | `/media/:id`    | Delete a media file                                                                                                    |

## Webhook Endpoints

These routes are **Post-MVP**. They are intentionally omitted from the canonical MVP endpoint appendix in §24.

| Method   | Endpoint        | Description              |
| -------- | --------------- | ------------------------ |
| `GET`    | `/webhooks`     | List configured webhooks |
| `POST`   | `/webhooks`     | Create a webhook         |
| `PUT`    | `/webhooks/:id` | Update a webhook         |
| `DELETE` | `/webhooks/:id` | Delete a webhook         |
