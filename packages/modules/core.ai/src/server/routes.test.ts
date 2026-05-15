import assert from "node:assert/strict";
import { describe, test } from "bun:test";

import {
  RuntimeError,
  type AiProposal,
  type ContentDocumentResponse,
} from "@mdcms/shared";

import {
  mountAiRoutes,
  type AiAuditEmitter,
  type AiAuthorizer,
  type AiContentStore,
  type AiContextResolver,
  type AiCsrfProtector,
  type AiSchemaHashLookup,
  type MountAiRoutesOptions,
} from "./routes.js";
import {
  createInMemoryAiProposalStore,
  type AiProposalStore,
} from "./proposal-store.js";
import { createAiOrchestrator, type AiOrchestrator } from "./orchestrator.js";
import {
  createEchoAiProvider,
  type EchoStepResponse,
} from "./providers/echo.js";
import type { AiProposalValidator } from "./proposal-builder.js";
import type { AiAuditRecord } from "./audit.js";

type FakeRouteHandler = (ctx: {
  request: Request;
  params: Record<string, string>;
  body?: unknown;
}) => Promise<Response> | Response;

type FakeApp = {
  post: (path: string, handler: FakeRouteHandler) => FakeApp;
  fetch: (
    method: string,
    path: string,
    init?: RequestInit & { paramsOverride?: Record<string, string> },
  ) => Promise<Response>;
};

function createFakeApp(): FakeApp {
  const handlers = new Map<
    string,
    { template: string; handler: FakeRouteHandler }
  >();

  function pathToKey(method: string, template: string): string {
    return `${method} ${template}`;
  }

  function matchPath(
    template: string,
    pathname: string,
  ): Record<string, string> | undefined {
    const templateParts = template.split("/").filter((p) => p.length > 0);
    const pathParts = pathname.split("/").filter((p) => p.length > 0);

    if (templateParts.length !== pathParts.length) {
      return undefined;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < templateParts.length; i += 1) {
      const t = templateParts[i]!;
      const p = pathParts[i]!;

      if (t.startsWith(":")) {
        params[t.slice(1)] = p;
        continue;
      }

      if (t !== p) {
        return undefined;
      }
    }

    return params;
  }

  return {
    post(path, handler) {
      handlers.set(pathToKey("POST", path), { template: path, handler });
      return this;
    },
    async fetch(method, fullUrl, init) {
      const url = new URL(fullUrl);
      const request = new Request(fullUrl, init);

      for (const [, entry] of handlers) {
        const matched = matchPath(entry.template, url.pathname);
        if (!matched) {
          continue;
        }
        const result = await entry.handler({
          request,
          params: matched,
          body: init?.body
            ? typeof init.body === "string"
              ? init.body
              : undefined
            : undefined,
        });

        if (result instanceof Response) {
          return result;
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  };
}

function buildDocument(
  overrides: Partial<ContentDocumentResponse> = {},
): ContentDocumentResponse {
  return {
    documentId: "doc_1",
    translationGroupId: "tg_1",
    project: "demo",
    environment: "draft",
    path: "blog/welcome",
    type: "post",
    locale: "en",
    format: "md",
    isDeleted: false,
    hasUnpublishedChanges: true,
    version: 1,
    publishedVersion: null,
    draftRevision: 4,
    frontmatter: { title: "Welcome" },
    body: "Welcome to the site.",
    createdBy: "user_1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedBy: "user_1",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildEchoOutputForReplaceSelection(): string {
  return JSON.stringify({
    summary: "Tightened intro",
    operations: [
      {
        op: "replace_selection",
        selectionId: "sel_anchor",
        originalText: "Welcome to the site.",
        replacementText: "Hi there!",
      },
    ],
  });
}

function createTestSetup(input: {
  document?: ContentDocumentResponse;
  schemaHash?: string;
  authorize?: AiAuthorizer;
  emitAudit?: AiAuditEmitter;
  echoSteps?: EchoStepResponse[];
  proposalValidator?: AiProposalValidator;
  contentTypesLookup?: MountAiRoutesOptions["contentTypesLookup"];
  supportedLocalesLookup?: MountAiRoutesOptions["supportedLocalesLookup"];
  userLookup?: MountAiRoutesOptions["userLookup"];
  listEntries?: MountAiRoutesOptions["listEntries"];
  getEntry?: MountAiRoutesOptions["getEntry"];
}) {
  const document = input.document ?? buildDocument();
  const orchestrator: AiOrchestrator = createAiOrchestrator({
    provider: createEchoAiProvider({
      respond: () => buildEchoOutputForReplaceSelection(),
      ...(input.echoSteps ? { steps: input.echoSteps } : {}),
    }),
    clock: () => new Date("2026-05-01T00:00:00.000Z"),
    idFactory: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `prop_${n}`;
      };
    })(),
    ...(input.proposalValidator
      ? { proposalValidator: input.proposalValidator }
      : {}),
  });
  const proposalStore: AiProposalStore = createInMemoryAiProposalStore({
    clock: () => new Date("2026-05-01T00:00:00.000Z"),
  });

  const updateCalls: Array<{
    documentId: string;
    payload: { body?: string; frontmatter?: Record<string, unknown> };
  }> = [];

  const contentStore: AiContentStore = {
    async getById() {
      return document;
    },
    async update(_scope, documentId, payload) {
      updateCalls.push({ documentId, payload });
      return {
        ...document,
        body: payload.body ?? document.body,
        frontmatter: payload.frontmatter ?? document.frontmatter,
        draftRevision: document.draftRevision + 1,
      };
    },
    async create(_scope, payload) {
      return {
        ...document,
        documentId: "doc_new",
        body: payload.body ?? "",
        frontmatter: payload.frontmatter ?? {},
        path: payload.path ?? document.path,
      };
    },
    async softDelete() {
      return { ...document, isDeleted: true };
    },
  };

  const contextResolver: AiContextResolver = {
    async loadDraftContext({ documentId }) {
      if (documentId !== document.documentId) {
        throw new RuntimeError({
          code: "NOT_FOUND",
          message: "Document not found.",
          statusCode: 404,
        });
      }
      return { document };
    },
  };

  const schemaHashLookup: AiSchemaHashLookup = async () =>
    input.schemaHash ?? "hash_1";

  const authorize: AiAuthorizer = input.authorize
    ? input.authorize
    : async () => ({ actorId: "user_1" });

  const requireCsrf: AiCsrfProtector = async () => undefined;
  const audits: AiAuditRecord[] = [];

  const options: MountAiRoutesOptions = {
    orchestrator,
    proposalStore,
    contentStore,
    contextResolver,
    schemaHashLookup,
    authorize,
    requireCsrf,
    emitAudit: input.emitAudit ?? ((record) => audits.push(record)),
    ...(input.contentTypesLookup ? { contentTypesLookup: input.contentTypesLookup } : {}),
    ...(input.supportedLocalesLookup ? { supportedLocalesLookup: input.supportedLocalesLookup } : {}),
    ...(input.userLookup ? { userLookup: input.userLookup } : {}),
    ...(input.listEntries ? { listEntries: input.listEntries } : {}),
    ...(input.getEntry ? { getEntry: input.getEntry } : {}),
  };

  const app = createFakeApp();
  mountAiRoutes(app, options);

  return { app, options, proposalStore, audits, updateCalls };
}

const TARGET_HEADERS = {
  "x-mdcms-project": "demo",
  "x-mdcms-environment": "draft",
  "content-type": "application/json",
};

describe("mountAiRoutes — inline-transform", () => {
  test("creates pending proposals on success", async () => {
    const { app, proposalStore, audits } = createTestSetup({});

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/inline-transform",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          documentId: "doc_1",
          draftRevision: 4,
          selectionId: "sel_anchor",
          selectedText: "Welcome to the site.",
          action: "rewrite",
        }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { proposals: AiProposal[] };
    };
    assert.equal(payload.data.proposals.length, 1);
    assert.equal(payload.data.proposals[0]!.proposalId, "prop_1");
    assert.equal(payload.data.proposals[0]!.kind, "replace_selection");

    const stored = proposalStore.peek("prop_1");
    assert.equal(stored?.status, "pending");
    const succeeded = audits.at(-1)!;
    assert.equal(succeeded.outcome, "succeeded");
    // SPEC-014 §Observability: audit must include the user-facing
    // action name and proposal kind alongside the orchestrator's
    // taskKind.
    assert.equal(succeeded.action, "rewrite");
    assert.equal(succeeded.proposalKind, "replace_selection");
  });

  test("rejects when draftRevision does not match the live draft", async () => {
    const { app } = createTestSetup({
      document: buildDocument({ draftRevision: 12 }),
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/inline-transform",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          documentId: "doc_1",
          draftRevision: 4,
          selectionId: "sel_anchor",
          selectedText: "Welcome to the site.",
          action: "rewrite",
        }),
      },
    );

    assert.equal(response.status, 409);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "AI_PROPOSAL_CONFLICT");
  });

  test("returns 400 when target routing headers are missing", async () => {
    const { app } = createTestSetup({});

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/inline-transform",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: "doc_1",
          draftRevision: 4,
          selectionId: "sel_anchor",
          selectedText: "Welcome to the site.",
          action: "rewrite",
        }),
      },
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "MISSING_TARGET_ROUTING");
  });

  test("forbidden authorize bubbles 403", async () => {
    const { app } = createTestSetup({
      authorize: async () => {
        throw new RuntimeError({
          code: "FORBIDDEN",
          message: "AI scope required.",
          statusCode: 403,
        });
      },
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/inline-transform",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          documentId: "doc_1",
          draftRevision: 4,
          selectionId: "sel_anchor",
          selectedText: "Welcome to the site.",
          action: "rewrite",
        }),
      },
    );

    assert.equal(response.status, 403);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "FORBIDDEN");
  });
});

describe("mountAiRoutes — proposals/:id/apply", () => {
  async function createProposal(app: FakeApp): Promise<string> {
    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/inline-transform",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          documentId: "doc_1",
          draftRevision: 4,
          selectionId: "sel_anchor",
          selectedText: "Welcome to the site.",
          action: "rewrite",
        }),
      },
    );
    const payload = (await response.json()) as {
      data: { proposals: { proposalId: string }[] };
    };
    return payload.data.proposals[0]!.proposalId;
  }

  test("happy path applies proposal and emits accepted audit", async () => {
    const setup = createTestSetup({});
    const proposalId = await createProposal(setup.app);

    const response = await setup.app.fetch(
      "POST",
      `https://test.local/api/v1/ai/proposals/${proposalId}/apply`,
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ schemaHash: "hash_1", draftRevision: 4 }),
      },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: { document: { body: string }; proposal: { proposalId: string } };
    };
    assert.equal(body.data.document.body, "Hi there!");
    assert.equal(body.data.proposal.proposalId, proposalId);
    assert.equal(setup.updateCalls.length, 1);

    const last = setup.audits.at(-1)!;
    assert.equal(last.outcome, "accepted");
    assert.equal(last.actorId, "user_1");
    // Lifecycle audits derive proposalKind from the resolved proposal
    // even though the original action name is not replayed at apply
    // time. SPEC-014 §Observability requires both the proposalId and
    // the kind on the record.
    assert.equal(last.proposalKind, "replace_selection");
    assert.deepEqual(last.proposalIds, [proposalId]);
  });

  test("expired proposal returns 410 and emits expired audit", async () => {
    const orchestrator = createAiOrchestrator({
      provider: createEchoAiProvider({
        respond: () => buildEchoOutputForReplaceSelection(),
      }),
      clock: () => new Date("2026-05-01T00:00:00.000Z"),
      proposalTtlMs: 1000,
    });
    const proposalStore = createInMemoryAiProposalStore({
      clock: () => new Date("2026-05-01T00:01:00.000Z"),
    });

    // Insert a proposal with a past expiration directly so we control time.
    const expiredProposal: AiProposal = {
      proposalId: "p_expired",
      kind: "replace_selection",
      project: "demo",
      environment: "draft",
      documentId: "doc_1",
      baseDraftRevision: 4,
      type: "post",
      locale: "en",
      summary: "Old.",
      operations: [
        {
          op: "replace_selection",
          selectionId: "sel_anchor",
          originalText: "Welcome to the site.",
          replacementText: "Hi there!",
        },
      ],
      validation: { status: "valid" },
      expiresAt: "2025-12-01T00:00:00.000Z",
      provider: {
        providerId: "echo",
        model: "echo-1",
        promptTemplateId: "copy_improvement.v1",
      },
    };
    proposalStore.insert({ proposal: expiredProposal, actorId: "user_1" });

    const audits: AiAuditRecord[] = [];

    const options: MountAiRoutesOptions = {
      orchestrator,
      proposalStore,
      contentStore: {
        async getById() {
          return buildDocument();
        },
        async update(_scope, _id, payload) {
          return { ...buildDocument(), body: payload.body ?? "" };
        },
        async create() {
          return buildDocument();
        },
        async softDelete() {
          return { ...buildDocument(), isDeleted: true };
        },
      },
      contextResolver: {
        async loadDraftContext() {
          return { document: buildDocument() };
        },
      },
      schemaHashLookup: async () => "hash_1",
      authorize: async () => ({ actorId: "user_1" }),
      requireCsrf: async () => undefined,
      emitAudit: (record) => audits.push(record),
    };

    const app = createFakeApp();
    mountAiRoutes(app, options);

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/proposals/p_expired/apply",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ schemaHash: "hash_1" }),
      },
    );

    assert.equal(response.status, 410);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "AI_PROPOSAL_EXPIRED");
    assert.ok(audits.some((record) => record.outcome === "expired"));
  });

  test("schema hash mismatch returns 409 and audits validation_failed", async () => {
    const setup = createTestSetup({ schemaHash: "hash_server" });
    const proposalId = await createProposal(setup.app);

    const response = await setup.app.fetch(
      "POST",
      `https://test.local/api/v1/ai/proposals/${proposalId}/apply`,
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          schemaHash: "hash_client_wrong",
          draftRevision: 4,
        }),
      },
    );

    assert.equal(response.status, 409);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "SCHEMA_HASH_MISMATCH");
    assert.ok(
      setup.audits.some((record) => record.outcome === "validation_failed"),
    );
  });

  test("rejecting a proposal does not invoke the content store", async () => {
    const setup = createTestSetup({});
    const proposalId = await createProposal(setup.app);

    const response = await setup.app.fetch(
      "POST",
      `https://test.local/api/v1/ai/proposals/${proposalId}/reject`,
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: "{}",
      },
    );

    assert.equal(response.status, 200);
    assert.equal(setup.updateCalls.length, 0);
    assert.equal(setup.proposalStore.peek(proposalId)?.status, "rejected");
    assert.ok(setup.audits.some((record) => record.outcome === "rejected"));
  });

  test("apply on a missing proposal returns 404", async () => {
    const setup = createTestSetup({});

    const response = await setup.app.fetch(
      "POST",
      "https://test.local/api/v1/ai/proposals/p_missing/apply",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ schemaHash: "hash_1" }),
      },
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Chat-message endpoint tests
// ─────────────────────────────────────────────────────────────────────

function authorizeWithScopes(scopes: ReadonlySet<string>): AiAuthorizer {
  return async (_request, { requiredScope }) => {
    if (!scopes.has(requiredScope)) {
      throw new RuntimeError({
        code: "FORBIDDEN",
        message: `Caller lacks ${requiredScope} scope.`,
        statusCode: 403,
      });
    }
    return { actorId: "user_1" };
  };
}

describe("mountAiRoutes — chat-message", () => {
  test("returns an edit proposal when the model invokes propose_edit_selection", async () => {
    const { app, proposalStore } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "propose_edit_selection",
              input: JSON.stringify({
                summary: "Tightened intro",
                originalText: "Welcome to the site.",
                replacementText: "Hi there!",
              }),
            },
          ],
        },
        {
          type: "text",
          text: "Proposed a tighter intro.",
        },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "Tighten the lede",
          attachedSelection: {
            documentId: "doc_1",
            draftRevision: 4,
            selectionId: "sel_anchor",
            text: "Welcome to the site.",
          },
        }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: {
        conversationId: string;
        message: {
          id: string;
          role: string;
          at: string;
          text?: string;
          proposals?: string[];
        };
        proposals?: AiProposal[];
      };
    };
    assert.ok(payload.data.conversationId.length > 0);
    assert.equal(payload.data.message.role, "assistant");
    assert.ok(payload.data.proposals && payload.data.proposals.length === 1);
    const proposal = payload.data.proposals[0]!;
    assert.equal(proposal.kind, "replace_selection");
    assert.deepEqual(payload.data.message.proposals, [proposal.proposalId]);
    // Chat proposals live client-side in localStorage; the server does
    // NOT insert them into its in-memory proposal store. Apply/reject
    // accept the full proposal body from the client instead.
    assert.equal(proposalStore.peek(proposal.proposalId), undefined);
    assert.equal(payload.data.message.text, "Proposed a tighter intro.");
  });

  test("echoes the supplied conversationId on the response", async () => {
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      echoSteps: [
        { type: "text", text: "hi" },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "Tighten the lede",
          conversationId: "conv-echo",
          attachedSelection: {
            documentId: "doc_1",
            draftRevision: 4,
            selectionId: "sel_anchor",
            text: "Welcome to the site.",
          },
        }),
      },
    );

    const payload = (await response.json()) as {
      data: { conversationId: string };
    };
    assert.equal(payload.data.conversationId, "conv-echo");
  });

  test("returns a delete_document proposal when the model invokes propose_delete_document", async () => {
    const { app, proposalStore } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set([
          "ai:use",
          "content:read:draft",
          "content:write",
          "content:delete",
        ]),
      ),
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "propose_delete_document",
              input: JSON.stringify({
                summary: "Delete stale draft",
                reason: "User asked to delete; content is out of date.",
              }),
            },
          ],
        },
        { type: "text", text: "Proposed a delete." },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "Please delete this draft, it's stale",
          attachedDocumentIds: ["doc_1"],
        }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { proposals?: AiProposal[] };
    };
    assert.ok(payload.data.proposals && payload.data.proposals.length === 1);
    const proposal = payload.data.proposals[0]!;
    assert.equal(proposal.kind, "delete_document");
    assert.equal(proposal.documentId, "doc_1");
    // Same as the edit-proposal test: chat proposals are client-owned;
    // the server's in-memory store stays empty for chat-driven turns.
    assert.equal(proposalStore.peek(proposal.proposalId), undefined);
  });

  test("does not expose the delete tool when caller lacks content:delete", async () => {
    // With tool-calling, capability denial becomes graceful: the tool
    // isn't registered, the model has no way to propose a delete, and
    // it responds in text. Hard-denylisted actions (publish, restore,
    // …) still throw AI_UNSUPPORTED_ACTION — covered by the next test.
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      echoSteps: [
        {
          type: "text",
          text: "I can't delete drafts in this role — ask an editor with delete permissions.",
        },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "delete this draft",
          attachedDocumentIds: ["doc_1"],
        }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { message: { text?: string }; proposals?: AiProposal[] };
    };
    assert.equal(
      (payload.data.proposals ?? []).length,
      0,
      "no proposals when delete tool isn't registered",
    );
    assert.ok(
      (payload.data.message.text ?? "").length > 0,
      "model responds in text",
    );
  });

  test("returns AI_UNSUPPORTED_ACTION when client requests an always-denied action", async () => {
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "Publish the draft",
          allowedActions: ["publish"],
        }),
      },
    );

    assert.equal(response.status, 403);
    // SPEC-014 reserves `AI_UNSUPPORTED_ACTION` for permanently-denied
    // actions. The wire schema is intentionally permissive so the route
    // can return this contract error instead of being short-circuited
    // by Zod's enum rejection.
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "AI_UNSUPPORTED_ACTION");
  });

  test("returns INVALID_INPUT when the request body is missing fields", async () => {
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "" }),
      },
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "INVALID_INPUT");
  });

  test("returns MISSING_TARGET_ROUTING when project/env headers are absent", async () => {
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ok" }),
      },
    );

    assert.notEqual(response.status, 200);
  });

  test("forwards rejectedProposalId on the regenerate path", async () => {
    const { app, proposalStore } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
    });

    // Seed the proposal store with the prior proposal so the regenerate
    // path can load it. Without this the handler now throws NOT_FOUND.
    proposalStore.insert({
      proposal: {
        proposalId: "prop_prev",
        kind: "replace_selection",
        project: "demo",
        environment: "draft",
        documentId: "doc_1",
        baseDraftRevision: 4,
        type: "post",
        locale: "en",
        summary: "Tighten the lede",
        operations: [
          {
            op: "replace_selection",
            selectionId: "sel_anchor",
            originalText: "Welcome to the site.",
            replacementText: "Welcome.",
          },
        ],
        validation: { status: "valid" },
        expiresAt: "2026-05-01T00:05:00.000Z",
        provider: {
          providerId: "echo",
          model: "echo-1",
          promptTemplateId: "current_document_edit.v1",
        },
      },
      actorId: "user_1",
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "Try a softer tone",
          rejectedProposalId: "prop_prev",
          rejectionFeedback: "Too aggressive",
          attachedSelection: {
            documentId: "doc_1",
            draftRevision: 4,
            selectionId: "sel_anchor",
            text: "Welcome to the site.",
          },
        }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { message: { rejectedProposalId?: string } };
    };
    assert.equal(payload.data.message.rejectedProposalId, "prop_prev");
  });

  test("regenerate returns NOT_FOUND when the prior proposal is unknown", async () => {
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({
          message: "Try a softer tone",
          rejectedProposalId: "prop_missing",
          rejectionFeedback: "Too aggressive",
          attachedSelection: {
            documentId: "doc_1",
            draftRevision: 4,
            selectionId: "sel_anchor",
            text: "Welcome to the site.",
          },
        }),
      },
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "NOT_FOUND");
  });

  test("plain chat turn with no tool calls returns text-only message", async () => {
    // Replaces the old `inferChatIntent` negation tests. With
    // tool-calling, the model itself decides whether to call a tool —
    // we just verify that a turn with no tool calls produces an
    // assistant text turn and no proposals.
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      echoSteps: [{ type: "text", text: "Hi! What can I help with?" }],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "hey" }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: {
        message: { text?: string; proposals?: string[] };
        proposals?: AiProposal[];
      };
    };
    assert.equal((payload.data.proposals ?? []).length, 0);
    assert.equal(payload.data.message.text, "Hi! What can I help with?");
  });

  test("propose_create_document with empty frontmatter returns INVALID via validator", async () => {
    // Plumb a schema-aware validator into the orchestrator so chat
    // proposals get real schema checks. The blog schema marks `title`
    // and `date` as required.
    const validator: AiProposalValidator = async (candidate) => {
      if (candidate.kind !== "create_document") return { status: "valid" };
      const op = candidate.operations[0];
      if (!op || op.op !== "create_document") return { status: "valid" };
      const missing: string[] = [];
      if (!("title" in op.frontmatter)) missing.push("title");
      if (!("date" in op.frontmatter)) missing.push("date");
      if (missing.length === 0) return { status: "valid" };
      return {
        status: "invalid",
        errors: missing.map((field) => ({
          code: "MISSING_REQUIRED_FRONTMATTER",
          message: `Required field "${field}" is missing from frontmatter.`,
          path: `frontmatter.${field}`,
        })),
      };
    };

    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      proposalValidator: validator,
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "propose_create_document",
              input: JSON.stringify({
                summary: "Draft a new blog post",
                path: "blog/poems/morning-poem",
                type: "blog",
                format: "md",
                frontmatter: "{}",
                body: "In the hush of morning light…",
              }),
            },
          ],
        },
        { type: "text", text: "Proposed a new blog draft." },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "make a new blog post about morning" }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { proposals?: AiProposal[] };
    };
    assert.ok(payload.data.proposals && payload.data.proposals.length === 1);
    const proposal = payload.data.proposals[0]!;
    assert.equal(proposal.kind, "create_document");
    assert.equal(proposal.validation.status, "invalid");
    if (proposal.validation.status === "invalid") {
      const codes = proposal.validation.errors.map((e) => e.code);
      assert.ok(codes.includes("MISSING_REQUIRED_FRONTMATTER"));
    }
  });

  test("propose_create_document with valid frontmatter returns VALID via validator", async () => {
    const validator: AiProposalValidator = async (candidate) => {
      if (candidate.kind !== "create_document") return { status: "valid" };
      const op = candidate.operations[0];
      if (!op || op.op !== "create_document") return { status: "valid" };
      const missing: string[] = [];
      if (!("title" in op.frontmatter)) missing.push("title");
      if (!("date" in op.frontmatter)) missing.push("date");
      if (missing.length === 0) return { status: "valid" };
      return {
        status: "invalid",
        errors: missing.map((field) => ({
          code: "MISSING_REQUIRED_FRONTMATTER",
          message: `Required field "${field}" is missing from frontmatter.`,
          path: `frontmatter.${field}`,
        })),
      };
    };

    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      proposalValidator: validator,
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "propose_create_document",
              input: JSON.stringify({
                summary: "Draft a new blog post",
                path: "blog/poems/morning-poem",
                type: "blog",
                format: "md",
                frontmatter:
                  '{"title":"Morning poem","date":"2026-05-15"}',
                body: "In the hush of morning light…",
              }),
            },
          ],
        },
        { type: "text", text: "Proposed a new blog draft." },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "make a new blog post about morning" }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { proposals?: AiProposal[] };
    };
    assert.ok(payload.data.proposals && payload.data.proposals.length === 1);
    const proposal = payload.data.proposals[0]!;
    assert.equal(proposal.kind, "create_document");
    assert.equal(proposal.validation.status, "valid");
    // The tool's type input ("blog") flowed through to the proposal envelope,
    // overriding the orchestrator's "page" default.
    assert.equal(proposal.type, "blog");
  });

  test("system prompt includes project knowledge block from lookups", async () => {
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      contentTypesLookup: async () => [
        {
          type: "post",
          directory: "blog",
          localized: true,
          fields: {
            title: { kind: "string", required: true, nullable: false },
          },
        },
      ],
      supportedLocalesLookup: async () => ["en", "pl"],
      userLookup: async () => ({ id: "u1", displayName: "Karol" }),
      echoSteps: [
        { type: "text", text: "Hi!" },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "hi" }),
      },
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { message: { text?: string } };
    };
    assert.equal(payload.data.message.text, "Hi!");
  });

  test("find_entries tool call flows through to backend and result reaches model", async () => {
    let backendCalledWith: { type: string; query?: string } | undefined;
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      contentTypesLookup: async () => [
        {
          type: "author",
          directory: "authors",
          localized: false,
          fields: {
            name: { kind: "string", required: true, nullable: false },
          },
        },
      ],
      supportedLocalesLookup: async () => ["en"],
      userLookup: async () => ({ id: "u1", displayName: "K" }),
      listEntries: async (input) => {
        backendCalledWith = { type: input.type, query: input.query };
        return {
          matches: [
            {
              documentId: "doc_author_1",
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
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "find_entries",
              input: JSON.stringify({ type: "author", query: "John" }),
            },
          ],
        },
        { type: "text", text: "Found one match: John Doe." },
      ],
    });

    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "find an author named John" }),
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(backendCalledWith, { type: "author", query: "John" });
    const payload = (await response.json()) as {
      data: { message: { text?: string } };
    };
    assert.equal(payload.data.message.text, "Found one match: John Doe.");
  });

  test("propose_create_document at taken path returns PATH_ALREADY_IN_USE", async () => {
    const validator: AiProposalValidator = async (candidate) => {
      if (candidate.kind !== "create_document") return { status: "valid" };
      const op = candidate.operations[0];
      if (!op || op.op !== "create_document") return { status: "valid" };
      if (op.path === "blog/taken") {
        return {
          status: "invalid",
          errors: [
            {
              code: "PATH_ALREADY_IN_USE",
              message: `Path "${op.path}" is already used.`,
              path: "operations[0].path",
            },
          ],
        };
      }
      return { status: "valid" };
    };
    const { app } = createTestSetup({
      authorize: authorizeWithScopes(
        new Set(["ai:use", "content:read:draft", "content:write"]),
      ),
      proposalValidator: validator,
      echoSteps: [
        {
          type: "tool-calls",
          calls: [
            {
              toolName: "propose_create_document",
              input: JSON.stringify({
                summary: "create",
                path: "blog/taken",
                type: "blog",
                format: "md",
                frontmatter: '{"title":"x","date":"2026-05-15"}',
                body: "Body",
              }),
            },
          ],
        },
        { type: "text", text: "Proposed." },
      ],
    });
    const response = await app.fetch(
      "POST",
      "https://test.local/api/v1/ai/chat/messages",
      {
        method: "POST",
        headers: TARGET_HEADERS,
        body: JSON.stringify({ message: "make a doc at blog/taken" }),
      },
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { proposals?: AiProposal[] };
    };
    const proposal = payload.data.proposals?.[0]!;
    assert.equal(proposal.validation.status, "invalid");
    if (proposal.validation.status === "invalid") {
      const codes = proposal.validation.errors.map((e) => e.code);
      assert.ok(codes.includes("PATH_ALREADY_IN_USE"));
    }
  });
});
