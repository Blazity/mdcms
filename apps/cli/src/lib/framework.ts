import { resolve } from "node:path";
import { stdin as processStdin } from "node:process";

import { checkbox, select } from "@inquirer/prompts";
import { RuntimeError, type CliPreflightHook } from "@mdcms/shared";

import { formatCliErrorEnvelope } from "./cli.js";
import { loadCliConfig, type CliConfig } from "./config.js";
import { createCredentialStore, type CredentialStore } from "./credentials.js";
import { createInitCommand } from "./init.js";
import { createLoginCommand } from "./login.js";
import { createLogoutCommand } from "./logout.js";
import { createPullCommand } from "./pull.js";
import { createPushCommand } from "./push.js";
import {
  createCliRuntimeContextWithModules,
  type CliRuntimeContextWithModules,
} from "./runtime-with-modules.js";
import { createSchemaSyncCommand } from "./schema-sync.js";
import { createStatusCommand } from "./status.js";

export type Writer = {
  write: (chunk: string) => unknown;
};

type ConfirmPrompt = (message: string) => Promise<boolean>;

export type MultiSelectPrompt = <T extends string>(
  message: string,
  choices: Array<{ label: string; value: T }>,
) => Promise<T[]>;

export type CliGlobalOptions = {
  help: boolean;
  project?: string;
  environment?: string;
  apiKey?: string;
  configPath?: string;
  serverUrl?: string;
};

export type ParsedCliInvocation = {
  global: CliGlobalOptions;
  commandName?: string;
  commandArgs: string[];
};

export type CliCommandContext = {
  runtime: CliRuntimeContextWithModules;
  cwd: string;
  env: NodeJS.ProcessEnv;
  config: CliConfig;
  configPath: string;
  serverUrl: string;
  project: string;
  environment: string;
  apiKey?: string;
  args: string[];
  fetcher: typeof fetch;
  confirm: ConfirmPrompt;
  multiSelect: MultiSelectPrompt;
  stdout: Writer;
  stderr: Writer;
};

export type CliCommand = {
  name: string;
  description: string;
  requiresTarget?: boolean;
  requiresConfig?: boolean;
  run: (context: CliCommandContext) => Promise<number | void> | number | void;
};

export type ResolveStoredApiKey = (input: {
  serverUrl: string;
  project: string;
  environment: string;
}) => Promise<string | undefined>;

export type LoadCliConfig = (options: {
  cwd: string;
  configPath?: string;
}) => Promise<{ config: CliConfig; configPath: string }>;

export type RunMdcmsCliOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Writer;
  stderr?: Writer;
  commands?: CliCommand[];
  loadConfig?: LoadCliConfig;
  resolveStoredApiKey?: ResolveStoredApiKey;
  credentialStore?: CredentialStore;
  fetcher?: typeof fetch;
  confirm?: ConfirmPrompt;
  multiSelect?: MultiSelectPrompt;
  runtimeWithModules?: CliRuntimeContextWithModules;
};

const DEFAULT_COMMANDS: CliCommand[] = [
  createInitCommand(),
  createLoginCommand(),
  createLogoutCommand(),
  createPullCommand(),
  createPushCommand(),
  createSchemaSyncCommand(),
  createStatusCommand(),
];

/**
 * Validates and normalizes an optional CLI flag value.
 *
 * @param value - The raw flag value to normalize; may be `undefined`.
 * @param flag - The flag name used in error messages when the value is invalid.
 * @returns The trimmed string, or `undefined` if `value` was `undefined`.
 * @throws RuntimeError with code `INVALID_INPUT` if `value` is empty after trimming.
 */
function parseOptionalValue(
  value: string | undefined,
  flag: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Flag "${flag}" cannot be empty.`,
      statusCode: 400,
      details: { flag },
    });
  }

  return trimmed;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const next = argv[index + 1];

  if (!next || next.startsWith("-")) {
    throw new RuntimeError({
      code: "INVALID_INPUT",
      message: `Flag "${flag}" requires a value.`,
      statusCode: 400,
      details: { flag },
    });
  }

  return next;
}

export function parseCliInvocation(argv: string[]): ParsedCliInvocation {
  const global: CliGlobalOptions = {
    help: false,
  };
  const commandTokens: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "-h" || token === "--help") {
      global.help = true;
      continue;
    }

    if (token === "--project") {
      global.project = parseOptionalValue(
        readFlagValue(argv, index, "--project"),
        "--project",
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--project=")) {
      global.project = parseOptionalValue(
        token.slice("--project=".length),
        "--project",
      );
      continue;
    }

    if (token === "--environment") {
      global.environment = parseOptionalValue(
        readFlagValue(argv, index, "--environment"),
        "--environment",
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--environment=")) {
      global.environment = parseOptionalValue(
        token.slice("--environment=".length),
        "--environment",
      );
      continue;
    }

    if (token === "--api-key") {
      global.apiKey = parseOptionalValue(
        readFlagValue(argv, index, "--api-key"),
        "--api-key",
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--api-key=")) {
      global.apiKey = parseOptionalValue(
        token.slice("--api-key=".length),
        "--api-key",
      );
      continue;
    }

    if (token === "--config") {
      global.configPath = parseOptionalValue(
        readFlagValue(argv, index, "--config"),
        "--config",
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--config=")) {
      global.configPath = parseOptionalValue(
        token.slice("--config=".length),
        "--config",
      );
      continue;
    }

    if (token === "--server-url") {
      global.serverUrl = parseOptionalValue(
        readFlagValue(argv, index, "--server-url"),
        "--server-url",
      );
      index += 1;
      continue;
    }

    if (token.startsWith("--server-url=")) {
      global.serverUrl = parseOptionalValue(
        token.slice("--server-url=".length),
        "--server-url",
      );
      continue;
    }

    commandTokens.push(token);
  }

  if (commandTokens[0] === "cms") {
    commandTokens.shift();
  }

  return {
    global,
    commandName: commandTokens[0],
    commandArgs: commandTokens.slice(1),
  };
}

export function createCommandRegistry(
  commands: readonly CliCommand[],
): Map<string, CliCommand> {
  const registry = new Map<string, CliCommand>();

  for (const command of commands) {
    registry.set(command.name, command);
  }

  return registry;
}

/**
 * Determine the effective server URL, project, environment, and API key for CLI execution.
 *
 * The values are resolved in this priority order: explicit CLI flags in `input.global`, environment
 * variables from `input.env` (parsed via `parseOptionalValue`), then `input.config` fields.
 * When `resolveStoredApiKey` is provided and both project and environment are resolved, it will be
 * consulted to obtain a stored API key which is used only if no API key is provided via flags or env.
 *
 * @param input - Resolution inputs and options:
 *   - `global`: CLI global flags that take highest precedence.
 *   - `env`: process environment variables (MDCMS_*).
 *   - `config`: parsed CLI config file values.
 *   - `resolveStoredApiKey`: optional callback to retrieve a stored API key for a given server/project/environment; only invoked when both project and environment are present.
 *   - `requiresTarget`: when true, the function enforces that `serverUrl`, `project`, and `environment` are present.
 *
 * @returns An object with resolved `serverUrl`, `project`, `environment`, and optionally `apiKey`.
 *
 * @throws RuntimeError with code `INVALID_CONFIG` when `requiresTarget` is true and no server URL can be resolved.
 * @throws RuntimeError with code `MISSING_TARGET` when `requiresTarget` is true and either project or environment (or both) cannot be resolved; the error message describes how to supply the missing values.
 */
export async function resolveExecutionContext(input: {
  global: CliGlobalOptions;
  env: NodeJS.ProcessEnv;
  config: CliConfig;
  resolveStoredApiKey?: ResolveStoredApiKey;
  requiresTarget: boolean;
}): Promise<{
  serverUrl: string;
  project: string;
  environment: string;
  apiKey?: string;
}> {
  const envServerUrl = parseOptionalValue(input.env.MDCMS_SERVER_URL, "env");
  const envProject = parseOptionalValue(input.env.MDCMS_PROJECT, "env");
  const envEnvironment = parseOptionalValue(input.env.MDCMS_ENVIRONMENT, "env");
  const envApiKey = parseOptionalValue(input.env.MDCMS_API_KEY, "env");
  const serverUrl =
    input.global.serverUrl ?? envServerUrl ?? input.config.serverUrl;

  if (!serverUrl && input.requiresTarget) {
    throw new RuntimeError({
      code: "INVALID_CONFIG",
      message:
        "Missing server URL. Provide --server-url, MDCMS_SERVER_URL, or config.serverUrl.",
      statusCode: 400,
    });
  }

  const project = input.global.project ?? envProject ?? input.config.project;
  const environment =
    input.global.environment ?? envEnvironment ?? input.config.environment;

  if (input.requiresTarget && (!project || !environment)) {
    const missing =
      !project && !environment
        ? "project and environment"
        : !project
          ? "project"
          : "environment";
    throw new RuntimeError({
      code: "MISSING_TARGET",
      message:
        `Missing ${missing}. Provide via:\n` +
        `  - CLI flags: --project <slug> --environment <name>\n` +
        `  - Env vars: MDCMS_PROJECT / MDCMS_ENVIRONMENT\n` +
        `  - Config:   project / environment fields in mdcms.config.ts`,
      statusCode: 400,
    });
  }

  const resolvedProject = project ?? "";
  const resolvedEnvironment = environment ?? "";
  const storedApiKey =
    input.resolveStoredApiKey && resolvedProject && resolvedEnvironment
      ? await input.resolveStoredApiKey({
          serverUrl,
          project: resolvedProject,
          environment: resolvedEnvironment,
        })
      : undefined;
  const apiKey = input.global.apiKey ?? envApiKey ?? storedApiKey;

  return {
    serverUrl,
    project: resolvedProject,
    environment: resolvedEnvironment,
    apiKey,
  };
}

function renderHelp(commands: readonly CliCommand[]): string {
  const commandLines =
    commands.length === 0
      ? "  (no commands registered)"
      : commands
          .map(
            (command) => `  ${command.name.padEnd(16)} ${command.description}`,
          )
          .join("\n");

  return [
    "Usage: mdcms <command> [options]",
    "",
    "Global options:",
    "  --project <slug>       Override target project",
    "  --environment <name>   Override target environment",
    "  --api-key <token>      API key for headless/CI auth",
    "  --config <path>        Config file path (default: mdcms.config.ts)",
    "  --server-url <url>     Override server URL",
    "  -h, --help             Show help",
    "",
    "Commands:",
    commandLines,
    "",
  ].join("\n");
}

function writeCliError(stderr: Writer, error: unknown): void {
  const envelope = formatCliErrorEnvelope(error);
  stderr.write(`${envelope.code}: ${envelope.message}\n`);
}

/**
 * Prompts the user to confirm an action with a Yes/No choice.
 *
 * @returns `true` if the user selects Yes, `false` if the user selects No or when stdin is not a TTY.
 */
async function defaultConfirmPrompt(message: string): Promise<boolean> {
  if (!processStdin.isTTY) {
    return false;
  }

  return select({
    message,
    choices: [
      { name: "Yes", value: true },
      { name: "No", value: false },
    ],
  });
}

/**
 * Prompts the user to select multiple choices from a labeled list.
 *
 * If the process stdin is not a TTY, returns an empty array without prompting.
 *
 * @param message - The prompt message displayed to the user
 * @param choices - Array of choices where `label` is shown to the user and `value` is returned when selected
 * @returns An array of selected choice values (empty if none selected or when stdin is not a TTY)
 */
async function defaultMultiSelectPrompt<T extends string>(
  message: string,
  choices: Array<{ label: string; value: T }>,
): Promise<T[]> {
  if (!processStdin.isTTY) {
    return [];
  }

  return checkbox({
    message,
    choices: choices.map((c) => ({ name: c.label, value: c.value })),
  });
}

/**
 * Runs each preflight hook in order, awaiting each before proceeding.
 *
 * Executes the provided hooks sequentially with the given `context`. If a hook throws a `RuntimeError`, it is rethrown unchanged. If a hook throws any other error, this function throws a `RuntimeError` with code `CLI_PREFLIGHT_FAILED`, status code `500`, and `details` containing the failing `hookId` and, when available, the original error `cause` message.
 *
 * @param hooks - Array of preflight hooks to run, invoked in sequence.
 * @param context - Input passed to each hook, containing `actionId` and arbitrary `input`.
 */
async function runPreflightHooks(
  hooks: readonly CliPreflightHook[],
  context: { actionId: string; input: unknown },
): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook.run(context);
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw error;
      }

      throw new RuntimeError({
        code: "CLI_PREFLIGHT_FAILED",
        message: `Preflight hook "${hook.id}" failed.`,
        statusCode: 500,
        details:
          error instanceof Error
            ? {
                hookId: hook.id,
                cause: error.message,
              }
            : {
                hookId: hook.id,
              },
      });
    }
  }
}

/**
 * Parse CLI arguments, resolve runtime/config/target, run preflight hooks, and execute the selected command.
 *
 * @param argv - The command-line arguments to parse (typically process.argv.slice(2)).
 * @param options - Optional dependency-injection overrides and runtime options used by the CLI.
 * @returns The process exit code: `0` on success, `1` for CLI-level errors or invalid usage, or another numeric code returned by the executed command.
 */
export async function runMdcmsCli(
  argv: string[],
  options: RunMdcmsCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const commands = options.commands ?? DEFAULT_COMMANDS;
  const fetcher = options.fetcher ?? fetch;
  const confirm = options.confirm ?? defaultConfirmPrompt;
  const multiSelect = options.multiSelect ?? defaultMultiSelectPrompt;
  const runtimeWithModules =
    options.runtimeWithModules ?? createCliRuntimeContextWithModules(env);
  const credentialStore =
    options.credentialStore ??
    createCredentialStore({
      env,
    });
  const resolveStoredApiKey =
    options.resolveStoredApiKey ??
    (async (input) => {
      const profile = await credentialStore.getProfile(input);
      return profile?.apiKey;
    });
  const registry = createCommandRegistry(commands);
  const invocation = parseCliInvocation(argv);

  if (invocation.global.help) {
    stdout.write(renderHelp(commands));
    return 0;
  }

  if (!invocation.commandName) {
    stderr.write("INVALID_USAGE: Missing command.\n\n");
    stderr.write(renderHelp(commands));
    return 1;
  }

  const multiWordName =
    invocation.commandArgs.length > 0
      ? `${invocation.commandName} ${invocation.commandArgs[0]}`
      : undefined;

  let command = multiWordName ? registry.get(multiWordName) : undefined;
  let commandArgs = command
    ? invocation.commandArgs.slice(1)
    : invocation.commandArgs;

  if (!command) {
    command = registry.get(invocation.commandName);
  }

  if (!command) {
    const displayName =
      multiWordName && !registry.has(invocation.commandName!)
        ? multiWordName
        : invocation.commandName;
    stderr.write(`INVALID_USAGE: Unknown command "${displayName}".\n\n`);
    stderr.write(renderHelp(commands));
    return 1;
  }

  try {
    const loadConfig = options.loadConfig ?? loadCliConfig;
    let config: CliConfig = {
      serverUrl: "",
      project: "",
      environment: "",
    };
    let configPath = resolve(
      cwd,
      invocation.global.configPath ?? "mdcms.config.ts",
    );

    try {
      const loaded = await loadConfig({
        cwd,
        configPath: invocation.global.configPath,
      });
      config = loaded.config;
      configPath = loaded.configPath;
    } catch (error) {
      const canProceedWithoutConfig =
        command.requiresConfig === false &&
        invocation.global.configPath === undefined &&
        error instanceof RuntimeError &&
        error.code === "CONFIG_NOT_FOUND";

      if (!canProceedWithoutConfig) {
        throw error;
      }
    }

    const resolved = await resolveExecutionContext({
      global: invocation.global,
      env,
      config,
      resolveStoredApiKey,
      requiresTarget: command.requiresTarget !== false,
    });

    await runPreflightHooks(runtimeWithModules.preflightHooks, {
      actionId: command.name,
      input: {
        commandName: command.name,
        args: commandArgs,
        target: {
          project: resolved.project,
          environment: resolved.environment,
        },
      },
    });

    const result = await command.run({
      runtime: runtimeWithModules,
      cwd,
      env,
      config,
      configPath,
      serverUrl: resolved.serverUrl,
      project: resolved.project,
      environment: resolved.environment,
      apiKey: resolved.apiKey,
      args: commandArgs,
      fetcher,
      confirm,
      multiSelect,
      stdout,
      stderr,
    });

    return typeof result === "number" ? result : 0;
  } catch (error) {
    writeCliError(stderr, error);
    return 1;
  }
}
