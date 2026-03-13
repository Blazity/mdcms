import assert from "node:assert/strict";
import { test } from "node:test";

import { installedModules } from "@mdcms/modules";
import {
  RuntimeError,
  createConsoleLogger,
  type MdcmsModulePackage,
} from "@mdcms/shared";

import {
  buildCliModuleLoadReport,
  collectCliActionAliases,
  collectCliOutputFormatters,
  collectCliPreflightHooks,
  loadCliModules,
} from "./module-loader.js";

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

function createCliModule(
  id: string,
  options: {
    dependsOn?: string[];
    minCoreVersion?: string;
    alias?: string;
  } = {},
): MdcmsModulePackage {
  const alias = options.alias ?? `${id}:run`;

  return {
    manifest: {
      id,
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: options.minCoreVersion ?? "0.0.1",
      dependsOn: options.dependsOn,
    },
    cli: {
      actionAliases: [
        {
          alias,
          actionId: `${id}.action`,
        },
      ],
      outputFormatters: [
        {
          format: (output) => `${id}:${String(output)}`,
        },
      ],
      preflightHooks: [
        {
          id: `${id}.hook`,
          run: () => undefined,
        },
      ],
    },
  };
}

test("buildCliModuleLoadReport uses strict dependency ordering", () => {
  const report = buildCliModuleLoadReport(
    [
      createCliModule("m.feature", { dependsOn: ["a.feature"] }),
      createCliModule("z.core"),
      createCliModule("a.feature", { dependsOn: ["z.core"] }),
    ],
    {
      coreVersion: "1.0.0",
      logger: testLogger,
    },
  );

  assert.deepEqual(report.loadedModuleIds, ["z.core", "a.feature", "m.feature"]);
});

test("CLI collectors preserve strict loaded module order", () => {
  const report = buildCliModuleLoadReport(
    [
      createCliModule("m.feature", { dependsOn: ["a.feature"] }),
      createCliModule("z.core"),
      createCliModule("a.feature", { dependsOn: ["z.core"] }),
    ],
    {
      coreVersion: "1.0.0",
      logger: testLogger,
    },
  );

  assert.deepEqual(
    collectCliActionAliases(report).map((alias) => alias.alias),
    ["z.core:run", "a.feature:run", "m.feature:run"],
  );
  assert.deepEqual(
    collectCliOutputFormatters(report).map((formatter) =>
      formatter.format("ok"),
    ),
    ["z.core:ok", "a.feature:ok", "m.feature:ok"],
  );
  assert.deepEqual(
    collectCliPreflightHooks(report).map((hook) => hook.id),
    ["z.core.hook", "a.feature.hook", "m.feature.hook"],
  );
});

test("buildCliModuleLoadReport fails fast with deterministic violations", () => {
  assert.throws(
    () =>
      buildCliModuleLoadReport(
        [null, createCliModule("m.missing", { dependsOn: ["ghost.module"] })],
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
        ["INVALID_PACKAGE", "MISSING_DEPENDENCY"],
      );
      assert.deepEqual(
        violations.map((entry) => entry.moduleId),
        ["unknown.0000", "m.missing"],
      );

      return true;
    },
  );
});
