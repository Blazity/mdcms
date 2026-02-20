import {
  createConsoleLogger,
  extendEnv,
  parseCoreEnv,
  serializeError,
  type CoreEnv,
  type ErrorEnvelope,
  type Logger,
} from "@mdcms/shared";

/**
 * CLI runtime helpers keep environment parsing, logging setup, and error
 * envelopes aligned with server and studio contracts.
 */
export type CliEnv = CoreEnv & {
  CLI_NAME: string;
};

export type CliRuntimeContext = {
  env: CliEnv;
  logger: Logger;
};

export function resolveCliEnv(rawEnv: NodeJS.ProcessEnv): CliEnv {
  const core = parseCoreEnv(rawEnv);

  return extendEnv(core, () => ({
    CLI_NAME: rawEnv.CLI_NAME?.trim() || "mdcms",
  }));
}

export function createCliRuntimeContext(
  rawEnv: NodeJS.ProcessEnv = process.env,
): CliRuntimeContext {
  const env = resolveCliEnv(rawEnv);
  const logger = createConsoleLogger({
    level: env.LOG_LEVEL,
    context: {
      runtime: "cli",
      cliName: env.CLI_NAME,
    },
  });

  return {
    env,
    logger,
  };
}

export function formatCliErrorEnvelope(
  error: unknown,
  requestId?: string,
): ErrorEnvelope {
  return serializeError(error, {
    requestId,
  });
}
