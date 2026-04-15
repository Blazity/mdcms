import assert from "node:assert/strict";
import { test } from "bun:test";

import type { MdcmsModulePackage } from "../contracts/extensibility.js";
import { createConsoleLogger } from "./logger.js";
import {
  buildModuleLoadReport,
  buildRuntimeModulePlan,
} from "./module-loader-core.js";

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
    dependsOn?: string[];
    actionIds?: string[];
    actions?: Array<{
      id: string;
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path?: string;
    }>;
  } = {},
): MdcmsModulePackage {
  const serverActions =
    options.actions ??
    (options.actionIds ?? []).map((actionId) => ({
      id: actionId,
      method: "GET" as const,
      path: `/api/v1/actions/${actionId}`,
    }));

  return {
    manifest: {
      id,
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: options.minCoreVersion,
      dependsOn: options.dependsOn,
    },
    server: options.server
      ? {
          mount: () => undefined,
          actions: serverActions.map((action) => ({
            id: action.id,
            kind: "query",
            method: action.method ?? "GET",
            path: action.path ?? `/api/v1/actions/${action.id}`,
            permissions: ["content:read"],
          })),
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

test("buildRuntimeModulePlan computes deterministic topological order", () => {
  const plan = buildRuntimeModulePlan(
    [
      createModule("beta", { cli: true, dependsOn: ["alpha"] }),
      createModule("core.system", { cli: true }),
      createModule("alpha", { cli: true, dependsOn: ["core.system"] }),
    ],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
    },
  );

  assert.equal(plan.ok, true);

  if (!plan.ok) {
    return;
  }

  assert.deepEqual(plan.moduleIds, ["core.system", "alpha", "beta"]);
  assert.deepEqual(
    plan.loaded.map((moduleResult) => moduleResult.id),
    ["core.system", "alpha", "beta"],
  );
});

test("buildRuntimeModulePlan reports duplicate module ids", () => {
  const plan = buildRuntimeModulePlan(
    [createModule("dup", { cli: true }), createModule("dup", { cli: true })],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
    },
  );

  assert.equal(plan.ok, false);

  if (plan.ok) {
    return;
  }

  assert.deepEqual(
    plan.violations.map((entry) => entry.code),
    ["DUPLICATE_MODULE_ID"],
  );
});

test("buildRuntimeModulePlan reports missing dependsOn targets", () => {
  const plan = buildRuntimeModulePlan(
    [createModule("alpha", { cli: true, dependsOn: ["missing.target"] })],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
    },
  );

  assert.equal(plan.ok, false);

  if (plan.ok) {
    return;
  }

  assert.deepEqual(
    plan.violations.map((entry) => entry.code),
    ["MISSING_DEPENDENCY"],
  );
});

test("buildRuntimeModulePlan reports dependency cycles", () => {
  const plan = buildRuntimeModulePlan(
    [
      createModule("cycle.alpha", { cli: true, dependsOn: ["cycle.beta"] }),
      createModule("cycle.beta", { cli: true, dependsOn: ["cycle.alpha"] }),
    ],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
    },
  );

  assert.equal(plan.ok, false);

  if (plan.ok) {
    return;
  }

  assert.deepEqual(
    plan.violations.map((entry) => entry.code),
    ["DEPENDENCY_CYCLE", "DEPENDENCY_CYCLE"],
  );
});

test("buildRuntimeModulePlan reports duplicate server action ids", () => {
  const plan = buildRuntimeModulePlan(
    [
      createModule("alpha", {
        server: true,
        actionIds: ["content.preview"],
      }),
      createModule("beta", {
        server: true,
        actionIds: ["content.preview"],
      }),
    ],
    {
      coreVersion: "1.0.0",
      surface: "server",
      runtime: "server",
      logger: createNoopLogger(),
    },
  );

  assert.equal(plan.ok, false);

  if (plan.ok) {
    return;
  }

  assert.deepEqual(
    plan.violations.map((entry) => entry.code),
    ["DUPLICATE_ACTION_ID"],
  );
});

test("buildRuntimeModulePlan reports conflicting server action routes", () => {
  const plan = buildRuntimeModulePlan(
    [
      createModule("alpha", {
        server: true,
        actions: [
          {
            id: "alpha.publish",
            method: "POST",
            path: "/api/v1/content/publish",
          },
        ],
      }),
      createModule("beta", {
        server: true,
        actions: [
          {
            id: "beta.publish",
            method: "POST",
            path: "/api/v1/content/publish",
          },
        ],
      }),
    ],
    {
      coreVersion: "1.0.0",
      surface: "server",
      runtime: "server",
      logger: createNoopLogger(),
    },
  );

  assert.equal(plan.ok, false);

  if (plan.ok) {
    return;
  }

  assert.deepEqual(
    plan.violations.map((entry) => entry.code),
    ["DUPLICATE_ACTION_ROUTE"],
  );
  assert.match(
    plan.violations[0]?.details ?? "",
    /POST \/api\/v1\/content\/publish/,
  );
});

test("buildRuntimeModulePlan sorts violations deterministically", () => {
  const moduleCandidates = [
    null,
    createModule("future", { cli: true, minCoreVersion: "9.0.0" }),
    createModule("dup", { cli: true }),
    createModule("dup", { cli: true }),
    createModule("missing", { cli: true, dependsOn: ["ghost"] }),
    createModule("cycle.alpha", { cli: true, dependsOn: ["cycle.beta"] }),
    createModule("cycle.beta", { cli: true, dependsOn: ["cycle.alpha"] }),
    createModule("action.alpha", {
      server: true,
      actionIds: ["system.ping"],
    }),
    createModule("action.beta", {
      server: true,
      actionIds: ["system.ping"],
    }),
    createModule("route.alpha", {
      server: true,
      actions: [
        {
          id: "route.alpha.publish",
          method: "POST",
          path: "/api/v1/routes/shared",
        },
      ],
    }),
    createModule("route.beta", {
      server: true,
      actions: [
        {
          id: "route.beta.publish",
          method: "POST",
          path: "/api/v1/routes/shared",
        },
      ],
    }),
  ];

  const planA = buildRuntimeModulePlan(moduleCandidates, {
    coreVersion: "1.0.0",
    surface: "server",
    runtime: "server",
    logger: createNoopLogger(),
  });
  const planB = buildRuntimeModulePlan(moduleCandidates, {
    coreVersion: "1.0.0",
    surface: "server",
    runtime: "server",
    logger: createNoopLogger(),
  });

  assert.equal(planA.ok, false);
  assert.equal(planB.ok, false);

  if (planA.ok || planB.ok) {
    return;
  }

  assert.deepEqual(planA.violations, planB.violations);
  assert.deepEqual(
    planA.violations.map((entry) => entry.code),
    [
      "DEPENDENCY_CYCLE",
      "DEPENDENCY_CYCLE",
      "DUPLICATE_ACTION_ID",
      "DUPLICATE_ACTION_ROUTE",
      "DUPLICATE_MODULE_ID",
      "INCOMPATIBLE_MANIFEST",
      "INVALID_PACKAGE",
      "MISSING_DEPENDENCY",
    ],
  );
});

test("buildModuleLoadReport remains skip-based compatibility wrapper", () => {
  const report = buildModuleLoadReport(
    [
      { manifest: { id: "z.invalid" } },
      createModule("c.valid", { cli: true, minCoreVersion: "0.0.1" }),
      createModule("a.incompatible", { cli: true, minCoreVersion: "9.0.0" }),
      createModule("b.no-cli", { server: true }),
    ],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: createNoopLogger(),
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

test("buildRuntimeModulePlan logs plan_ready at debug level", () => {
  const entries: Array<{ level: string; message: string }> = [];
  const capturingLogger = createConsoleLogger({
    level: "debug",
    sink: (entry) => {
      entries.push({ level: entry.level, message: entry.message });
    },
  });

  const plan = buildRuntimeModulePlan([createModule("alpha", { cli: true })], {
    coreVersion: "1.0.0",
    surface: "cli",
    runtime: "cli",
    logger: capturingLogger,
  });

  assert.equal(plan.ok, true);

  const planReadyEntry = entries.find(
    (entry) => entry.message === "cli_module_plan_ready",
  );
  assert.ok(planReadyEntry, "cli_module_plan_ready entry should be logged");
  assert.equal(planReadyEntry.level, "debug");
});

test("buildModuleLoadReport logs loaded and summary at debug level and skipped at debug level", () => {
  const entries: Array<{ level: string; message: string }> = [];
  const capturingLogger = createConsoleLogger({
    level: "debug",
    sink: (entry) => {
      entries.push({ level: entry.level, message: entry.message });
    },
  });

  buildModuleLoadReport(
    [
      createModule("a.with-cli", { cli: true }),
      createModule("b.no-cli", { server: true }),
    ],
    {
      coreVersion: "1.0.0",
      surface: "cli",
      runtime: "cli",
      logger: capturingLogger,
    },
  );

  const loadedEntry = entries.find(
    (entry) => entry.message === "cli_module_loaded",
  );
  const skippedEntry = entries.find(
    (entry) => entry.message === "cli_module_skipped",
  );
  const summaryEntry = entries.find(
    (entry) => entry.message === "cli_module_load_summary",
  );

  assert.ok(loadedEntry, "cli_module_loaded entry should be logged");
  assert.equal(loadedEntry.level, "debug");

  assert.ok(skippedEntry, "cli_module_skipped entry should be logged");
  assert.equal(skippedEntry.level, "debug");

  assert.ok(summaryEntry, "cli_module_load_summary entry should be logged");
  assert.equal(summaryEntry.level, "debug");
});
