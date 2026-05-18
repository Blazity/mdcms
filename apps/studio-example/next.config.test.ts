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
