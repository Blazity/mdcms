# @mdcms/sdk

Read-focused client SDK for MDCMS content APIs.

## Install

```bash
npm install @mdcms/sdk
```

## Usage

```ts
import { createClient } from "@mdcms/sdk";

const cms = createClient({
  serverUrl: "http://localhost:4000",
  apiKey: process.env.MDCMS_API_KEY!,
  project: "marketing-site",
  environment: "production",
});

// Fetch a single document by slug
const post = await cms.get("BlogPost", {
  slug: "hello-world",
  locale: "en",
  resolve: ["author"],
});

// List documents with filtering and pagination
const posts = await cms.list("BlogPost", {
  locale: "en",
  published: true,
  limit: 10,
  sort: "createdAt",
  order: "desc",
});
```

## API

### `createClient(options)`

Creates an SDK client instance.

| Option        | Required | Description                |
| ------------- | -------- | -------------------------- |
| `serverUrl`   | Yes      | MDCMS server URL           |
| `apiKey`      | Yes      | API key for authentication |
| `project`     | Yes      | Default project name       |
| `environment` | Yes      | Default environment name   |

### `client.get(type, options)`

Fetch a single document. Accepts either `{ id }` or `{ slug }` to identify the document, plus optional `locale`, `resolve`, `draft`, `project`, and `environment`.

### `client.list(type, options)`

List documents with filtering, pagination, and sorting. Supports `locale`, `resolve`, `draft`, `published`, `limit`, `offset`, `sort`, and `order`.

Per-call `project` and `environment` override the client defaults for that request.

### Error Handling

- `MdcmsApiError` — thrown for API error envelopes (4xx/5xx responses)
- `MdcmsClientError` — thrown for transport failures, malformed responses, and SDK-derived lookup failures

## Documentation

Full SDK reference at [docs.mdcms.ai](https://docs.mdcms.ai/).
