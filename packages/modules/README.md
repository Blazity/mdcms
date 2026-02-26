# @mdcms/modules

Compile-time module registry for MDCMS first-party modules.

## Topology

Each module follows:

```txt
packages/modules/<module-id>/src/
  manifest.ts
  server/index.ts
  cli/index.ts
  index.ts
```

Current seed modules:

- `core.system`
- `domain.content`

## Deterministic Registry

`src/index.ts` exports `installedModules` sorted by `manifest.id`.

- Only local compile-time bundled modules are exported.
- No runtime filesystem discovery is used.

## Build

- `bun nx build modules`
- `bun nx typecheck modules`
- `bun nx test modules`
