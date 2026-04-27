# CMS-68 Local MDX Component Catalog Design

> Local-only planning note. This file is not canonical product documentation and should remain uncommitted.

## Summary

`CMS-68` should no longer be implemented as a backend schema-sync feature.
The embedded Studio runs inside the host app and must resolve the host app's
actual React MDX components locally. That makes component discovery, preview,
and custom props-editor resolution a host-local runtime concern, not a server
registry concern.

## Problem

The current specs drifted into a model where schema sync persists optional
`extractedComponents` metadata on the backend and implies that Studio reads
component registration metadata from the server.

That conflicts with the approved embedding architecture:

- Studio is embedded in the host app.
- MDX preview should use the host app's real React components.
- The backend stores MDX content and does not need to understand component
  implementations.

## Approved Direction

### Source of truth

`mdcms.config.ts` remains the single source of truth for MDX component
registration.

### Backend scope

The backend does not persist, validate, or expose a component catalog.

- Remove `extractedComponents` from the schema-sync contract.
- Keep schema sync focused on content type registry state only.
- Treat MDX component usage as opaque content stored in markdown/MDX bodies.

### Studio runtime scope

The embedded Studio runtime reads component registrations from local config and
uses local runtime loaders for executable pieces.

- Metadata for insertion/edit UI comes from `config.components`.
- Actual preview components are resolved locally in the host bundle.
- Custom props editors are resolved locally in the host bundle.

## Public API Shape

The public embed story should stay simple and avoid manual bridge plumbing or
codegen.

Supported embedding pattern:

```tsx
"use client";

import { Studio } from "@mdcms/studio";
import config from "../../../mdcms.config";

export default function AdminPage() {
  return <Studio config={config} basePath="/admin" />;
}
```

`Studio` should accept a config object that includes MDX component metadata plus
client-only loader callbacks on each component registration.

Example authoring shape:

```ts
components: [
  {
    name: "Chart",
    importPath: "@/components/mdx/Chart",
    load: () => import("@/components/mdx/Chart").then((m) => m.Chart),
    description: "Renders a data chart",
    propHints: {
      color: { widget: "color-picker" },
    },
  },
  {
    name: "PricingTable",
    importPath: "@/components/mdx/PricingTable",
    load: () =>
      import("@/components/mdx/PricingTable").then((m) => m.PricingTable),
    loadPropsEditor: () =>
      import("@/components/mdx/PricingTable.editor").then((m) => m.default),
    description: "Pricing table",
  },
];
```

## Internal Wiring

The current host-bridge concept remains useful as an internal runtime boundary
between the shell and the dynamically loaded Studio bundle, but it should not
be user-authored boilerplate for MDX components.

Implementation direction:

- `@mdcms/studio` derives local MDX catalog metadata from `config.components`.
- `@mdcms/studio` builds any internal bridge/capability objects itself.
- The dynamically loaded Studio runtime receives:
  - serializable MDX catalog metadata
  - internal executable callbacks for preview/editor resolution

## Consequences

### Benefits

- No backend component sync.
- No component registry persistence in the database.
- One source of truth for component registration.
- No extra binding boilerplate beyond the authored config.
- No code generation step.

### Tradeoffs

- The supported embed pattern for MDX component features becomes client-side,
  because loader callbacks are not server-to-client serializable.
- `mdcms.config.ts` becomes responsible for both metadata and runtime loader
  declarations for components.
- `createStudioEmbedConfig(...)` cannot remain the only documented path for
  MDX-aware embedding if it strips runtime loaders away.

## Required Spec Delta

### SPEC-004

- Remove `extractedComponents` from registry model prose.
- Remove `extractedComponents?` from `PUT /api/v1/schema`.
- Remove any examples that imply backend persistence of MDX component metadata.

### SPEC-006

- Update the embed contract to document client-side embedding for MDX component
  features.
- Expand the shell/runtime contract so the remote runtime receives local MDX
  catalog metadata and internal local resolvers from the shell package, not the
  backend.

### SPEC-007

- Replace "props are sent to the server" language with local embedded-Studio
  extraction/runtime language.
- Define the local component-catalog contract owned by the embedded Studio
  runtime.
- Clarify that preview and custom editor resolution are host-local concerns.

## Acceptance Mapping

- "Registered components are persisted and queryable by Studio" is no longer the
  right architecture and should be reinterpreted as "registered components are
  locally available to the embedded Studio runtime from `mdcms.config.ts`."
- "Foundational behavior is reusable by dependent tasks" maps to:
  - stable local component registration contract
  - stable extracted prop metadata shape
  - stable preview/editor loader hooks for downstream MDX tasks
