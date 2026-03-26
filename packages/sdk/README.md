# @mdcms/sdk

Read-focused client SDK for MDCMS content APIs.

## Usage

```ts
import { createClient } from "@mdcms/sdk";

const cms = createClient({
  serverUrl: "http://localhost:4000",
  apiKey: process.env.MDCMS_API_KEY!,
  project: "marketing-site",
  environment: "production",
});

const post = await cms.get("BlogPost", {
  slug: "hello-world",
  locale: "en",
  resolve: ["author"],
});

const posts = await cms.list("BlogPost", {
  locale: "en",
  published: true,
  limit: 10,
  sort: "createdAt",
  order: "desc",
});
```

## Contract

- `createClient` stores the default `serverUrl`, API key, project, and environment.
- `get` accepts either `{ id }` or `{ slug }` plus optional `locale`, `resolve`, `draft`, `project`, and `environment`.
- `list` supports the content list query parameters owned by the content API contract, including `locale`, `resolve`, `draft`, `published`, pagination, and sorting.
- Per-call `project` and `environment` override the client defaults for that request only.
- API error envelopes throw `MdcmsApiError`.
- Transport failures, malformed success payloads, and SDK-derived lookup failures throw `MdcmsClientError`.

## Build

- `bun nx build sdk`
- `bun nx typecheck sdk`

## Test

- `cd packages/sdk && bun test ./src`
