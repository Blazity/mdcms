---
name: mdcms-mdx-components
description: Use this skill when the user wants to register or author custom MDX components for MDCMS — phrases like "add a Callout component", "register custom MDX components", "my content uses custom React components", "make components available in Studio", or "my MDX renders plain text for <Alert>". Covers the `components` entry in `mdcms.config.ts`, the Studio-side registry, and the host-app MDX runtime that has to render them consistently.
---

# MDCMS MDX Components

Register custom React components so they render consistently inside:

1. The author's MDX source files,
2. The Studio preview (editors see them in the visual editor), and
3. The host app's SSR / CSR output (production renders them too).

## When to use this skill

The user has MDX content that uses custom components (`<Callout>`, `<CTAButton>`, `<Chart>`, `<Video>`) and wants them to "just work" end to end. Also use when a component renders fine in one place (e.g., the host app) but not another (e.g., Studio shows the raw tag or empty content).

Not for schema changes (`mdcms-schema-refine`) or for regular markdown (no registration needed).

## Prerequisites

- `mdcms.config.ts` exists (run **`mdcms-brownfield-init`** or **`mdcms-greenfield-init`** first).
- Host app already has MDX rendering set up (or is willing to add it — see the target framework's MDX integration).
- Each custom component is a React component in the host app's source tree.

## How components flow

The MDCMS contract is: components are declared once, in a shared module, and referenced from both `mdcms.config.ts` and the host app's MDX runtime. Studio reads the config to know which components exist and how to render them in preview; the host app reads the same registry to render them in production.

The `apps/studio-example` repo demonstrates the current pattern — treat it as the canonical reference when file paths or export names change.

## Steps

### 1. Create a shared components module

Create a single source of truth for component metadata and implementations:

```ts
// lib/mdcms-components.ts
import { Callout } from "@/components/callout";
import { CTAButton } from "@/components/cta-button";

export const mdcmsComponents = [
  {
    name: "Callout",
    component: Callout,
  },
  {
    name: "CTAButton",
    component: CTAButton,
  },
];
```

Exact shape (keys like `name`, `component`, `extractedProps`) comes from `@mdcms/studio`'s component contract — check `apps/studio-example/lib/*-studio-config.ts` for the current field set. Do not invent fields; copy from the reference.

### 2. Wire the registry into `mdcms.config.ts`

```ts
import { defineConfig, defineType } from "@mdcms/cli";
import { mdcmsComponents } from "./lib/mdcms-components";

export default defineConfig({
  // ... other config
  components: [...mdcmsComponents],
  types: [
    // ...
  ],
});
```

The `components` array is what Studio uses to show prop editors and prop-aware previews. Without it, the visual editor treats `<Callout>` as an unknown tag.

### 3. Wire the registry into the host app's MDX runtime

For Next.js App Router with `@mdx-js/react`:

```tsx
import { MDXProvider } from "@mdx-js/react";
import { mdcmsComponents } from "@/lib/mdcms-components";

const reactComponents = Object.fromEntries(
  mdcmsComponents.map((c) => [c.name, c.component]),
);

export default function MdxLayout({ children }) {
  return <MDXProvider components={reactComponents}>{children}</MDXProvider>;
}
```

For frameworks with a different MDX runtime (Remix, Astro, Vite), wire the same map into whatever `components={...}` prop that runtime expects. The key is: the same `name → React component` map the config uses.

### 4. Push the updated config

```bash
npx mdcms schema sync
```

Schema sync pushes the updated `components` list to the server so Studio's prepared config picks it up on next load. If the host app serves the prepared config on the `/admin` route (see **`mdcms-studio-embed`**), redeploy or revalidate that route so the fresh config reaches Studio.

### 5. Verify in Studio

1. Open Studio at `<host-app>/admin` (or the standalone `<server>/admin/studio`).
2. Edit any document that uses the custom component.
3. The component should preview with its real React output (Studio uses the component from the registry).
4. The props panel should show editable fields for each extracted prop.

If Studio still shows `<Callout>` as a raw tag, the config wasn't refreshed — restart the host app or rerun `mdcms schema sync`.

### 6. Verify in the host app

Render a page that uses the component. Confirm the DOM output matches the Studio preview. If the component uses interactive state, verify hydration works (no mismatch errors in the console).

## Common gotchas

- **Component name mismatch** — the `name` in the registry must exactly match the JSX tag used in MDX content (`<Callout>` ↔ `name: "Callout"`). Case-sensitive.
- **Server/client boundary** — in Next App Router, components used in MDX must be either server-safe or wrapped with `"use client"`. Mark interactive components as client components before wiring.
- **Stale prepared config** — after editing the `components` array, Studio still serves the old list until its prepared config is regenerated. Revalidate or rebuild.
- **Divergent shape between host and Studio** — if the host app uses one component module and Studio uses another (e.g. two parallel registries), they drift. Keep one file as the source of truth and import from it in both places.
- **Void components in MDX** — components that render as self-closing need `<Callout />` in MDX, not `<Callout></Callout>`. Studio's editor surfaces this distinction.

## Related skills

- **`mdcms-studio-embed`** is often adjacent — the prepared config that Studio reads is created by the embed setup.
- **`mdcms-schema-refine`** after registering components, because a prop type or content field may need to change to model the new component.
- **`mdcms-sdk-integration`** because the host app fetches the content via SDK and must pair with an MDX runtime.

## Assumptions and limitations

- Current MDCMS MDX contract lives in `@mdcms/studio` and the reference app. Field names (`name`, `component`, `extractedProps`) evolve — trust the reference over this skill.
- Does not cover prop-extraction tooling (`extractedProps`) — MDCMS has its own extraction pipeline that the reference demonstrates. Follow it for complex components.
- Assumes the host app uses an MDX runtime. Plain Markdown content without MDX components does not need this skill.
- Does not cover styling or CSS — components ship their own styles or consume the host app's styling system.
