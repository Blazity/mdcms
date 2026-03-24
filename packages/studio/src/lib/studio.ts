import {
  createNamedRuntimeContext,
  formatRuntimeErrorEnvelope,
  resolveNamedRuntimeEnv,
  type MdcmsConfig as SharedMdcmsConfig,
  type CoreEnv,
  type ErrorEnvelope,
  type RuntimeContext,
} from "@mdcms/shared";

/**
 * Studio runtime helpers align env resolution, logger setup, and error
 * envelope formatting with the shared runtime contracts.
 */
export type StudioEnv = CoreEnv & {
  STUDIO_NAME: string;
};

export type StudioRuntimeContext = RuntimeContext<StudioEnv>;

export type StudioEmbedConfig = {
  project: string;
  environment: string;
  serverUrl: string;
};

export type MdcmsConfig = SharedMdcmsConfig & {
  environment: string;
};

export function createStudioEmbedConfig(
  config: SharedMdcmsConfig,
): StudioEmbedConfig {
  if (!config.environment || config.environment.trim().length === 0) {
    throw new Error(
      "Studio embed config requires a non-empty environment string.",
    );
  }

  return {
    project: config.project,
    environment: config.environment,
    serverUrl: config.serverUrl,
  };
}

export function resolveStudioEnv(rawEnv: NodeJS.ProcessEnv): StudioEnv {
  return resolveNamedRuntimeEnv(rawEnv, ({ rawEnv: sourceEnv }) => ({
    STUDIO_NAME: sourceEnv.STUDIO_NAME?.trim() || "studio",
  }));
}

export function createStudioRuntimeContext(
  rawEnv: NodeJS.ProcessEnv = process.env,
): StudioRuntimeContext {
  return createNamedRuntimeContext({
    rawEnv,
    resolveEnv: resolveStudioEnv,
    loggerContext: (env) => ({
      runtime: "studio",
      studioName: env.STUDIO_NAME,
    }),
  });
}

export function formatStudioErrorEnvelope(
  error: unknown,
  requestId?: string,
): ErrorEnvelope {
  return formatRuntimeErrorEnvelope(error, requestId);
}
