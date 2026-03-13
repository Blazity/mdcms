import assert from "node:assert/strict";
import { test } from "node:test";

import { installedModules } from "@mdcms/modules";
import {
  RuntimeError,
  createConsoleLogger,
  type MdcmsModulePackage,
} from "@mdcms/shared";

import {
  buildServerModuleLoadReport,
  loadServerModules,
} from "./module-loader.js";

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

test("buildServerModuleLoadReport fails fast with deterministic violations", () => {
  const actionOwnerA: MdcmsModulePackage = {
    manifest: {
      id: "a.owner",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
    server: {
      mount: () => undefined,
      actions: [
        {
          id: "shared.action",
          kind: "query",
          method: "GET",
          path: "/api/v1/a.owner/action",
          permissions: ["content:read"],
        },
      ],
    },
  };

  const actionOwnerB: MdcmsModulePackage = {
    manifest: {
      id: "b.owner",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
    server: {
      mount: () => undefined,
      actions: [
        {
          id: "shared.action",
          kind: "query",
          method: "GET",
          path: "/api/v1/b.owner/action",
          permissions: ["content:read"],
        },
      ],
    },
  };

  const missingDependencyModule: MdcmsModulePackage = {
    manifest: {
      id: "c.missing-dependency",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
      dependsOn: ["missing.module"],
    },
    server: {
      mount: () => undefined,
    },
  };

  assert.throws(
    () =>
      buildServerModuleLoadReport(
        [actionOwnerA, actionOwnerB, missingDependencyModule],
        {
          coreVersion: "1.0.0",
          logger: testLogger,
        },
      ),
    (error) => {
      assert.equal(error instanceof RuntimeError, true);

      if (!(error instanceof RuntimeError)) {
        return false;
      }

      assert.equal(error.code, "INVALID_MODULE_BOOTSTRAP");
      const details = error.details as
        | { violations?: Array<{ code: string; moduleId: string }> }
        | undefined;
      const violations = details?.violations ?? [];

      assert.deepEqual(
        violations.map((entry) => entry.code),
        ["DUPLICATE_ACTION_ID", "MISSING_DEPENDENCY"],
      );
      assert.deepEqual(
        violations.map((entry) => entry.moduleId),
        ["b.owner", "c.missing-dependency"],
      );

      return true;
    },
  );
});
