import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import nextConfig from "./next.config.mjs";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, "../..");

test("next dev transpiles all local MDCMS workspace packages imported by routes", () => {
  assert.deepEqual(nextConfig.transpilePackages, [
    "@mdcms/cli",
    "@mdcms/sdk",
    "@mdcms/shared",
    "@mdcms/studio",
  ]);
});

test("next dev aliases clean-checkout MDCMS packages to source files", () => {
  const webpackConfig = {
    resolve: {
      alias: {
        react: "react",
      },
      extensionAlias: {
        ".js": [".js"],
      },
    },
  };

  const resolvedConfig = nextConfig.webpack?.(webpackConfig, {});

  assert.equal(resolvedConfig, webpackConfig);
  assert.deepEqual(webpackConfig.resolve.alias, {
    react: "react",
    "@mdcms/cli$": resolve(workspaceRoot, "apps/cli/src/index.ts"),
    "@mdcms/sdk$": resolve(workspaceRoot, "packages/sdk/src/index.ts"),
    "@mdcms/sdk/react$": resolve(workspaceRoot, "packages/sdk/src/react.ts"),
    "@mdcms/shared$": resolve(workspaceRoot, "packages/shared/src/index.ts"),
    "@mdcms/shared/action-catalog-contract$": resolve(
      workspaceRoot,
      "packages/shared/src/lib/contracts/action-catalog-contract.ts",
    ),
    "@mdcms/shared/mdx$": resolve(
      workspaceRoot,
      "packages/shared/src/lib/mdx/index.ts",
    ),
    "@mdcms/shared/mdx/auto-form$": resolve(
      workspaceRoot,
      "packages/shared/src/lib/mdx/auto-form.ts",
    ),
    "@mdcms/shared/server$": resolve(
      workspaceRoot,
      "packages/shared/src/lib/contracts/schema-hash.ts",
    ),
  });
  assert.deepEqual(webpackConfig.resolve.extensionAlias, {
    ".js": [".ts", ".tsx", ".js"],
    ".jsx": [".tsx", ".jsx"],
  });
});
