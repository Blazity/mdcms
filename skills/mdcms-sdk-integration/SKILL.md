---
name: mdcms-sdk-integration
description: Use this skill when the user wants to fetch MDCMS content from their React/Next/Remix app, says things like "render MDCMS content in my app", "replace my filesystem markdown with MDCMS", "use @mdcms/sdk to load posts", "SSR MDCMS content", "fetch drafts in preview mode", or similar. Covers both replacing an existing filesystem-based content layer (brownfield) and writing fresh fetching code (greenfield), plus drafts vs published, SSR patterns, and revalidation.
---

# MDCMS SDK Integration

Use `@mdcms/sdk` in the host app to fetch MDCMS content at build time or request time, replacing any filesystem-driven content layer, and supporting the draft/published split.

## When to use this skill

The user wants to consume MDCMS content programmatically from a host app — typically to render pages, build a blog index, or hydrate a CMS-driven section. Two sub-paths:

- **Brownfield (replace)** — the app currently imports markdown from the repo (`import about from "../content/about.md"`, `fs.readFile`, `remark`/`mdx-bundler`). Replace that with SDK calls.
- **Greenfield (write new)** — the app has no content-fetching code yet. Add it fresh.

Not for editing content (use Studio), not for schema changes (use `mdcms-schema-refine`), not for admin embedding (use `mdcms-studio-embed`).

## Prerequisites

- A running MDCMS server and content synced against a schema (via **`mdcms-brownfield-init`** or **`mdcms-greenfield-init`**).
- A React-based host app.
- An API key that the host app can read at runtime. For server-side rendering, this is an env var (`MDCMS_API_KEY`). Never ship the API key to the browser.

## Steps

### 1. Install the SDK

```bash
npm install @mdcms/sdk
# or: bun add @mdcms/sdk
```

### 2. Create a client

In a server-only module (for Next: a file without `"use client"`, ideally under `lib/`):

```ts
import { createClient } from "@mdcms/sdk";

export const cms = createClient({
  serverUrl: process.env.MDCMS_SERVER_URL!,
  project: process.env.MDCMS_PROJECT!,
  environment: process.env.MDCMS_ENVIRONMENT!,
  apiKey: process.env.MDCMS_API_KEY!,
});
```

Keep the import path server-only. If the app leaks it into a client bundle, the API key ships to users.

### 3. Fetch content

Two common shapes:

**Fetch a single document by path**

```ts
const about = await cms.getDocument({ type: "page", path: "about" });
```

**List documents of a type**

```ts
const posts = await cms.listDocuments({ type: "post", limit: 20 });
```

Return values include the frontmatter fields as declared in `mdcms.config.ts` plus the body. Use them directly in React:

```tsx
export default async function AboutPage() {
  const about = await cms.getDocument({ type: "page", path: "about" });
  return (
    <article>
      <h1>{about.title}</h1>
      {/* render about.body — either as HTML, or via MDX runtime */}
    </article>
  );
}
```

### 4. Draft vs published

By default the SDK returns **published** content. Preview/draft flows need an explicit opt-in:

```ts
const draft = await cms.getDocument({
  type: "page",
  path: "about",
  draft: true,
});
```

Patterns:

- **Production pages** — omit `draft` or pass `false`. Only published content ships.
- **Preview routes** — gate `draft: true` behind a preview cookie / query param so only editors see drafts.
- **In-development** — early in a project, drafts are often all you have. Pass `draft: true` everywhere until content is ready to publish.

### 5. (Brownfield) replace the existing fetching

Typical before/after in a Next App Router page:

**Before**

```tsx
import fs from "node:fs/promises";
import path from "node:path";

const raw = await fs.readFile(
  path.join(process.cwd(), "content/pages/about.md"),
  "utf-8",
);
const about = parseMarkdown(raw);
```

**After**

```tsx
import { cms } from "@/lib/cms";

const about = await cms.getDocument({ type: "page", path: "pages/about" });
```

Delete the old markdown files from disk if they were imported into MDCMS (check `.gitignore` — `mdcms-brownfield-init` likely already added them), or keep them as a local cache if the app's build process benefits from that.

### 6. (Greenfield) add fresh fetching

Generate the route tree from MDCMS. Example for a blog index + detail in Next:

```tsx
// app/blog/page.tsx
import { cms } from "@/lib/cms";
export default async function BlogIndex() {
  const posts = await cms.listDocuments({ type: "post", limit: 50 });
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>
          <a href={`/blog/${p.slug}`}>{p.title}</a>
        </li>
      ))}
    </ul>
  );
}

// app/blog/[slug]/page.tsx
export default async function PostPage({ params }) {
  const post = await cms.getDocument({
    type: "post",
    path: `posts/${params.slug}`,
  });
  return <article>{/* ... */}</article>;
}
```

### 7. Revalidation / caching

- **Next App Router** — `fetch` calls from the SDK inherit Next's default cache behavior. For frequently updating content, set `revalidate` on the route or tag-invalidate via `revalidateTag` on webhook. Follow Next's caching guide; the SDK does not override it.
- **Build-time static** — call the SDK inside `generateStaticParams`/`getStaticProps` (Pages Router). Content is frozen at build time; rebuild to pick up changes.
- **ISR + webhooks** — expose a revalidation endpoint in the host app; call it from an MDCMS webhook on publish. This is Post-MVP on the MDCMS side; design for it but gate behind a feature check.

## Common gotchas

- **API key leaks into the browser** — always import the SDK in server-only modules. In Next, a `"use client"` file or a client component must not import `@/lib/cms`.
- **Path mismatch** — document paths in MDCMS preserve the full managed directory segment by default (e.g. `pages/about`, not `about`). Check a working call with the actual path the server returns, not an intuition.
- **Draft leaking to production** — if every page passes `draft: true`, unpublished content goes live. Route preview behind a flag.
- **Type vs type name** — `mdcms.config.ts` uses a string type name (`"post"`). The SDK call uses the same name; it is case-sensitive.
- **Locale-aware fetches** — localized types need a `locale` argument on SDK calls. Omit for non-localized types.

## Related skills

- **`mdcms-mdx-components`** — if the content body is MDX with custom components, the host app needs an MDX runtime that knows about the same component registry Studio uses.
- **`mdcms-schema-refine`** — if the SDK types returned don't include a field the host needs.
- **`mdcms-content-sync-workflow`** — pair with this to understand when content is pushed vs pulled vs published.

## Assumptions and limitations

- `@mdcms/sdk` is the first-party client. If the codebase uses a hand-rolled `fetch` directly against the API, migrate to the SDK — contract stability lives there.
- Covers Next.js App Router as the reference target; adapt patterns for Pages Router, Remix, React Router, or a plain React SPA as needed.
- Does not cover custom resolvers or server-side data transformation pipelines — SDK returns what the server returns.
- Caching/revalidation examples use Next primitives; the SDK itself does not ship a cache layer.
