import { extendEnv, parseCoreEnv, type CoreEnv } from "./env.js";
import { serializeError, type ErrorEnvelope } from "./error.js";
import { createConsoleLogger, type Logger } from "./logger.js";

export type RuntimeContext<TEnv extends CoreEnv = CoreEnv> = {
  env: TEnv;
  logger: Logger;
};

export function resolveNamedRuntimeEnv<T extends Record<string, unknown>>(
  rawEnv: NodeJS.ProcessEnv,
  extensionFactory: (input: {
    rawEnv: NodeJS.ProcessEnv;
    coreEnv: CoreEnv;
  }) => T,
): CoreEnv & T {
  const coreEnv = parseCoreEnv(rawEnv);

  return extendEnv(coreEnv, () =>
    extensionFactory({
      rawEnv,
      coreEnv,
    }),
  );
}

export type CreateNamedRuntimeContextOptions<TEnv extends CoreEnv> = {
  rawEnv?: NodeJS.ProcessEnv;
  resolveEnv: (rawEnv: NodeJS.ProcessEnv) => TEnv;
  loggerContext: (env: TEnv) => Record<string, unknown>;
  createLogger?: typeof createConsoleLogger;
};

export function createNamedRuntimeContext<TEnv extends CoreEnv>(
  options: CreateNamedRuntimeContextOptions<TEnv>,
): RuntimeContext<TEnv> {
  const rawEnv = options.rawEnv ?? process.env;
  const env = options.resolveEnv(rawEnv);
  const createLogger = options.createLogger ?? createConsoleLogger;
  const logger = createLogger({
    level: env.LOG_LEVEL,
    context: options.loggerContext(env),
  });

  return {
    env,
    logger,
  };
}

export function formatRuntimeErrorEnvelope(
  error: unknown,
  requestId?: string,
): ErrorEnvelope {
  return serializeError(error, {
    requestId,
  });
}
