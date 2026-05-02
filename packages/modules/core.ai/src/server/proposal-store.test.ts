import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import { RuntimeError, type AiProposal } from "@mdcms/shared";

import { createInMemoryAiProposalStore } from "./proposal-store.js";

function buildProposal(overrides: Partial<AiProposal> = {}): AiProposal {
  return {
    proposalId: overrides.proposalId ?? "p_1",
    kind: overrides.kind ?? "replace_selection",
    project: overrides.project ?? "demo",
    environment: overrides.environment ?? "draft",
    type: overrides.type ?? "page",
    locale: overrides.locale ?? "en",
    summary: overrides.summary ?? "Tightened intro.",
    operations: overrides.operations ?? [
      {
        op: "replace_selection",
        selectionId: "sel_1",
        originalText: "Hello world",
        replacementText: "Hi.",
      },
    ],
    validation: overrides.validation ?? { status: "valid" },
    expiresAt: overrides.expiresAt ?? "2026-05-01T00:05:00.000Z",
    provider: overrides.provider ?? {
      providerId: "echo",
      model: "echo-1",
      promptTemplateId: "copy_improvement.v1",
    },
    ...(overrides.documentId ? { documentId: overrides.documentId } : {}),
    ...(overrides.baseDraftRevision !== undefined
      ? { baseDraftRevision: overrides.baseDraftRevision }
      : {}),
  };
}

describe("createInMemoryAiProposalStore", () => {
  test("inserts and observes pending proposals before expiry", () => {
    const clock = () => new Date("2026-05-01T00:00:00.000Z");
    const store = createInMemoryAiProposalStore({ clock });
    const proposal = buildProposal();

    const inserted = store.insert({ proposal, actorId: "user_1" });

    assert.equal(inserted.status, "pending");
    assert.equal(inserted.createdByActorId, "user_1");
    assert.deepEqual(store.observe("p_1")?.proposal, proposal);
  });

  test("observe transitions an expired proposal to expired", () => {
    let now = new Date("2026-05-01T00:00:00.000Z");
    const store = createInMemoryAiProposalStore({ clock: () => now });
    store.insert({
      proposal: buildProposal({
        expiresAt: "2026-05-01T00:01:00.000Z",
      }),
      actorId: "user_1",
    });

    now = new Date("2026-05-01T00:02:00.000Z");
    const observed = store.observe("p_1");

    assert.equal(observed?.status, "expired");
    assert.equal(typeof observed?.resolvedAt, "string");
  });

  test("markAccepted moves pending proposal to accepted", () => {
    const store = createInMemoryAiProposalStore();
    store.insert({ proposal: buildProposal(), actorId: "user_1" });

    const accepted = store.markAccepted({
      proposalId: "p_1",
      actorId: "user_42",
    });

    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.resolvedByActorId, "user_42");
  });

  test("markAccepted on missing proposal raises NOT_FOUND", () => {
    const store = createInMemoryAiProposalStore();

    assert.throws(
      () => store.markAccepted({ proposalId: "missing", actorId: "user_1" }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "NOT_FOUND" &&
        error.statusCode === 404,
    );
  });

  test("markRejected after acceptance raises AI_PROPOSAL_CONFLICT", () => {
    const store = createInMemoryAiProposalStore();
    store.insert({ proposal: buildProposal(), actorId: "user_1" });
    store.markAccepted({ proposalId: "p_1", actorId: "user_1" });

    assert.throws(
      () => store.markRejected({ proposalId: "p_1", actorId: "user_1" }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "AI_PROPOSAL_CONFLICT" &&
        error.statusCode === 409,
    );
  });

  test("apply on expired proposal raises AI_PROPOSAL_EXPIRED", () => {
    let now = new Date("2026-05-01T00:00:00.000Z");
    const store = createInMemoryAiProposalStore({ clock: () => now });
    store.insert({
      proposal: buildProposal({
        expiresAt: "2026-05-01T00:00:30.000Z",
      }),
      actorId: "user_1",
    });

    now = new Date("2026-05-01T00:01:00.000Z");
    store.observe("p_1");

    assert.throws(
      () => store.markAccepted({ proposalId: "p_1", actorId: "user_1" }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "AI_PROPOSAL_EXPIRED" &&
        error.statusCode === 410,
    );
  });
});
