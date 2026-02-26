# apps/studio-runtime

Studio runtime artifact builder for the workspace topology.

## Output Topology

Build output is immutable and versioned by `buildId`:

```txt
dist/
  assets/<buildId>/<entryFile>
  bootstrap/<buildId>.json
```

`buildId` and `integritySha256` are derived from entry artifact bytes.

## Bootstrap Manifest

The generated bootstrap payload matches `StudioBootstrapManifest` and includes:

- `mode`
- `entryUrl`
- `integritySha256`
- `signature` (deterministic placeholder)
- `keyId` (deterministic placeholder)
- compatibility fields

Real signing/key management is deferred to a later hardening task.

## Commands

- `bun nx build studio-runtime`
- `bun nx typecheck studio-runtime`
- `bun nx test studio-runtime`
