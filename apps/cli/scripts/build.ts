/**
 * Bundled build for @mdcms/cli.
 *
 * Uses Bun.build to produce the CLI binary with @mdcms/modules inlined
 * (since modules is a private package that is not published to npm).
 * All other dependencies remain external so consumers install them normally.
 *
 * Run after `tsc --build` so declaration files are already in dist/.
 */

import packageJson from "../package.json";

const externalDeps = [
  ...Object.keys(packageJson.dependencies),
  // Node built-ins that should never be bundled
  "node:*",
];

const entrypoints = ["src/bin/mdcms.ts", "src/index.ts"];

const result = await Bun.build({
  entrypoints,
  outdir: "dist",
  target: "node",
  format: "esm",
  splitting: true,
  sourcemap: "external",
  external: externalDeps,
  root: "src",
});

if (!result.success) {
  console.error("CLI build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(
  `CLI build complete: ${result.outputs.length} files written to dist/`,
);
