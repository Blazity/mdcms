import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseCliInvocation,
  resolveExecutionContext,
  runMdcmsCli,
  type CliCommand,
} from "./framework.js";

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
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(captured, {
    serverUrl: "http://config-server",
    project: "flag-project",
    environment: "env-environment",
    apiKey: "env-api-key",
  });
});
