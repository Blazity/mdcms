import type { ServerSurface } from "@mdcms/shared";

import {
  createAiOrchestrator,
  type AiOrchestrator,
  type AiOrchestratorDeps,
} from "./orchestrator.js";
import type { AiProviderFactoryDeps } from "./provider.js";
import { resolveAiProvider } from "./providers/factory.js";

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
  });
}

/**
 * Server surface for the AI module.
 *
 * The mount step is currently a no-op. The endpoint contracts in
 * SPEC-014 are added by follow-up tickets that consume the
 * orchestrator built above. Keeping the surface here lets future
 * tickets register `actions[]` without restructuring the module.
 */
export const coreAiServerSurface: ServerSurface<
  unknown,
  Record<string, unknown>
> = {
  mount: () => {
    /* foundation only — no routes registered in this ticket */
  },
  actions: [],
};
