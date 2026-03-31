import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  RuntimeError,
  createConsoleLogger,
  type CliPreflightHook,
} from "@mdcms/shared";

import {
  parseCliInvocation,
  resolveExecutionContext,
  runMdcmsCli,
  type CliCommand,
} from "./framework.js";
import { createInMemoryCredentialStore } from "./credentials.js";
import type { CliRuntimeContextWithModules } from "./runtime-with-modules.js";

function createRuntimeWithPreflightHooks(
  preflightHooks: readonly CliPreflightHook[],
): CliRuntimeContextWithModules {
  return {
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "debug",
      APP_VERSION: "1.0.0",
      CLI_NAME: "mdcms",
    },
    logger: createConsoleLogger({
      level: "trace",
      sink: () => undefined,
    }),
    moduleLoadReport: {
      evaluatedModuleIds: [],
      loadedModuleIds: [],
      skippedModuleIds: [],
      loaded: [],
      skipped: [],
    },
    actionAliases: [],
    outputFormatters: [],
    preflightHooks,
  };
}

test("parseCliInvocation resolves global flags and command args", () => {
  const parsed = parseCliInvocation([
    "cms",
    "pull",
    "--project",
    "marketing",
    "--environment=staging",
    "--api-key",
    "token-1",
    "--config",
    "mdcms.config.ts",
    "--server-url",
    "http://localhost:4000",
    "--published",
  ]);

  assert.equal(parsed.commandName, "pull");
  assert.deepEqual(parsed.commandArgs, ["--published"]);
  assert.equal(parsed.global.project, "marketing");
  assert.equal(parsed.global.environment, "staging");
  assert.equal(parsed.global.apiKey, "token-1");
  assert.equal(parsed.global.configPath, "mdcms.config.ts");
  assert.equal(parsed.global.serverUrl, "http://localhost:4000");
});

test("resolveExecutionContext applies target precedence flag > env > config", async () => {
  const resolved = await resolveExecutionContext({
    global: {
      help: false,
      project: "flag-project",
      environment: "flag-env",
    },
    env: {
      MDCMS_PROJECT: "env-project",
      MDCMS_ENVIRONMENT: "env-env",
      MDCMS_SERVER_URL: "http://env.example",
    } as NodeJS.ProcessEnv,
    config: {
      serverUrl: "http://config.example",
      project: "config-project",
      environment: "config-env",
    },
    requiresTarget: true,
  });

  assert.equal(resolved.serverUrl, "http://env.example");
  assert.equal(resolved.project, "flag-project");
  assert.equal(resolved.environment, "flag-env");
});

test("resolveExecutionContext applies auth precedence --api-key > env > stored", async () => {
  const fromFlag = await resolveExecutionContext({
    global: {
      help: false,
      project: "project",
      environment: "env",
      apiKey: "flag-key",
    },
    env: {
      MDCMS_API_KEY: "env-key",
    } as NodeJS.ProcessEnv,
    config: {
      serverUrl: "http://localhost:4000",
      project: "config-project",
      environment: "config-env",
    },
    resolveStoredApiKey: async () => "stored-key",
    requiresTarget: true,
  });
  assert.equal(fromFlag.apiKey, "flag-key");

  const fromEnv = await resolveExecutionContext({
    global: {
      help: false,
      project: "project",
      environment: "env",
    },
    env: {
      MDCMS_API_KEY: "env-key",
    } as NodeJS.ProcessEnv,
    config: {
      serverUrl: "http://localhost:4000",
      project: "config-project",
      environment: "config-env",
    },
    resolveStoredApiKey: async () => "stored-key",
    requiresTarget: true,
  });
  assert.equal(fromEnv.apiKey, "env-key");
});

test("runMdcmsCli returns deterministic usage errors for unknown command", async () => {
  let stderr = "";
  const exitCode = await runMdcmsCli(["unknown"], {
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
    stdout: {
      write: () => undefined,
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stderr.includes("INVALID_USAGE: Unknown command"), true);
});

test("runMdcmsCli does not block config-optional commands when the default config file is missing", async () => {
  const scratchRoot = join(process.cwd(), ".tmp");
  await mkdir(scratchRoot, { recursive: true });
  const cwd = await mkdtemp(join(scratchRoot, "mdcms-framework-"));
  try {
    let commandRan = false;
    let loadConfigCalls = 0;
    const command: CliCommand = {
      name: "login",
      description: "Authenticate",
      requiresTarget: true,
      requiresConfig: false,
      run: async (context) => {
        commandRan = true;
        assert.equal(context.serverUrl, "http://localhost:4000");
        assert.equal(context.project, "marketing-site");
        assert.equal(context.environment, "staging");
        return 0;
      },
    };

    const exitCode = await runMdcmsCli(
      [
        "login",
        "--server-url",
        "http://localhost:4000",
        "--project",
        "marketing-site",
        "--environment",
        "staging",
      ],
      {
        cwd,
        commands: [command],
        loadConfig: async () => {
          loadConfigCalls += 1;
          throw new RuntimeError({
            code: "CONFIG_NOT_FOUND",
            message: "Config missing in scratch repo.",
            statusCode: 404,
          });
        },
        stdout: {
          write: () => undefined,
        },
        stderr: {
          write: () => undefined,
        },
      },
    );

    assert.equal(exitCode, 0);
    assert.equal(commandRan, true);
    assert.equal(loadConfigCalls, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runMdcmsCli executes command with resolved target and auth context", async () => {
  let captured:
    | {
        serverUrl: string;
        project: string;
        environment: string;
        apiKey?: string;
      }
    | undefined;
  const command: CliCommand = {
    name: "inspect",
    description: "Inspect context",
    run: async (context) => {
      captured = {
        serverUrl: context.serverUrl,
        project: context.project,
        environment: context.environment,
        apiKey: context.apiKey,
      };
      return 0;
    },
  };

  const exitCode = await runMdcmsCli(["inspect", "--project", "flag-project"], {
    env: {
      MDCMS_ENVIRONMENT: "env-environment",
      MDCMS_API_KEY: "env-api-key",
    } as NodeJS.ProcessEnv,
    commands: [command],
    loadConfig: async () => ({
      config: {
        serverUrl: "http://config-server",
        project: "config-project",
        environment: "config-environment",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: {
      write: () => undefined,
    },
    stderr: {
      write: () => undefined,
    },
    runtimeWithModules: createRuntimeWithPreflightHooks([]),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(captured, {
    serverUrl: "http://config-server",
    project: "flag-project",
    environment: "env-environment",
    apiKey: "env-api-key",
  });
});

test("runMdcmsCli resolves stored API key from credential store by default", async () => {
  let capturedApiKey: string | undefined;
  const command: CliCommand = {
    name: "inspect",
    description: "Inspect context",
    run: async (context) => {
      capturedApiKey = context.apiKey;
      return 0;
    },
  };
  const credentialStore = createInMemoryCredentialStore();
  await credentialStore.setProfile(
    {
      serverUrl: "http://config-server",
      project: "config-project",
      environment: "config-environment",
    },
    {
      authMode: "api_key",
      apiKey: "stored-api-key",
      apiKeyId: "key-id",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );

  const exitCode = await runMdcmsCli(["inspect"], {
    commands: [command],
    credentialStore,
    loadConfig: async () => ({
      config: {
        serverUrl: "http://config-server",
        project: "config-project",
        environment: "config-environment",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: {
      write: () => undefined,
    },
    stderr: {
      write: () => undefined,
    },
    runtimeWithModules: createRuntimeWithPreflightHooks([]),
  });

  assert.equal(exitCode, 0);
  assert.equal(capturedApiKey, "stored-api-key");
});

test("runMdcmsCli executes preflight hooks before command execution", async () => {
  const observed: string[] = [];
  const command: CliCommand = {
    name: "inspect",
    description: "Inspect context",
    run: async () => {
      observed.push("command");
      return 0;
    },
  };

  const exitCode = await runMdcmsCli(["inspect"], {
    commands: [command],
    runtimeWithModules: createRuntimeWithPreflightHooks([
      {
        id: "core.system.test-preflight",
        run: ({ actionId }) => {
          observed.push(`hook:${actionId}`);
        },
      },
    ]),
    loadConfig: async () => ({
      config: {
        serverUrl: "http://config-server",
        project: "config-project",
        environment: "config-environment",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: {
      write: () => undefined,
    },
    stderr: {
      write: () => undefined,
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(observed, ["hook:inspect", "command"]);
});

test("runMdcmsCli fails deterministically when preflight hook throws", async () => {
  let stderr = "";
  let commandRuns = false;
  const command: CliCommand = {
    name: "inspect",
    description: "Inspect context",
    run: async () => {
      commandRuns = true;
      return 0;
    },
  };

  const exitCode = await runMdcmsCli(["inspect"], {
    commands: [command],
    runtimeWithModules: createRuntimeWithPreflightHooks([
      {
        id: "domain.content.test-preflight",
        run: () => {
          throw new RuntimeError({
            code: "CLI_PREFLIGHT_FAILED",
            message: "Synthetic preflight failure.",
            statusCode: 500,
          });
        },
      },
    ]),
    loadConfig: async () => ({
      config: {
        serverUrl: "http://config-server",
        project: "config-project",
        environment: "config-environment",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: {
      write: () => undefined,
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(commandRuns, false);
  assert.equal(stderr.includes("CLI_PREFLIGHT_FAILED"), true);
});

test("runMdcmsCli resolves multi-word command name", async () => {
  let ran = false;

  const command: CliCommand = {
    name: "schema sync",
    description: "Sync schema",
    requiresConfig: false,
    requiresTarget: false,
    run: async () => {
      ran = true;
      return 0;
    },
  };

  const exitCode = await runMdcmsCli(
    ["schema", "sync", "--server-url", "http://localhost:4000"],
    {
      commands: [command],
      loadConfig: async () => {
        throw new RuntimeError({
          code: "CONFIG_NOT_FOUND",
          message: "No config.",
          statusCode: 404,
        });
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(ran, true);
});

test("runMdcmsCli passes remaining tokens as args for multi-word command", async () => {
  let capturedArgs: string[] = [];

  const command: CliCommand = {
    name: "schema sync",
    description: "Sync schema",
    requiresConfig: false,
    requiresTarget: false,
    run: async (ctx) => {
      capturedArgs = ctx.args;
      return 0;
    },
  };

  const exitCode = await runMdcmsCli(
    ["schema", "sync", "--dry-run", "--server-url", "http://localhost:4000"],
    {
      commands: [command],
      loadConfig: async () => {
        throw new RuntimeError({
          code: "CONFIG_NOT_FOUND",
          message: "No config.",
          statusCode: 404,
        });
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(capturedArgs, ["--dry-run"]);
});

test("runMdcmsCli still resolves single-word commands when multi-word commands exist", async () => {
  let ranPush = false;

  const commands: CliCommand[] = [
    {
      name: "schema sync",
      description: "Sync schema",
      requiresConfig: false,
      requiresTarget: false,
      run: async () => 0,
    },
    {
      name: "push",
      description: "Push content",
      requiresConfig: false,
      requiresTarget: false,
      run: async () => {
        ranPush = true;
        return 0;
      },
    },
  ];

  const exitCode = await runMdcmsCli(
    ["push", "--server-url", "http://localhost:4000"],
    {
      commands,
      loadConfig: async () => {
        throw new RuntimeError({
          code: "CONFIG_NOT_FOUND",
          message: "No config.",
          statusCode: 404,
        });
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(ranPush, true);
});
