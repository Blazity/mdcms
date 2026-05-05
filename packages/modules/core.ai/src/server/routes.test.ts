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
import { createEchoAiProvider } from "./providers/echo.js";
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
}) {
  const document = input.document ?? buildDocument();
  const orchestrator: AiOrchestrator = createAiOrchestrator({
    provider: createEchoAiProvider({
      respond: () => buildEchoOutputForReplaceSelection(),
    }),
    clock: () => new Date("2026-05-01T00:00:00.000Z"),
    idFactory: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `prop_${n}`;
      };
    })(),
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
