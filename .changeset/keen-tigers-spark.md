---
"@mdcms/shared": minor
---

Add AI contract types and Zod schemas (AiProposal, AiProposalKind, AiProposalOperation, AiProposalValidation, AiTaskKind, AI_ERROR_CODES) consumed by the Studio AI provider and orchestration foundation. The orchestrator is built on the Vercel AI SDK, so future provider adapters (Anthropic, OpenAI) plug in through `@ai-sdk/*` packages without changing the public contract.
