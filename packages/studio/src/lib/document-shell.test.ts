import assert from "node:assert/strict";

import { test } from "bun:test";

import { loadStudioDocumentShell } from "./document-shell.js";

const validDocumentResponse = {
  data: {
    documentId: "11111111-1111-4111-8111-111111111111",
    translationGroupId: "22222222-2222-4222-8222-222222222222",
    project: "marketing-site",
    environment: "staging",
    path: "blog/launch-notes",
    type: "BlogPost",
    locale: "en",
    format: "mdx" as const,
    isDeleted: false,
    hasUnpublishedChanges: true,
    version: 5,
    publishedVersion: 5,
    draftRevision: 8,
    frontmatter: {
      title: "Launch Notes",
      featured: true,
    },
    body: "# Launch Notes",
    createdBy: "33333333-3333-4333-8333-333333333331",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedBy: "33333333-3333-4333-8333-333333333331",
    updatedAt: "2026-03-27T12:00:00.000Z",
  },
};

test("loadStudioDocumentShell keeps draft frontmatter and format for the document page", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];

  const shell = await loadStudioDocumentShell(
    {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    {
      type: "BlogPost",
      documentId: "11111111-1111-4111-8111-111111111111",
      locale: "en",
    },
    {
      auth: { mode: "cookie" },
      fetcher: async (input, init) => {
        calls.push({ input, init });

        return new Response(JSON.stringify(validDocumentResponse), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(shell.state, "ready");
  if (shell.state !== "ready") {
    throw new Error("expected ready shell state");
  }

  assert.equal(shell.data?.format, "mdx");
  assert.deepEqual(shell.data?.frontmatter, {
    title: "Launch Notes",
    featured: true,
  });
  assert.equal(shell.data?.body, "# Launch Notes");
});
