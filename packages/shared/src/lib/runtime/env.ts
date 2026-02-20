import { RuntimeError } from "./error.js";
import type { LogLevel } from "./logger.js";

export type NodeEnv = "development" | "test" | "production";

/**
 * CoreEnv contains the common runtime env shape shared across packages.
 */
export type CoreEnv = {
  NODE_ENV: NodeEnv;
  LOG_LEVEL: LogLevel;
  APP_VERSION: string;
};

const NODE_ENV_VALUES: NodeEnv[] = ["development", "test", "production"];
const LOG_LEVEL_VALUES: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

function parseNodeEnv(value: string | undefined): NodeEnv {
  const resolvedValue = value ?? "development";

  if (NODE_ENV_VALUES.includes(resolvedValue as NodeEnv)) {
    return resolvedValue as NodeEnv;
  }

  throw new RuntimeError({
    code: "INVALID_ENV",
    message: "NODE_ENV must be development, test, or production.",
    details: {
      key: "NODE_ENV",
      value: resolvedValue,
    },
  });
}

function parseLogLevel(value: string | undefined): LogLevel {
  const resolvedValue = value ?? "info";

  if (LOG_LEVEL_VALUES.includes(resolvedValue as LogLevel)) {
    return resolvedValue as LogLevel;
  }

  throw new RuntimeError({
    code: "INVALID_ENV",
    message: "LOG_LEVEL must be trace, debug, info, warn, error, or fatal.",
    details: {
      key: "LOG_LEVEL",
      value: resolvedValue,
    },
  });
}

/**
 * parseCoreEnv validates and normalizes the shared runtime env values used
 * by server and runtime adapters.
 */
export function parseCoreEnv(rawEnv: NodeJS.ProcessEnv): CoreEnv {
  return {
    NODE_ENV: parseNodeEnv(rawEnv.NODE_ENV),
    LOG_LEVEL: parseLogLevel(rawEnv.LOG_LEVEL),
    APP_VERSION: rawEnv.APP_VERSION?.trim() || "0.0.0",
  };
}

/**
 * extendEnv composes package-specific env extensions on top of the validated
 * shared CoreEnv contract.
 */
export function extendEnv<T extends Record<string, unknown>>(
  coreEnv: CoreEnv,
  extensionFactory: () => T,
): CoreEnv & T {
  return {
    ...coreEnv,
    ...extensionFactory(),
  };
}
