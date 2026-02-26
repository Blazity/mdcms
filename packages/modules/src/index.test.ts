import assert from "node:assert/strict";
import { test } from "node:test";

import { installedModules } from "./index.js";

test("installedModules are exported in deterministic manifest.id order", () => {
  const ids = installedModules.map(
    (modulePackage) => modulePackage.manifest.id,
  );
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));

  assert.deepEqual(ids, sorted);
});

test("installedModules includes seed modules", () => {
  const ids = new Set(
    installedModules.map((modulePackage) => modulePackage.manifest.id),
  );

  assert.equal(ids.has("core.system"), true);
  assert.equal(ids.has("domain.content"), true);
});
