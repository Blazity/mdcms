# CMS-223 — Studio AI provider and orchestration foundation

Status: in_progress
Owner spec: docs/specs/SPEC-014-ai-assisted-studio-editing.md
Created: 2026-05-01

## Spec delta

Implements the server-side foundation in SPEC-014 §"Provider and
Orchestration Requirements" and §"Structured Proposals". No HTTP endpoints,
no DB tables, no Studio UI in this ticket — those land in follow-up
tickets that consume the foundation through the endpoint-contract table
already in SPEC-014.

Affected acceptance criteria from the issue:

- Studio AI workflows can call a unified provider interface without
  coupling UI code to a provider SDK.
- Provider failures return deterministic errors.
- Orchestration emits structured proposals compatible with the
  AI-assisted Studio editing spec.
- Unit tests cover provider success, provider failure, disabled AI, and
  invalid model output.

## Architecture

A new first-party module: `packages/modules/core.ai/`. Module surface
exposes the orchestrator factory through future server actions; for this
ticket the surface mounts no routes — only the foundation is in place.
Cross-module contract types live in `@mdcms/shared` so callers (Studio
clients via SDK, future endpoints in apps/server) can import the same
shape without depending on the module's runtime.

Why a module and not `apps/server/src/lib/ai/`:

- Module pattern is the canonical extension point per
  `.ai/memory/architecture.md`.
- The endpoint contracts in SPEC-014 will be added as actions on this
  module's `server.actions[]` list once endpoints land.
- Provider credentials/state are server-only; modules' `server.mount()`
  receives the same `AppDeps` (logger, env) the rest of the server uses.

## Files

### packages/shared/src/lib/contracts/ai.ts (new)

Exports types + Zod schemas:

- `AiProposalKind` (`"replace_selection"` | `"insert_block"` |
  `"update_frontmatter"` | `"create_document"`).
- `AiProposalOperation` discriminated union (per SPEC-014).
- `AiProposalValidation` (`{ status: "valid" }` |
  `{ status: "invalid", errors: ... }`).
- `AiProposal` carrying spec fields plus `provider`/`model` metadata.
- `AiTaskKind` (`"copy_improvement"` | `"seo_improvement"` |
  `"mdx_component_insertion"` | `"current_document_edit"` |
  `"new_document_draft"`).
- `AI_ERROR_CODES` constant + `AiErrorCode` type (`"AI_DISABLED"`,
  `"AI_PROVIDER_UNAVAILABLE"`, `"AI_RATE_LIMITED"`,
  `"AI_CONTEXT_TOO_LARGE"`, `"AI_OUTPUT_INVALID"`,
  `"AI_UNSUPPORTED_TASK"`).
- Zod schemas: `aiProposalSchema`, `aiProposalOperationSchema`,
  `aiProposalValidationSchema`, plus `assertAiProposal()` helper that
  follows the `assertWithSchema` pattern from `extensibility.ts`.

### packages/shared/src/index.ts (modify)

Re-export the new ai contracts.

### packages/modules/core.ai/src/manifest.ts (new)

`{ id: "core.ai", version: "1.0.0", apiVersion: "1", kind: "core",
minCoreVersion: "0.0.0" }`.

### packages/modules/core.ai/src/server/provider.ts (new)

- `AiProviderRequest` — `{ taskKind, system, user, schema?,
  maxOutputTokens? }`.
- `AiProviderResponse` — `{ output: string, model: string,
  usage?: { promptTokens?, completionTokens?, costUsd? } }`.
- `AiProvider` — `{ readonly id: string; complete(request):
  Promise<AiProviderResponse> }`.
- `AiProviderFactoryDeps` — `{ env: Record<string,string|undefined>,
  fetch?: typeof fetch }` (fetch is injected so unit tests can supply a
  stub without real network).

### packages/modules/core.ai/src/server/providers/null.ts (new)

Provider that always throws `RuntimeError({ code: "AI_DISABLED",
statusCode: 403 })`. Used when no provider is configured.

### packages/modules/core.ai/src/server/providers/echo.ts (new)

Deterministic, in-memory provider for tests. Emits the user prompt back
as `output`. Optional constructor overrides for failure injection
(`{ throwOnComplete?: Error, output?: string, usage?: ... }`).

### packages/modules/core.ai/src/server/providers/factory.ts (new)

`resolveAiProvider(deps): AiProvider`:

- If `env.AI_PROVIDER` is missing or `"disabled"`, return null provider.
- If `env.AI_PROVIDER === "echo"`, return echo provider (used by tests
  + smoke).
- For real provider ids (e.g. `"anthropic"`, `"openai"`), this ticket
  throws `AI_PROVIDER_UNAVAILABLE` with a clear "not yet implemented"
  message — wiring the SDKs is a follow-up ticket. The factory shape is
  what unblocks downstream work.

### packages/modules/core.ai/src/server/errors.ts (new)

- `aiError(code, message, details?, statusCode?)` factory returning
  `RuntimeError`.
- `mapProviderError(error)`:
  - `RuntimeError` with `AI_*` code → passthrough.
  - Caught network/timeout error → `AI_PROVIDER_UNAVAILABLE` (503).
  - Anything else → `AI_PROVIDER_UNAVAILABLE` with a sanitized message
    (no provider response bodies, no env values).

### packages/modules/core.ai/src/server/tasks.ts (new)

`AiTaskDefinition` registry — one per `AiTaskKind`. Each entry holds:

- `kind: AiTaskKind`.
- `system: string` (template).
- `buildUserPrompt(input): string` (deterministic; no IO).
- `outputContract`: a Zod schema describing the expected JSON shape
  the model must return.

The registry is built once and frozen. Tests can iterate it.

### packages/modules/core.ai/src/server/proposal-builder.ts (new)

`buildProposalFromOutput({ taskKind, model, providerId,
parsedOutput, base }) → AiProposal`:

- Maps task-specific parsed output → `AiProposalOperation[]`.
- Embeds metadata: `proposalId` (random + deterministic for tests via
  injectable `idFactory`), `expiresAt` from injectable `clock`.
- Runs spec-required validation (`AiProposalValidation` is `valid` if
  the operations parse against `aiProposalOperationSchema`; otherwise
  `invalid` with the Zod issues).
- Output is parsed by `aiProposalSchema` before return; failure throws
  `AI_OUTPUT_INVALID`.

### packages/modules/core.ai/src/server/orchestrator.ts (new)

`createAiOrchestrator(deps): AiOrchestrator`:

- `deps`: `{ provider, clock, idFactory, logger }`.
- `runTask(input): Promise<AiOrchestrationResult>`:
  1. Resolve `AiTaskDefinition` by `kind`. Unknown → `AI_UNSUPPORTED_TASK`.
  2. Build provider request (system + user prompt + schema).
  3. `provider.complete(request)`. Errors → `mapProviderError`.
  4. Parse `response.output` against task's `outputContract`. Failure →
     `AI_OUTPUT_INVALID`.
  5. `buildProposalFromOutput` → `AiProposal[]`.
  6. Return `{ proposals, audit: buildAuditRecord(...) }` with model +
     usage metadata.

`AiOrchestrationResult`:

```ts
{
  proposals: AiProposal[];
  audit: AiAuditRecord;
}
```

### packages/modules/core.ai/src/server/audit.ts (new)

`AiAuditRecord` shape (no persistence in this ticket — caller is
responsible for sinking the record):

```ts
{
  taskKind: AiTaskKind;
  providerId: string;
  model: string;
  promptTemplateId: string;       // taskKind for v1
  validation: AiProposalValidation;
  usage?: { promptTokens?, completionTokens?, costUsd? };
  outcome: "succeeded" | "invalid_output" | "provider_error";
  errorCode?: AiErrorCode;
}
```

`buildAuditRecord(input, result)` produces the record for the caller.
Future tickets wire this into the audit pipeline.

### packages/modules/core.ai/src/server/index.ts (new)

`coreAiServerSurface: ServerSurface<unknown, Record<string, unknown>>`:

- `mount` is a no-op for this ticket. Future ticket adds AI routes here.
- `actions: []` for now.

Exports a `createAiOrchestratorFromEnv(deps)` helper for downstream
callers to use without re-implementing factory wiring.

### packages/modules/core.ai/src/index.ts (new)

Wires `manifest`, `server`, no `cli`. Exports `coreAiModule`.

### packages/modules/src/index.ts (modify)

Add `coreAiModule` to `localModules`. Sorted registry takes care of
ordering.

### packages/modules/src/index.test.ts (modify)

Add: `installedModules includes core.ai`.

## Tests

`packages/shared/src/lib/contracts/ai.test.ts`:
- Schema accepts each `AiProposalKind` shape.
- Schema rejects unknown kind, missing required fields, mistyped operations.

`packages/modules/core.ai/src/server/errors.test.ts`:
- `mapProviderError` passthroughs RuntimeError with `AI_*` code.
- Unknown error → `AI_PROVIDER_UNAVAILABLE`, sanitized message.

`packages/modules/core.ai/src/server/proposal-builder.test.ts`:
- Builds valid proposal for each task kind given a parsed output fixture.
- Throws `AI_OUTPUT_INVALID` for shapes that fail `aiProposalSchema`.

`packages/modules/core.ai/src/server/orchestrator.test.ts`:
- **provider success**: echo provider returns valid JSON for
  `copy_improvement` → orchestrator returns proposals + audit record
  with `outcome: "succeeded"`.
- **provider failure**: provider throws → orchestrator surfaces
  `AI_PROVIDER_UNAVAILABLE`, audit record `outcome: "provider_error"`.
- **disabled AI**: null provider → orchestrator surfaces `AI_DISABLED`,
  audit record `outcome: "provider_error"` with `errorCode:
  "AI_DISABLED"`.
- **invalid model output**: echo provider returns text that fails the
  task's output contract → `AI_OUTPUT_INVALID`, audit record
  `outcome: "invalid_output"`.
- Unknown `taskKind` → `AI_UNSUPPORTED_TASK`.
- Audit record always includes `providerId`, `model` (when known),
  `promptTemplateId`.

`packages/modules/core.ai/src/server/audit.test.ts`:
- `buildAuditRecord` echoes provider/model/usage/validation status.
- Drops undefined optionals.

## Verification

```bash
bun run --cwd packages/shared test
bun test --cwd packages/modules ./src
bun run format:check
bun run check
```

Smoke: `bun run --cwd packages/modules test ./core.ai/src`.

## Out of scope (deferred)

- HTTP routes for `/api/v1/ai/*` (separate ticket).
- Real provider SDK adapters (Anthropic, OpenAI) — separate ticket.
- DB tables for proposals + audit log — separate ticket.
- Studio UI changes — separate ticket.
- studio-review fixtures — `apps/studio-review` does not exist on this
  branch; nothing to mirror.
