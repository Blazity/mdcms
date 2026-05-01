import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createConsoleLogger, type CliPreflightHook } from "@mdcms/shared";

import { loadCliEnvFiles } from "./env-files.js";
import { runMdcmsCli, type CliCommand } from "./framework.js";
import type { CliRuntimeContextWithModules } from "./runtime-with-modules.js";

const ENV_KEYS = [
  "MDCMS_DOTENV",
  "NODE_ENV",
  "TEST_MDCMS_SERVER_URL",
  "TEST_MDCMS_PROJECT",
  "TEST_MDCMS_ENVIRONMENT",
] as const;

type CapturedContext = {
  serverUrl: string;
  project: string;
  environment: string;
};

function createRuntimeWithPreflightHooks(
  preflightHooks: readonly CliPreflightHook[] = [],
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

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
}

function restoreEnv(
  snapshot: Record<(typeof ENV_KEYS)[number], string | undefined>,
): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

async function createProject(): Promise<{
  projectRoot: string;
  nestedCwd: string;
  cleanup: () => Promise<void>;
}> {
  const projectRoot = await mkdtemp(join(tmpdir(), "mdcms-env-files-"));
  const nestedCwd = join(projectRoot, "content", "pages");
  await mkdir(nestedCwd, { recursive: true });
  return {
    projectRoot,
    nestedCwd,
    cleanup: () => rm(projectRoot, { recursive: true, force: true }),
  };
}

async function writeConfig(
  projectRoot: string,
  fallback:
    | {
        serverUrl: string;
        project: string;
        environment: string;
      }
    | undefined = undefined,
): Promise<void> {
  const readEnv = (key: string, fallbackValue?: string) =>
    fallbackValue === undefined
      ? `process.env.${key}`
      : `process.env.${key} ?? ${JSON.stringify(fallbackValue)}`;

  await writeFile(
    join(projectRoot, "mdcms.config.ts"),
    `
      export default {
        serverUrl: ${readEnv("TEST_MDCMS_SERVER_URL", fallback?.serverUrl)},
        project: ${readEnv("TEST_MDCMS_PROJECT", fallback?.project)},
        environment: ${readEnv("TEST_MDCMS_ENVIRONMENT", fallback?.environment)},
        types: [],
      };
    `,
    "utf8",
  );
}

async function writeEnvFile(
  projectRoot: string,
  fileName: string,
  values: CapturedContext,
): Promise<void> {
  await writeFile(
    join(projectRoot, fileName),
    [
      `TEST_MDCMS_SERVER_URL=${values.serverUrl}`,
      `TEST_MDCMS_PROJECT=${values.project}`,
      `TEST_MDCMS_ENVIRONMENT=${values.environment}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function runInspectCommand(
  argv: string[],
  cwd: string,
): Promise<{
  exitCode: number;
  captured: CapturedContext | undefined;
  stderr: string;
}> {
  let captured: CapturedContext | undefined;
  let stderr = "";
  const command: CliCommand = {
    name: "inspect",
    description: "Inspect resolved CLI context",
    run: (context) => {
      captured = {
        serverUrl: context.serverUrl,
        project: context.project,
        environment: context.environment,
      };
      return 0;
    },
  };

  const exitCode = await runMdcmsCli(argv, {
    cwd,
    env: process.env,
    commands: [command],
    runtimeWithModules: createRuntimeWithPreflightHooks(),
    stdout: {
      write: () => undefined,
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });

  return { exitCode, captured, stderr };
}

test("runMdcmsCli loads env files from the nearest config root before importing config", async () => {
  const snapshot = snapshotEnv();
  clearEnv();
  const { projectRoot, nestedCwd, cleanup } = await createProject();
  try {
    await writeConfig(projectRoot);
    await writeEnvFile(projectRoot, ".env", {
      serverUrl: "http://base.example",
      project: "base-project",
      environment: "base",
    });
    await writeEnvFile(projectRoot, ".env.development", {
      serverUrl: "http://mode.example",
      project: "mode-project",
      environment: "mode",
    });
    await writeEnvFile(projectRoot, ".env.local", {
      serverUrl: "http://local.example",
      project: "local-project",
      environment: "local",
    });
    await writeEnvFile(projectRoot, ".env.development.local", {
      serverUrl: "http://mode-local.example",
      project: "mode-local-project",
      environment: "mode-local",
    });

    const { exitCode, captured, stderr } = await runInspectCommand(
      ["inspect"],
      nestedCwd,
    );

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.deepEqual(captured, {
      serverUrl: "http://mode-local.example",
      project: "mode-local-project",
      environment: "mode-local",
    });
  } finally {
    await cleanup();
    restoreEnv(snapshot);
  }
});

test("runMdcmsCli keeps shell-exported values ahead of env-file values", async () => {
  const snapshot = snapshotEnv();
  clearEnv();
  process.env.TEST_MDCMS_SERVER_URL = "http://shell.example";
  const { projectRoot, nestedCwd, cleanup } = await createProject();
  try {
    await writeConfig(projectRoot);
    await writeEnvFile(projectRoot, ".env", {
      serverUrl: "http://base.example",
      project: "base-project",
      environment: "base",
    });
    await writeEnvFile(projectRoot, ".env.development.local", {
      serverUrl: "http://mode-local.example",
      project: "mode-local-project",
      environment: "mode-local",
    });

    const { exitCode, captured } = await runInspectCommand(
      ["inspect"],
      nestedCwd,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(captured, {
      serverUrl: "http://shell.example",
      project: "mode-local-project",
      environment: "mode-local",
    });
    assert.equal(process.env.TEST_MDCMS_SERVER_URL, "http://shell.example");
  } finally {
    await cleanup();
    restoreEnv(snapshot);
  }
});

test("runMdcmsCli skips env-file loading when --no-env-file is present", async () => {
  const snapshot = snapshotEnv();
  clearEnv();
  const { projectRoot, nestedCwd, cleanup } = await createProject();
  try {
    await writeConfig(projectRoot, {
      serverUrl: "http://config.example",
      project: "config-project",
      environment: "config",
    });
    await writeEnvFile(projectRoot, ".env.development.local", {
      serverUrl: "http://mode-local.example",
      project: "mode-local-project",
      environment: "mode-local",
    });

    const { exitCode, captured } = await runInspectCommand(
      ["inspect", "--no-env-file"],
      nestedCwd,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(captured, {
      serverUrl: "http://config.example",
      project: "config-project",
      environment: "config",
    });
    assert.equal(process.env.TEST_MDCMS_SERVER_URL, undefined);
  } finally {
    await cleanup();
    restoreEnv(snapshot);
  }
});

test("runMdcmsCli skips env-file loading when MDCMS_DOTENV is 0", async () => {
  const snapshot = snapshotEnv();
  clearEnv();
  process.env.MDCMS_DOTENV = "0";
  const { projectRoot, nestedCwd, cleanup } = await createProject();
  try {
    await writeConfig(projectRoot, {
      serverUrl: "http://config.example",
      project: "config-project",
      environment: "config",
    });
    await writeEnvFile(projectRoot, ".env.development.local", {
      serverUrl: "http://mode-local.example",
      project: "mode-local-project",
      environment: "mode-local",
    });

    const { exitCode, captured } = await runInspectCommand(
      ["inspect"],
      nestedCwd,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(captured, {
      serverUrl: "http://config.example",
      project: "config-project",
      environment: "config",
    });
  } finally {
    await cleanup();
    restoreEnv(snapshot);
  }
});

test("runMdcmsCli warns and continues when an env file cannot be loaded", async () => {
  const snapshot = snapshotEnv();
  clearEnv();
  const { projectRoot, nestedCwd, cleanup } = await createProject();
  try {
    await writeConfig(projectRoot);
    await writeEnvFile(projectRoot, ".env", {
      serverUrl: "http://base.example",
      project: "base-project",
      environment: "base",
    });
    await mkdir(join(projectRoot, ".env.development.local"));

    const { exitCode, captured, stderr } = await runInspectCommand(
      ["inspect"],
      nestedCwd,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(captured, {
      serverUrl: "http://base.example",
      project: "base-project",
      environment: "base",
    });
    assert.match(stderr, /Warning: Failed to load env file/);
    assert.match(stderr, /\.env\.development\.local/);
  } finally {
    await cleanup();
    restoreEnv(snapshot);
  }
});

test("loadCliEnvFiles accepts dotenv-compatible multiline quoted values", async () => {
  const { projectRoot, cleanup } = await createProject();
  try {
    await writeFile(
      join(projectRoot, ".env"),
      [
        'TEST_MDCMS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
        "line-2",
        '-----END PRIVATE KEY-----"',
        "TEST_MDCMS_PROJECT=multiline-project",
        "",
      ].join("\n"),
      "utf8",
    );

    const env: NodeJS.ProcessEnv = {};
    const result = await loadCliEnvFiles({ cwd: projectRoot, env });

    assert.deepEqual(result.warnings, []);
    assert.equal(
      env.TEST_MDCMS_PRIVATE_KEY,
      "-----BEGIN PRIVATE KEY-----\nline-2\n-----END PRIVATE KEY-----",
    );
    assert.equal(env.TEST_MDCMS_PROJECT, "multiline-project");
  } finally {
    await cleanup();
  }
});
