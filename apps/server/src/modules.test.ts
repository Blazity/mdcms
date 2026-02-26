import assert from "node:assert/strict";
import { test } from "node:test";

import { installedModules } from "@mdcms/modules";
import { createConsoleLogger, type MdcmsModulePackage } from "@mdcms/shared";

import { buildServerModuleLoadReport, loadServerModules } from "./modules.js";

const testLogger = createConsoleLogger({
  level: "trace",
  sink: () => undefined,
});

test("loadServerModules uses deterministic manifest.id ordering", () => {
  const reportA = loadServerModules({
    coreVersion: "1.0.0",
    logger: testLogger,
  });
  const reportB = loadServerModules({
    coreVersion: "1.0.0",
    logger: testLogger,
  });

  assert.deepEqual(reportA.loadedModuleIds, reportB.loadedModuleIds);
  assert.deepEqual(reportA.skippedModuleIds, reportB.skippedModuleIds);

  const expectedOrder = [...installedModules]
    .filter((modulePackage) => modulePackage.server !== undefined)
    .map((modulePackage) => modulePackage.manifest.id)
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(reportA.loadedModuleIds, expectedOrder);
});

test("buildServerModuleLoadReport emits deterministic skip reasons", () => {
  const validModule: MdcmsModulePackage = {
    manifest: {
      id: "c.valid",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
    server: {
      mount: () => undefined,
      actions: [
        {
          id: "c.valid.action",
          kind: "query",
          method: "GET",
          path: "/api/v1/c.valid/action",
          permissions: ["content:read"],
        },
      ],
    },
  };

  const incompatibleModule: MdcmsModulePackage = {
    manifest: {
      id: "a.incompatible",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "9.0.0",
    },
    server: {
      mount: () => undefined,
    },
  };

  const missingSurfaceModule: MdcmsModulePackage = {
    manifest: {
      id: "b.no-server",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
  };

  const report = buildServerModuleLoadReport(
    [
      { manifest: { id: "z.invalid" } },
      validModule,
      incompatibleModule,
      missingSurfaceModule,
    ],
    {
      coreVersion: "1.0.0",
      logger: testLogger,
    },
  );

  assert.deepEqual(report.loadedModuleIds, ["c.valid"]);
  assert.deepEqual(
    report.skipped.map((entry) => ({ id: entry.id, reason: entry.reason })),
    [
      { id: "a.incompatible", reason: "incompatible" },
      { id: "b.no-server", reason: "missing-surface" },
      { id: "z.invalid", reason: "invalid-package" },
    ],
  );
});
