import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  buildChatTools,
  type ChatToolDeps,
  type FindEntriesResult,
  type GetEntryResult,
} from "./chat-tools.js";
import type { AiProposal } from "@mdcms/shared";

function baseDeps(overrides: Partial<ChatToolDeps> = {}): ChatToolDeps {
  return {
    envelope: {
      project: "p",
      environment: "e",
      type: "page",
      locale: "en",
    },
    hasActiveDocument: false,
    activeDocumentHasPublishedVersion: false,
    providerId: "echo",
    model: "echo-1",
    clock: () => new Date("2026-05-16T00:00:00.000Z"),
    idFactory: (() => {
      let n = 0;
      return () => `prop_${++n}`;
    })(),
    ttlMs: 5 * 60 * 1000,
    capabilities: {
      canEditDocument: false,
      canCreateDocument: false,
      canDeleteDocument: false,
      canReadEntries: false,
    },
    collected: [] as AiProposal[],
    registeredTypeIds: ["author", "post"],
    supportedLocales: ["en", "pl"],
    ...overrides,
  };
}

describe("find_entries tool", () => {
  test("is registered when caller has read capability and backend present", () => {
    const tools = buildChatTools(
      baseDeps({
        capabilities: {
          canEditDocument: false,
          canCreateDocument: false,
          canDeleteDocument: false,
          canReadEntries: true,
        },
        findEntriesBackend: async () => ({ matches: [], total: 0 }),
      }),
    );
    assert.ok(tools.find_entries, "find_entries tool should be registered");
  });

  test("is NOT registered when read capability is absent", () => {
    const tools = buildChatTools(
      baseDeps({
        findEntriesBackend: async () => ({ matches: [], total: 0 }),
      }),
    );
    assert.equal(tools.find_entries, undefined);
  });

  test("execute calls backend with model-supplied args and returns result", async () => {
    let captured: { type: string; query?: string; limit?: number } | undefined;
    const tools = buildChatTools(
      baseDeps({
        capabilities: {
          canEditDocument: false,
          canCreateDocument: false,
          canDeleteDocument: false,
          canReadEntries: true,
        },
        findEntriesBackend: async (input) => {
          captured = input;
          return {
            matches: [
              {
                documentId: "doc_1",
                path: "authors/john",
                type: "author",
                locale: "en",
                title: "John Doe",
                updatedAt: "2026-05-01T00:00:00.000Z",
                hasUnpublishedChanges: false,
              },
            ],
            total: 1,
          };
        },
      }),
    );
    const result = (await tools.find_entries!.execute!(
      { type: "author", query: "john", limit: 5 },
      { toolCallId: "tc_1", messages: [] },
    )) as FindEntriesResult;
    assert.deepEqual(captured, { type: "author", query: "john", limit: 5 });
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.documentId, "doc_1");
    assert.equal(result.total, 1);
  });

  test("returns structured error when backend throws", async () => {
    const tools = buildChatTools(
      baseDeps({
        capabilities: {
          canEditDocument: false,
          canCreateDocument: false,
          canDeleteDocument: false,
          canReadEntries: true,
        },
        findEntriesBackend: async () => {
          throw new Error("DB unreachable");
        },
      }),
    );
    const result = (await tools.find_entries!.execute!(
      { type: "author" },
      { toolCallId: "tc_1", messages: [] },
    )) as { queued: false; error: string };
    assert.equal(result.queued, false);
    assert.ok(result.error.includes("DB unreachable"));
  });
});

describe("get_entry tool", () => {
  test("is registered when caller has read capability and backend present", () => {
    const tools = buildChatTools(
      baseDeps({
        capabilities: {
          canEditDocument: false,
          canCreateDocument: false,
          canDeleteDocument: false,
          canReadEntries: true,
        },
        getEntryBackend: async () => undefined,
      }),
    );
    assert.ok(tools.get_entry);
  });

  test("returns the full document when backend resolves it", async () => {
    const tools = buildChatTools(
      baseDeps({
        capabilities: {
          canEditDocument: false,
          canCreateDocument: false,
          canDeleteDocument: false,
          canReadEntries: true,
        },
        getEntryBackend: async () => ({
          documentId: "doc_1",
          path: "blog/welcome",
          type: "post",
          locale: "en",
          draftRevision: 4,
          hasUnpublishedChanges: true,
          publishedVersion: null,
          frontmatter: { title: "Welcome" },
          body: "Body text",
        }),
      }),
    );
    const result = (await tools.get_entry!.execute!(
      { documentId: "doc_1" },
      { toolCallId: "tc_1", messages: [] },
    )) as { documentId: string; body: string };
    assert.equal(result.documentId, "doc_1");
    assert.equal(result.body, "Body text");
  });

  test("returns NOT_FOUND structured error when backend returns undefined", async () => {
    const tools = buildChatTools(
      baseDeps({
        capabilities: {
          canEditDocument: false,
          canCreateDocument: false,
          canDeleteDocument: false,
          canReadEntries: true,
        },
        getEntryBackend: async () => undefined,
      }),
    );
    const result = (await tools.get_entry!.execute!(
      { documentId: "missing" },
      { toolCallId: "tc_1", messages: [] },
    )) as { queued: false; error: string };
    assert.equal(result.queued, false);
    assert.ok(result.error.toLowerCase().includes("not found"));
  });
});
