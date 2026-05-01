import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import {
  createAiOrchestrator,
  getOrchestratorFailureAudit,
  getOrchestratorFailureRuntimeError,
  OrchestratorFailure,
  type AiOrchestrationInput,
} from "./orchestrator.js";
import {
  createEchoAiProvider,
  ECHO_PROVIDER_DEFAULT_MODEL,
  ECHO_PROVIDER_ID,
} from "./providers/echo.js";
import { createNullAiProvider } from "./providers/null.js";

const baseInput: AiOrchestrationInput = {
  taskKind: "copy_improvement",
  envelope: {
    project: "demo",
    environment: "draft",
    type: "page",
    locale: "en",
    documentId: "doc_1",
    baseDraftRevision: 4,
  },
  input: {
    locale: "en",
    selectionText: "Hello world",
    instruction: "make it punchier",
  },
};

const fixedClock = () => new Date("2026-05-01T00:00:00.000Z");

let nextProposalId = 0;
const idFactory = () => {
  nextProposalId += 1;
  return `prop_${nextProposalId}`;
};

function resetIds(): void {
  nextProposalId = 0;
}

function buildEchoOutput(): string {
  return JSON.stringify({
    summary: "Tightened intro",
    operations: [
      {
        op: "replace_selection",
        selectionId: "sel_1",
        originalText: "Hello world",
        replacementText: "Hi.",
      },
    ],
  });
}

describe("createAiOrchestrator", () => {
  test("provider success → proposals and succeeded audit", async () => {
    resetIds();
    const provider = createEchoAiProvider({
      respond: () => buildEchoOutput(),
      usage: { promptTokens: 12, completionTokens: 6 },
    });
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    const result = await orchestrator.runTask(baseInput);

    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0]?.kind, "replace_selection");
    assert.equal(result.proposals[0]?.proposalId, "prop_1");
    assert.equal(result.proposals[0]?.provider.providerId, ECHO_PROVIDER_ID);
    assert.equal(
      result.proposals[0]?.provider.model,
      ECHO_PROVIDER_DEFAULT_MODEL,
    );

    assert.equal(result.audit.outcome, "succeeded");
    assert.equal(result.audit.providerId, ECHO_PROVIDER_ID);
    assert.equal(result.audit.model, ECHO_PROVIDER_DEFAULT_MODEL);
    assert.deepEqual(result.audit.proposalIds, ["prop_1"]);
    assert.deepEqual(result.audit.usage, {
      promptTokens: 12,
      completionTokens: 6,
    });
  });

  test("provider failure → AI_PROVIDER_UNAVAILABLE with provider_error audit", async () => {
    const provider = createEchoAiProvider({
      throwOnComplete: new Error("network down"),
    });
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    try {
      await orchestrator.runTask(baseInput);
      assert.fail("expected throw");
    } catch (error) {
      const runtime = getOrchestratorFailureRuntimeError(error);
      const audit = getOrchestratorFailureAudit(error);
      assert.ok(error instanceof OrchestratorFailure);
      assert.ok(runtime instanceof RuntimeError);
      assert.equal(runtime?.code, "AI_PROVIDER_UNAVAILABLE");
      assert.equal(audit?.outcome, "provider_error");
      assert.equal(audit?.errorCode, "AI_PROVIDER_UNAVAILABLE");
      assert.equal(audit?.providerId, ECHO_PROVIDER_ID);
    }
  });

  test("disabled AI → AI_DISABLED with provider_error audit", async () => {
    const provider = createNullAiProvider();
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    try {
      await orchestrator.runTask(baseInput);
      assert.fail("expected throw");
    } catch (error) {
      const runtime = getOrchestratorFailureRuntimeError(error);
      const audit = getOrchestratorFailureAudit(error);
      assert.equal(runtime?.code, "AI_DISABLED");
      assert.equal(audit?.outcome, "provider_error");
      assert.equal(audit?.errorCode, "AI_DISABLED");
    }
  });

  test("invalid model output → AI_OUTPUT_INVALID with invalid_output audit", async () => {
    const provider = createEchoAiProvider({
      respond: () => "not json at all",
    });
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    try {
      await orchestrator.runTask(baseInput);
      assert.fail("expected throw");
    } catch (error) {
      const runtime = getOrchestratorFailureRuntimeError(error);
      const audit = getOrchestratorFailureAudit(error);
      assert.equal(runtime?.code, "AI_OUTPUT_INVALID");
      assert.equal(audit?.outcome, "invalid_output");
      assert.equal(audit?.validation.status, "invalid");
    }
  });

  test("model output failing schema → AI_OUTPUT_INVALID", async () => {
    const provider = createEchoAiProvider({
      respond: () =>
        JSON.stringify({
          summary: "ok",
          operations: [
            {
              op: "create_document",
              path: "x.md",
              format: "md",
              frontmatter: {},
              body: "x",
            },
          ],
        }),
    });
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    // copy_improvement only allows replace_selection ops
    await assert.rejects(
      () => orchestrator.runTask(baseInput),
      (error) => {
        const runtime = getOrchestratorFailureRuntimeError(error);
        return runtime?.code === "AI_OUTPUT_INVALID";
      },
    );
  });

  test("rejects task input that fails task schema", async () => {
    const provider = createEchoAiProvider({
      respond: () => buildEchoOutput(),
    });
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    await assert.rejects(
      () =>
        orchestrator.runTask({
          ...baseInput,
          input: { locale: "en" /* missing selectionText */ },
        }),
      (error) => {
        const runtime = getOrchestratorFailureRuntimeError(error);
        return runtime?.code === "AI_OUTPUT_INVALID" || runtime === undefined;
      },
    );
  });

  test("unknown task kind → AI_UNSUPPORTED_TASK", async () => {
    const provider = createEchoAiProvider({
      respond: () => buildEchoOutput(),
    });
    const orchestrator = createAiOrchestrator({
      provider,
      clock: fixedClock,
      idFactory,
    });

    await assert.rejects(
      () =>
        orchestrator.runTask({
          ...baseInput,
          taskKind: "unknown_task" as never,
        }),
      (error) =>
        error instanceof RuntimeError && error.code === "AI_UNSUPPORTED_TASK",
    );
  });
});
