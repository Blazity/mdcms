import { RuntimeError } from "./error.js";
import type { LogLevel } from "./logger.js";
import { z } from "zod";

export type NodeEnv = "development" | "test" | "production";

/**
 * CoreEnv contains the common runtime env shape shared across packages.
 */
export type CoreEnv = {
  NODE_ENV: NodeEnv;
  LOG_LEVEL: LogLevel;
  APP_VERSION: string;
};

/**
 * DatabaseEnv defines the baseline database configuration used by
 * server-side persistence adapters.
 */
export type DatabaseEnv = {
  DATABASE_URL: string;
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
const NonEmptyEnvStringSchema = z.string().trim().min(1);
const CoreEnvSchema = z.object({
  NODE_ENV: NonEmptyEnvStringSchema.pipe(z.enum(NODE_ENV_VALUES))
    .optional()
    .default("development"),
  LOG_LEVEL: NonEmptyEnvStringSchema.pipe(z.enum(LOG_LEVEL_VALUES))
    .optional()
    .default("info"),
  APP_VERSION: z
    .string()
    .optional()
    .transform((value) => value?.trim() || "0.0.0"),
});
const DatabaseEnvSchema = z.object({
  DATABASE_URL: NonEmptyEnvStringSchema,
});

function throwInvalidEnvError(
  key: string,
  value: unknown,
  message: string,
): never {
  throw new RuntimeError({
    code: "INVALID_ENV",
    message,
    details: {
      key,
      value,
    },
  });
}

/**
 * parseDatabaseEnv validates baseline database settings for server packages.
 */
export function parseDatabaseEnv(rawEnv: NodeJS.ProcessEnv): DatabaseEnv {
  const parsed = DatabaseEnvSchema.safeParse(rawEnv);

  if (parsed.success) {
    return parsed.data;
  }

  return throwInvalidEnvError(
    "DATABASE_URL",
    rawEnv.DATABASE_URL,
    "DATABASE_URL must be set to run database-backed workflows.",
  );
}

/**
 * parseCoreEnv validates and normalizes the shared runtime env values used
 * by server and runtime adapters.
 */
export function parseCoreEnv(rawEnv: NodeJS.ProcessEnv): CoreEnv {
  const parsed = CoreEnvSchema.safeParse(rawEnv);

  if (parsed.success) {
    return parsed.data;
  }

  const issue = parsed.error.issues[0];
  const key = issue?.path[0];

  if (key === "LOG_LEVEL") {
    return throwInvalidEnvError(
      "LOG_LEVEL",
      rawEnv.LOG_LEVEL,
      "LOG_LEVEL must be trace, debug, info, warn, error, or fatal.",
    );
  }

  return throwInvalidEnvError(
    "NODE_ENV",
    rawEnv.NODE_ENV,
    "NODE_ENV must be development, test, or production.",
  );
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
