import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError } from "@mdcms/shared";

import {
  createStudioAiRouteApi,
  type StudioAiInlineTransformResult,
} from "./ai-route-api.js";

const config = {
  project: "demo",
  environment: "draft",
  serverUrl: "http://localhost:4000",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createStudioAiRouteApi", () => {
  test("inlineTransform sends target headers and unwraps proposals", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({
        data: {
          proposals: [
            {
              proposalId: "p_1",
              kind: "replace_selection",
              operations: [],
            },
          ],
        },
      });
    };

    const api = createStudioAiRouteApi(config, { fetcher });
    const result = (await api.inlineTransform({
      selectionId: "sel_1",
      selectedText: "Hello",
      action: "rewrite",
    })) as StudioAiInlineTransformResult;

    assert.equal(result.proposals.length, 1);
    assert.match(capturedUrl ?? "", /\/api\/v1\/ai\/inline-transform$/);
    const headers = new Headers(capturedInit?.headers ?? {});
    assert.equal(headers.get("x-mdcms-project"), "demo");
    assert.equal(headers.get("x-mdcms-environment"), "draft");
    const body = JSON.parse((capturedInit?.body as string) ?? "{}");
    assert.equal(body.action, "rewrite");
    assert.equal(body.selectionId, "sel_1");
  });

  test("inlineTransform translates non-2xx into RuntimeError", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse(
        {
          code: "AI_DISABLED",
          message: "AI is not configured.",
          statusCode: 403,
        },
        403,
      );

    const api = createStudioAiRouteApi(config, { fetcher });
    await assert.rejects(
      () =>
        api.inlineTransform({
          selectionId: "sel_1",
          selectedText: "Hello",
          action: "rewrite",
        }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "AI_DISABLED" &&
        error.statusCode === 403,
    );
  });

  test("applyProposal posts to the proposal id endpoint", async () => {
    let capturedUrl: string | undefined;
    const fetcher: typeof fetch = async (input) => {
      capturedUrl = String(input);
      return jsonResponse({
        data: {
          proposal: {
            proposalId: "p_1",
            kind: "replace_selection",
          },
          document: { documentId: "doc_1", body: "ok" },
        },
      });
    };

    const api = createStudioAiRouteApi(config, { fetcher });
    const result = await api.applyProposal({
      proposalId: "p_1",
      schemaHash: "h",
      draftRevision: 5,
    });

    assert.match(capturedUrl ?? "", /\/api\/v1\/ai\/proposals\/p_1\/apply$/);
    assert.equal(result.proposal.proposalId, "p_1");
    assert.equal(result.document.body, "ok");
  });

  test("applyProposal raises stable error on conflict", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse(
        {
          code: "AI_PROPOSAL_CONFLICT",
          message: "Stale revision.",
          statusCode: 409,
        },
        409,
      );

    const api = createStudioAiRouteApi(config, { fetcher });
    await assert.rejects(
      () =>
        api.applyProposal({
          proposalId: "p_1",
          schemaHash: "h",
        }),
      (error) =>
        error instanceof RuntimeError && error.code === "AI_PROPOSAL_CONFLICT",
    );
  });

  test("rejectProposal hits the reject endpoint", async () => {
    let capturedUrl: string | undefined;
    const fetcher: typeof fetch = async (input) => {
      capturedUrl = String(input);
      return jsonResponse({
        data: { proposal: { proposalId: "p_1", kind: "replace_selection" } },
      });
    };

    const api = createStudioAiRouteApi(config, { fetcher });
    const result = await api.rejectProposal({ proposalId: "p_1" });
    assert.match(capturedUrl ?? "", /\/api\/v1\/ai\/proposals\/p_1\/reject$/);
    assert.equal(result.proposal.proposalId, "p_1");
  });
});
