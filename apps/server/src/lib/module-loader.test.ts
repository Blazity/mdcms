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
  collectServerModuleActions,
  loadServerModules,
} from "./module-loader.js";

const testLogger = createConsoleLogger({
  level: "trace",
  sink: () => undefined,
});

function createServerModule(
  id: string,
  options: {
    dependsOn?: string[];
    actions?: Array<{
      id: string;
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path?: string;
    }>;
  } = {},
): MdcmsModulePackage {
  return {
    manifest: {
      id,
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
      dependsOn: options.dependsOn,
    },
    server: {
      mount: () => undefined,
      actions: (options.actions ?? []).map((action) => ({
        id: action.id,
        kind: "query",
        method: action.method ?? "GET",
        path: action.path ?? `/api/v1/modules/${id}/${action.id}`,
        permissions: ["content:read"],
      })),
    },
  };
}

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

test("buildServerModuleLoadReport preserves dependency-aware action order for shuffled inputs", () => {
  const reportA = buildServerModuleLoadReport(
    [
      createServerModule("m.feature", {
        dependsOn: ["a.feature"],
        actions: [{ id: "m.feature.preview" }],
      }),
      createServerModule("z.core", {
        actions: [{ id: "z.core.preview" }],
      }),
      createServerModule("a.feature", {
        dependsOn: ["z.core"],
        actions: [{ id: "a.feature.preview" }],
      }),
    ],
    {
      coreVersion: "1.0.0",
      logger: testLogger,
    },
  );
  const reportB = buildServerModuleLoadReport(
    [
      createServerModule("a.feature", {
        dependsOn: ["z.core"],
        actions: [{ id: "a.feature.preview" }],
      }),
      createServerModule("m.feature", {
        dependsOn: ["a.feature"],
        actions: [{ id: "m.feature.preview" }],
      }),
      createServerModule("z.core", {
        actions: [{ id: "z.core.preview" }],
      }),
    ],
    {
      coreVersion: "1.0.0",
      logger: testLogger,
    },
  );

  assert.deepEqual(reportA.loadedModuleIds, [
    "z.core",
    "a.feature",
    "m.feature",
  ]);
  assert.deepEqual(reportB.loadedModuleIds, [
    "z.core",
    "a.feature",
    "m.feature",
  ]);
  assert.deepEqual(
    collectServerModuleActions(reportA).map((action) => action.id),
    ["z.core.preview", "a.feature.preview", "m.feature.preview"],
  );
  assert.deepEqual(
    collectServerModuleActions(reportA).map((action) => action.id),
    collectServerModuleActions(reportB).map((action) => action.id),
  );
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

test("buildServerModuleLoadReport fails fast for duplicate action routes", () => {
  assert.throws(
    () =>
      buildServerModuleLoadReport(
        [
          createServerModule("a.owner", {
            actions: [
              {
                id: "a.owner.publish",
                method: "POST",
                path: "/api/v1/content/publish",
              },
            ],
          }),
          createServerModule("b.owner", {
            actions: [
              {
                id: "b.owner.publish",
                method: "POST",
                path: "/api/v1/content/publish",
              },
            ],
          }),
        ],
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
        | { violations?: Array<{ code: string; details: string }> }
        | undefined;
      const violations = details?.violations ?? [];

      assert.deepEqual(
        violations.map((entry) => entry.code),
        ["DUPLICATE_ACTION_ROUTE"],
      );
      assert.match(
        violations[0]?.details ?? "",
        /POST \/api\/v1\/content\/publish/,
      );

      return true;
    },
  );
});
