import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RuntimeError,
  createConsoleLogger,
  type MdcmsModulePackage,
} from "@mdcms/shared";

import { buildServerModuleLoadReport } from "./module-loader.js";
import { createServerRequestHandlerWithModules } from "./runtime-with-modules.js";

const env = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "1.0.0",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
  DATABASE_URL: "postgres://test:test@localhost:5432/mdcms_test",
} as NodeJS.ProcessEnv;

const envWithoutAppVersion = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
  DATABASE_URL: "postgres://test:test@localhost:5432/mdcms_test",
} as NodeJS.ProcessEnv;

const logger = createConsoleLogger({
  level: "trace",
  sink: () => undefined,
});

function createServerModule(
  id: string,
  options: {
    dependsOn?: string[];
    actions?: Array<{ id: string; path: string }>;
    onMount?: (deps: Record<string, unknown>) => void;
  } = {},
): MdcmsModulePackage<unknown, Record<string, unknown>> {
  return {
    manifest: {
      id,
      version: "1.0.0",
      apiVersion: "1",
      minCoreVersion: "0.0.1",
      dependsOn: options.dependsOn,
    },
    server: {
      mount: (_app, deps) => {
        options.onMount?.(deps);
      },
      actions: (options.actions ?? []).map((action) => ({
        id: action.id,
        kind: "query",
        method: "GET",
        path: action.path,
        permissions: ["content:read"],
      })),
    },
  };
}

test("createServerRequestHandlerWithModules surfaces module actions in /api/v1/actions", async () => {
  const { handler, moduleLoadReport, dbConnection } =
    createServerRequestHandlerWithModules({
      env,
      logger,
    });

  try {
    const response = await handler(
      new Request("http://localhost/api/v1/actions"),
    );
    const body = (await response.json()) as Array<{ id: string }>;

    assert.equal(response.status, 200);
    assert.equal(moduleLoadReport.loadedModuleIds.length > 0, true);
    assert.deepEqual(
      body.map((entry) => entry.id),
      ["core.system.ping", "domain.content.preview"],
    );
  } finally {
    await dbConnection.close();
  }
});

test("createServerRequestHandlerWithModules mounts server module routes", async () => {
  const { handler, dbConnection } = createServerRequestHandlerWithModules({
    env,
    logger,
  });

  try {
    const coreResponse = await handler(
      new Request("http://localhost/api/v1/modules/core-system/ping"),
    );
    const coreBody = (await coreResponse.json()) as Record<string, unknown>;

    assert.equal(coreResponse.status, 200);
    assert.equal(coreBody.moduleId, "core.system");

    const contentResponse = await handler(
      new Request("http://localhost/api/v1/modules/domain-content/preview"),
    );
    const contentBody = (await contentResponse.json()) as Record<
      string,
      unknown
    >;

    assert.equal(contentResponse.status, 200);
    assert.equal(contentBody.moduleId, "domain.content");
  } finally {
    await dbConnection.close();
  }
});

test("createServerRequestHandlerWithModules loads bundled modules when APP_VERSION is unset", async () => {
  const { moduleLoadReport, dbConnection } =
    createServerRequestHandlerWithModules({
      env: envWithoutAppVersion,
      logger,
    });

  try {
    assert.deepEqual(moduleLoadReport.loadedModuleIds, [
      "core.system",
      "domain.content",
    ]);
  } finally {
    await dbConnection.close();
  }
});

test("createServerRequestHandlerWithModules fails before module mount on invalid bootstrap", () => {
  let mounted = false;

  const invalidModule = createServerModule("broken", {
    dependsOn: ["missing.core"],
    onMount: () => {
      mounted = true;
    },
  });

  assert.throws(
    () =>
      createServerRequestHandlerWithModules({
        env,
        logger,
        moduleLoadReport: buildServerModuleLoadReport([invalidModule], {
          coreVersion: "1.0.0",
          logger,
        }),
      }),
    (error) => {
      assert.equal(error instanceof RuntimeError, true);

      if (!(error instanceof RuntimeError)) {
        return false;
      }

      assert.equal(error.code, "INVALID_MODULE_BOOTSTRAP");
      const details = error.details as
        | { violations?: Array<{ code: string }> }
        | undefined;
      const violationCodes = (details?.violations ?? []).map(
        (entry) => entry.code,
      );
      assert.deepEqual(violationCodes, ["MISSING_DEPENDENCY"]);

      return true;
    },
  );

  assert.equal(mounted, false);
});

test("createServerRequestHandlerWithModules passes explicit composition-root deps to module mount", async () => {
  let capturedDeps: Record<string, unknown> | undefined;

  const dependencyProbe = createServerModule("dep.probe", {
    onMount: (deps) => {
      capturedDeps = deps;
    },
  });

  const moduleLoadReport = buildServerModuleLoadReport([dependencyProbe], {
    coreVersion: "1.0.0",
    logger,
  });

  const moduleDeps = {
    customService: "probe",
  };

  const { dbConnection, dal } = createServerRequestHandlerWithModules({
    env,
    logger,
    moduleLoadReport,
    moduleDeps,
  });

  try {
    assert.equal(capturedDeps !== undefined, true);

    if (!capturedDeps) {
      return;
    }

    assert.equal(capturedDeps.customService, "probe");
    assert.equal(capturedDeps.dal, dal);
  } finally {
    await dbConnection.close();
  }
});
