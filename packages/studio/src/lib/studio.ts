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
 * Studio runtime helpers align env resolution, logger setup, and error
 * envelope formatting with the shared runtime contracts.
 */
export type StudioEnv = CoreEnv & {
  STUDIO_NAME: string;
};

export type StudioRuntimeContext = {
  env: StudioEnv;
  logger: Logger;
};

export function resolveStudioEnv(rawEnv: NodeJS.ProcessEnv): StudioEnv {
  const core = parseCoreEnv(rawEnv);

  return extendEnv(core, () => ({
    STUDIO_NAME: rawEnv.STUDIO_NAME?.trim() || "studio",
  }));
}

export function createStudioRuntimeContext(
  rawEnv: NodeJS.ProcessEnv = process.env,
): StudioRuntimeContext {
  const env = resolveStudioEnv(rawEnv);
  const logger = createConsoleLogger({
    level: env.LOG_LEVEL,
    context: {
      runtime: "studio",
      studioName: env.STUDIO_NAME,
    },
  });

  return {
    env,
    logger,
  };
}

export function formatStudioErrorEnvelope(
  error: unknown,
  requestId?: string,
): ErrorEnvelope {
  return serializeError(error, {
    requestId,
  });
}
