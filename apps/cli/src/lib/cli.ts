import {
  createCliConsoleSink,
  createConsoleLogger,
  createNamedRuntimeContext,
  formatRuntimeErrorEnvelope,
  resolveNamedRuntimeEnv,
  type CoreEnv,
  type ErrorEnvelope,
  type RuntimeContext,
} from "@mdcms/shared";

/**
 * CLI runtime helpers keep environment parsing, logging setup, and error
 * envelopes aligned with server and studio contracts.
 */
export type CliEnv = CoreEnv & {
  CLI_NAME: string;
};

export type CliRuntimeContext = RuntimeContext<CliEnv>;

export function resolveCliEnv(rawEnv: NodeJS.ProcessEnv): CliEnv {
  return resolveNamedRuntimeEnv(rawEnv, ({ rawEnv: sourceEnv }) => ({
    CLI_NAME: sourceEnv.CLI_NAME?.trim() || "mdcms",
  }));
}

export type CreateCliRuntimeContextOptions = {
  verbose?: boolean;
};

export function createCliRuntimeContext(
  rawEnv: NodeJS.ProcessEnv = process.env,
  options?: CreateCliRuntimeContextOptions,
): CliRuntimeContext {
  const verbose = options?.verbose ?? false;
  const hasExplicitLogLevel =
    rawEnv.LOG_LEVEL !== undefined && rawEnv.LOG_LEVEL.trim().length > 0;
  const effectiveEnv =
    verbose && !hasExplicitLogLevel
      ? { ...rawEnv, LOG_LEVEL: "debug" }
      : rawEnv;

  return createNamedRuntimeContext({
    rawEnv: effectiveEnv,
    resolveEnv: resolveCliEnv,
    loggerContext: (env) => ({
      runtime: "cli",
      cliName: env.CLI_NAME,
    }),
    createLogger: (opts) =>
      createConsoleLogger({
        ...opts,
        sink: createCliConsoleSink(),
      }),
  });
}

export function formatCliErrorEnvelope(
  error: unknown,
  requestId?: string,
): ErrorEnvelope {
  return formatRuntimeErrorEnvelope(error, requestId);
}
