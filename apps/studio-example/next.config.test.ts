import assert from "node:assert/strict";
import { test } from "node:test";

import nextConfig from "./next.config.mjs";

test("next dev transpiles all local MDCMS workspace packages imported by routes", () => {
  assert.deepEqual(nextConfig.transpilePackages, [
    "@mdcms/cli",
    "@mdcms/sdk",
    "@mdcms/shared",
    "@mdcms/studio",
  ]);
});

test("next dev resolves local MDCMS packages through source exports", () => {
  const webpackConfig = {
    resolve: {
      conditionNames: ["import", "module", "default"],
    },
  };

  const resolvedConfig = nextConfig.webpack?.(webpackConfig, {});

  assert.equal(resolvedConfig, webpackConfig);
  assert.deepEqual(webpackConfig.resolve.conditionNames, [
    "@mdcms/source",
    "import",
    "module",
    "default",
  ]);
});
