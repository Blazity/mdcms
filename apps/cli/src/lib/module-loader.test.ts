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

test("loadCliModules uses deterministic dependency-aware ordering", () => {
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
  assert.deepEqual(
    reportA.loaded.map((moduleResult) => moduleResult.id),
    reportA.loadedModuleIds,
  );

  const loadedModules = [...installedModules]
    .filter((modulePackage) => modulePackage.cli !== undefined)
    .map((modulePackage) => modulePackage.manifest);
  const positions = new Map(
    reportA.loadedModuleIds.map((moduleId, index) => [moduleId, index]),
  );

  for (const manifest of loadedModules) {
    const currentPosition = positions.get(manifest.id);
    assert.notEqual(currentPosition, undefined);

    for (const dependencyId of manifest.dependsOn ?? []) {
      const dependencyPosition = positions.get(dependencyId);

      if (dependencyPosition === undefined || currentPosition === undefined) {
        continue;
      }

      assert.equal(
        dependencyPosition < currentPosition,
        true,
        `${manifest.id} should be ordered after ${dependencyId}`,
      );
    }
  }
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

  assert.deepEqual(report.loadedModuleIds, [
    "z.core",
    "a.feature",
    "m.feature",
  ]);
});

test("buildCliModuleLoadReport keeps missing-surface entries in skipped report", () => {
  const noCliSurfaceModule: MdcmsModulePackage = {
    manifest: {
      id: "b.no-cli",
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
    },
  };

  const report = buildCliModuleLoadReport(
    [
      createCliModule("a.feature"),
      noCliSurfaceModule,
      createCliModule("z.core"),
    ],
    {
      coreVersion: "1.0.0",
      logger: testLogger,
    },
  );

  assert.deepEqual(report.evaluatedModuleIds, [
    "a.feature",
    "b.no-cli",
    "z.core",
  ]);
  assert.deepEqual(report.skippedModuleIds, ["b.no-cli"]);
  assert.deepEqual(
    report.skipped.map((entry) => ({ id: entry.id, reason: entry.reason })),
    [{ id: "b.no-cli", reason: "missing-surface" }],
  );
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

test("CLI registry merge order is deterministic for shuffled module candidates", () => {
  const inputA = [
    createCliModule("m.feature", { dependsOn: ["a.feature"] }),
    createCliModule("z.core"),
    createCliModule("a.feature", { dependsOn: ["z.core"] }),
  ];
  const inputB = [
    createCliModule("a.feature", { dependsOn: ["z.core"] }),
    createCliModule("m.feature", { dependsOn: ["a.feature"] }),
    createCliModule("z.core"),
  ];

  const reportA = buildCliModuleLoadReport(inputA, {
    coreVersion: "1.0.0",
    logger: testLogger,
  });
  const reportB = buildCliModuleLoadReport(inputB, {
    coreVersion: "1.0.0",
    logger: testLogger,
  });

  assert.deepEqual(reportA.loadedModuleIds, reportB.loadedModuleIds);
  assert.deepEqual(
    collectCliActionAliases(reportA).map((alias) => alias.alias),
    collectCliActionAliases(reportB).map((alias) => alias.alias),
  );
  assert.deepEqual(
    collectCliOutputFormatters(reportA).map((formatter) =>
      formatter.format("ok"),
    ),
    collectCliOutputFormatters(reportB).map((formatter) =>
      formatter.format("ok"),
    ),
  );
  assert.deepEqual(
    collectCliPreflightHooks(reportA).map((hook) => hook.id),
    collectCliPreflightHooks(reportB).map((hook) => hook.id),
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
