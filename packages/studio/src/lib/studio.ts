import {
  createNamedRuntimeContext,
  formatRuntimeErrorEnvelope,
  resolveNamedRuntimeEnv,
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
