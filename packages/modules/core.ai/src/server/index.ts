import type { ServerSurface } from "@mdcms/shared";

import {
  createAiOrchestrator,
  type AiOrchestrator,
  type AiOrchestratorDeps,
} from "./orchestrator.js";
import type { AiProviderFactoryDeps } from "./provider.js";
import { resolveAiProvider } from "./providers/factory.js";
import { mountAiRoutes, type MountAiRoutesOptions } from "./routes.js";

export type CreateAiOrchestratorFromEnvDeps = AiProviderFactoryDeps &
  Omit<AiOrchestratorDeps, "provider">;

/**
 * Convenience factory used by hosts (apps/server) to build an
 * orchestrator without re-implementing provider resolution.
 */
export function createAiOrchestratorFromEnv(
  deps: CreateAiOrchestratorFromEnvDeps,
): AiOrchestrator {
  const provider = resolveAiProvider({ env: deps.env });

  return createAiOrchestrator({
    provider,
    clock: deps.clock,
    idFactory: deps.idFactory,
    proposalTtlMs: deps.proposalTtlMs,
    proposalValidator: deps.proposalValidator,
  });
}

export type CoreAiServerDeps = MountAiRoutesOptions;

/**
 * Server surface for the AI module.
 *
 * The host (apps/server) supplies orchestrator + proposal store +
 * content/auth deps via the module deps map under the `ai` key. When
 * the deps are absent the surface mounts nothing, which matches the
 * foundation behavior shipped with CMS-223.
 */
export const coreAiServerSurface: ServerSurface<
  unknown,
  Record<string, unknown> & { ai?: CoreAiServerDeps }
> = {
  mount: (app, deps) => {
    const aiDeps = deps?.ai;

    if (!aiDeps) {
      return;
    }

    mountAiRoutes(app, aiDeps);
  },
  actions: [],
};
