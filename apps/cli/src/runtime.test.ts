import assert from "node:assert/strict";
import { test } from "node:test";

import { createAppCliRuntimeContext } from "./runtime.js";

test("createAppCliRuntimeContext loads module report from installed registry", () => {
  const runtime = createAppCliRuntimeContext({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    APP_VERSION: "1.0.0",
    CLI_NAME: "mdcms",
  } as NodeJS.ProcessEnv);

  assert.equal(runtime.moduleLoadReport.loadedModuleIds.length > 0, true);
  assert.deepEqual(runtime.moduleLoadReport.loadedModuleIds, [
    "core.system",
    "domain.content",
  ]);
  assert.deepEqual(
    runtime.actionAliases.map((alias) => alias.alias),
    ["system:ping", "content:preview"],
  );
  assert.deepEqual(
    runtime.outputFormatters.map((formatter) => formatter.actionId),
    ["core.system.ping", "domain.content.preview"],
  );
  assert.deepEqual(
    runtime.preflightHooks.map((hook) => hook.id),
    ["core.system.default-preflight", "domain.content.default-preflight"],
  );
});

test("createAppCliRuntimeContext loads bundled modules when APP_VERSION is unset", () => {
  const runtime = createAppCliRuntimeContext({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    CLI_NAME: "mdcms",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(runtime.moduleLoadReport.loadedModuleIds, [
    "core.system",
    "domain.content",
  ]);
  assert.equal(runtime.actionAliases.length, 2);
  assert.equal(runtime.outputFormatters.length, 2);
  assert.equal(runtime.preflightHooks.length, 2);
});
