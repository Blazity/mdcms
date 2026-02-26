import assert from "node:assert/strict";
import { test } from "node:test";

import { installedModules } from "@mdcms/modules";
import { createConsoleLogger, type MdcmsModulePackage } from "@mdcms/shared";

import { buildCliModuleLoadReport, loadCliModules } from "./modules.js";

const testLogger = createConsoleLogger({
  level: "trace",
  sink: () => undefined,
});

test("loadCliModules uses deterministic manifest.id ordering", () => {
  const reportA = loadCliModules({
    coreVersion: "1.0.0",
    logger: testLogger,
  });
  const reportB = loadCliModules({
    coreVersion: "1.0.0",
    logger: testLogger,
  });

  assert.deepEqual(reportA.loadedModuleIds, reportB.loadedModuleIds);
  assert.deepEqual(reportA.skippedModuleIds, reportB.skippedModuleIds);

  const expectedOrder = [...installedModules]
    .filter((modulePackage) => modulePackage.cli !== undefined)
    .map((modulePackage) => modulePackage.manifest.id)
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(reportA.loadedModuleIds, expectedOrder);
});

test("buildCliModuleLoadReport emits deterministic skip reasons", () => {
  const validModule: MdcmsModulePackage = {
    manifest: {
      id: "c.valid",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
    cli: {
      actionAliases: [
        {
          alias: "c:valid",
          actionId: "c.valid.action",
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
    cli: {
      actionAliases: [
        {
          alias: "a:incompatible",
          actionId: "a.incompatible.action",
        },
      ],
    },
  };

  const missingSurfaceModule: MdcmsModulePackage = {
    manifest: {
      id: "b.no-cli",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
  };

  const report = buildCliModuleLoadReport(
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
      { id: "b.no-cli", reason: "missing-surface" },
      { id: "z.invalid", reason: "invalid-package" },
    ],
  );
});
