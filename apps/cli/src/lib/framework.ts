import { stdin as processStdin, stdout as processStdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { RuntimeError } from "@mdcms/shared";

import { formatCliErrorEnvelope } from "./cli.js";
import { type CliConfig, loadCliConfig } from "./config.js";
import { createPullCommand } from "./pull.js";

export type Writer = {
  write: (chunk: string) => unknown;
};

type ConfirmPrompt = (message: string) => Promise<boolean>;

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
  stdout: Writer;
  stderr: Writer;
};

export type CliCommand = {
  name: string;
  description: string;
  requiresTarget?: boolean;
  run: (context: CliCommandContext) => Promise<number | void> | number | void;
};

export type ResolveStoredApiKey = (input: {
  serverUrl: string;
  project: string;
  environment: string;
}) => Promise<string | undefined>;

export type RunMdcmsCliOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Writer;
  stderr?: Writer;
  commands?: CliCommand[];
  loadConfig?: typeof loadCliConfig;
  resolveStoredApiKey?: ResolveStoredApiKey;
  fetcher?: typeof fetch;
  confirm?: ConfirmPrompt;
};

const DEFAULT_COMMANDS: CliCommand[] = [createPullCommand()];

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

  if (!serverUrl) {
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
    throw new RuntimeError({
      code: "MISSING_TARGET",
      message:
        "Both project and environment are required. Provide --project/--environment, MDCMS_PROJECT/MDCMS_ENVIRONMENT, or config defaults.",
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

async function defaultConfirmPrompt(message: string): Promise<boolean> {
  if (!processStdin.isTTY) {
    return false;
  }

  const reader = createInterface({
    input: processStdin,
    output: processStdout,
  });

  try {
    const answer = await reader.question(`${message} [y/N] `);
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    reader.close();
  }
}

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

  const command = registry.get(invocation.commandName);

  if (!command) {
    stderr.write(
      `INVALID_USAGE: Unknown command "${invocation.commandName}".\n\n`,
    );
    stderr.write(renderHelp(commands));
    return 1;
  }

  try {
    const loadConfig = options.loadConfig ?? loadCliConfig;
    const { config, configPath } = await loadConfig({
      cwd,
      configPath: invocation.global.configPath,
    });
    const resolved = await resolveExecutionContext({
      global: invocation.global,
      env,
      config,
      resolveStoredApiKey: options.resolveStoredApiKey,
      requiresTarget: command.requiresTarget !== false,
    });

    const result = await command.run({
      cwd,
      env,
      config,
      configPath,
      serverUrl: resolved.serverUrl,
      project: resolved.project,
      environment: resolved.environment,
      apiKey: resolved.apiKey,
      args: invocation.commandArgs,
      fetcher,
      confirm,
      stdout,
      stderr,
    });

    return typeof result === "number" ? result : 0;
  } catch (error) {
    writeCliError(stderr, error);
    return 1;
  }
}
