import assert from "node:assert/strict";
import { test } from "node:test";

import type { MdcmsModulePackage } from "../contracts/extensibility.js";
import { createConsoleLogger } from "./logger.js";
import { buildModuleLoadReport } from "./module-loader-core.js";

function createNoopLogger() {
  return createConsoleLogger({
    sink: () => undefined,
  });
}

function createModule(
  id: string,
  options: {
    server?: boolean;
    cli?: boolean;
    minCoreVersion?: string;
  } = {},
): MdcmsModulePackage {
  return {
    manifest: {
      id,
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: options.minCoreVersion,
    },
    server: options.server
      ? {
          mount: () => undefined,
          actions: [],
        }
      : undefined,
    cli: options.cli
      ? {
          actionAliases: [],
          outputFormatters: [],
          preflightHooks: [],
        }
      : undefined,
  };
}

test("buildModuleLoadReport sorts module ids deterministically", () => {
  const report = buildModuleLoadReport(
    [createModule("zeta", { cli: true }), createModule("alpha", { cli: true })],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
    },
  );

  assert.deepEqual(report.evaluatedModuleIds, ["alpha", "zeta"]);
  assert.deepEqual(report.loadedModuleIds, ["alpha", "zeta"]);
  assert.deepEqual(report.skippedModuleIds, []);
});

test("buildModuleLoadReport marks missing surface explicitly", () => {
  const report = buildModuleLoadReport([createModule("alpha", { cli: true })], {
    coreVersion: "1.0.0",
    surface: "server",
    runtime: "server",
    logger: createNoopLogger(),
  });

  assert.deepEqual(report.loadedModuleIds, []);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0]?.id, "alpha");
  assert.equal(report.skipped[0]?.reason, "missing-surface");
});

test("buildModuleLoadReport marks incompatible manifests", () => {
  const report = buildModuleLoadReport(
    [createModule("future", { cli: true, minCoreVersion: "9.0.0" })],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
    },
  );

  assert.deepEqual(report.loadedModuleIds, []);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0]?.id, "future");
  assert.equal(report.skipped[0]?.reason, "incompatible");
});

test("buildModuleLoadReport marks invalid package payloads", () => {
  const report = buildModuleLoadReport([null], {
    coreVersion: "1.0.0",
    surface: "cli",
    runtime: "cli",
    logger: createNoopLogger(),
  });

  assert.deepEqual(report.loadedModuleIds, []);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0]?.id, "unknown.0000");
  assert.equal(report.skipped[0]?.reason, "invalid-package");
});
