import { createProcessHealthPayload, type HealthzPayload } from "@mdcms/shared";

import type { ServerEnv } from "./env.js";

/**
 * createHealthzPayload returns process-only health metadata for CMS-2.
 */
export function createHealthzPayload(
  env: ServerEnv,
  startedAtMs: number,
  now?: Date,
): HealthzPayload {
  return createProcessHealthPayload({
    service: env.SERVICE_NAME,
    version: env.APP_VERSION,
    startedAtMs,
    now,
  });
}
