import assert from "node:assert/strict";

import { test } from "bun:test";
import { RuntimeError } from "@mdcms/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StudioDocumentShell } from "../../document-shell.js";
import { StudioNavigationProvider } from "../navigation.js";
import {
  applySuccessfulDraftSaveToReadyState,
  ContentDocumentPageView,
  createContentDocumentPageState,
  loadContentDocumentPageState,
  loadContentDocumentVersionDiff,
  publishContentDocumentReadyState,
  reduceContentDocumentPageReadyState,
  saveContentDocumentReadyState,
} from "./content-document-page.js";

function createReadyShell(
  overrides: Partial<StudioDocumentShell["data"]> = {},
): StudioDocumentShell {
  return {
    state: "ready",
    type: "BlogPost",
    documentId: "11111111-1111-4111-8111-111111111111",
    locale: "en",
    data: {
      documentId: "11111111-1111-4111-8111-111111111111",
      type: "BlogPost",
      locale: "en",
      path: "blog/launch-notes",
      body: "# Launch Notes",
      updatedAt: "2026-03-27T12:00:00.000Z",
      hasUnpublishedChanges: true,
      publishedVersion: 5,
      ...overrides,
    },
  };
}

function createErrorShell(
  errorCode: StudioDocumentShell["errorCode"],
  errorMessage = "Route failed",
): StudioDocumentShell {
  return {
    state: "error",
    type: "BlogPost",
    documentId: "11111111-1111-4111-8111-111111111111",
    locale: "en",
    errorCode,
    errorMessage,
  };
}

function renderPageMarkup(
  state: Parameters<typeof ContentDocumentPageView>[0]["state"],
): string {
  return renderToStaticMarkup(
    createElement(
      StudioNavigationProvider,
      {
        value: {
          pathname:
            "/admin/content/BlogPost/11111111-1111-4111-8111-111111111111",
          params: {
            type: "BlogPost",
            documentId: "11111111-1111-4111-8111-111111111111",
          },
          push: () => {},
          replace: () => {},
          back: () => {},
        },
      },
      createElement(ContentDocumentPageView, {
        state,
      }),
    ),
  );
}

function createReadyState() {
  const state = createContentDocumentPageState({
    shell: createReadyShell(),
    typeLabel: "Blog post",
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: true,
        schemaHash: "schema-hash",
      },
    },
  });

  if (state.status !== "ready") {
    throw new Error("expected ready state");
  }

  return state;
}

function createRouteContext(canWrite = true) {
  return {
    project: "marketing-site",
    environment: "staging",
    write: canWrite
      ? {
          canWrite: true as const,
          schemaHash: "schema-hash",
        }
      : {
          canWrite: false as const,
          message: "Schema sync required before Studio can write drafts.",
        },
  };
}

function createMountContext(canWrite = true) {
  return {
    apiBaseUrl: "https://cms.example.com",
    basePath: "/admin",
    auth: {
      mode: "cookie" as const,
    },
    hostBridge: {
      version: "1" as const,
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
    documentRoute: createRouteContext(canWrite),
  };
}

function createVersionSummary(
  version: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    documentId: "11111111-1111-4111-8111-111111111111",
    translationGroupId: "22222222-2222-4222-8222-222222222222",
    project: "marketing-site",
    environment: "staging",
    version,
    path: "blog/launch-notes",
    type: "BlogPost",
    locale: "en",
    format: "mdx" as const,
    publishedAt: `2026-03-0${version}T10:00:00.000Z`,
    publishedBy: `33333333-3333-4333-8333-33333333333${version}`,
    ...overrides,
  };
}

function createVersionDocument(
  version: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    ...createVersionSummary(version),
    frontmatter: {
      title: `Launch Notes v${version}`,
    },
    body: `# Launch Notes\nVersion ${version}`,
    ...overrides,
  };
}

function createDocumentResponse(overrides: Record<string, unknown> = {}) {
  return {
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
    },
    body: "# Launch Notes",
    createdBy: "33333333-3333-4333-8333-333333333331",
    createdAt: "2026-03-27T10:00:00.000Z",
    updatedAt: "2026-03-27T12:00:00.000Z",
    ...overrides,
  };
}

test("createContentDocumentPageState maps shell loading and error states into view states", () => {
  const loading = createContentDocumentPageState({
    shell: {
      state: "loading",
      type: "BlogPost",
      documentId: "11111111-1111-4111-8111-111111111111",
      locale: "en",
    },
    typeLabel: "Blog post",
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: true,
        schemaHash: "schema-hash",
      },
    },
  });
  const forbidden = createContentDocumentPageState({
    shell: createErrorShell("FORBIDDEN", "Forbidden"),
    typeLabel: "Blog post",
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: true,
        schemaHash: "schema-hash",
      },
    },
  });
  const notFound = createContentDocumentPageState({
    shell: createErrorShell("NOT_FOUND", "Document not found"),
    typeLabel: "Blog post",
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: true,
        schemaHash: "schema-hash",
      },
    },
  });
  const genericError = createContentDocumentPageState({
    shell: createErrorShell("DOCUMENT_LOAD_FAILED", "Draft load failed"),
    typeLabel: "Blog post",
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: true,
        schemaHash: "schema-hash",
      },
    },
  });

  assert.equal(loading.status, "loading");
  assert.equal(forbidden.status, "forbidden");
  assert.equal(notFound.status, "not-found");
  assert.equal(genericError.status, "error");
});

test("ContentDocumentPageView renders document route loading and failure states", () => {
  const loadingMarkup = renderPageMarkup(
    createContentDocumentPageState({
      shell: {
        state: "loading",
        type: "BlogPost",
        documentId: "11111111-1111-4111-8111-111111111111",
        locale: "en",
      },
      typeLabel: "Blog post",
      documentRoute: {
        project: "marketing-site",
        environment: "staging",
        write: {
          canWrite: true,
          schemaHash: "schema-hash",
        },
      },
    }),
  );
  const forbiddenMarkup = renderPageMarkup(
    createContentDocumentPageState({
      shell: createErrorShell("FORBIDDEN", "Forbidden"),
      typeLabel: "Blog post",
      documentRoute: {
        project: "marketing-site",
        environment: "staging",
        write: {
          canWrite: true,
          schemaHash: "schema-hash",
        },
      },
    }),
  );
  const notFoundMarkup = renderPageMarkup(
    createContentDocumentPageState({
      shell: createErrorShell("NOT_FOUND", "Document not found"),
      typeLabel: "Blog post",
      documentRoute: {
        project: "marketing-site",
        environment: "staging",
        write: {
          canWrite: true,
          schemaHash: "schema-hash",
        },
      },
    }),
  );
  const errorMarkup = renderPageMarkup(
    createContentDocumentPageState({
      shell: createErrorShell("DOCUMENT_LOAD_FAILED", "Draft load failed"),
      typeLabel: "Blog post",
      documentRoute: {
        project: "marketing-site",
        environment: "staging",
        write: {
          canWrite: true,
          schemaHash: "schema-hash",
        },
      },
    }),
  );

  assert.match(loadingMarkup, /data-mdcms-document-state="loading"/);
  assert.match(loadingMarkup, /Loading document draft/);
  assert.match(forbiddenMarkup, /data-mdcms-document-state="forbidden"/);
  assert.match(
    forbiddenMarkup,
    /You do not have access to this document draft/,
  );
  assert.match(notFoundMarkup, /data-mdcms-document-state="not-found"/);
  assert.match(notFoundMarkup, /Document not found/);
  assert.match(errorMarkup, /data-mdcms-document-state="error"/);
  assert.match(errorMarkup, /Draft load failed/);
});

test("reduceContentDocumentPageReadyState moves draft edits through unsaved, saving, and saved", () => {
  const initial = createReadyState();

  const unsaved = reduceContentDocumentPageReadyState(initial, {
    type: "draftChanged",
    body: "# Launch Notes\nUpdated",
  });
  const saving = reduceContentDocumentPageReadyState(unsaved, {
    type: "saveStarted",
  });
  const saved = reduceContentDocumentPageReadyState(saving, {
    type: "saveSucceeded",
    updatedAt: "2026-03-27T12:05:00.000Z",
  });

  assert.equal(unsaved.saveState, "unsaved");
  assert.equal(saving.saveState, "saving");
  assert.equal(saved.saveState, "saved");
  assert.equal(saved.document.updatedAt, "2026-03-27T12:05:00.000Z");
  assert.equal(saved.draftBody, "# Launch Notes\nUpdated");
});

test("reduceContentDocumentPageReadyState keeps the unsaved draft body and surfaces mutation feedback on save failure", () => {
  const initial = createReadyState();

  const unsaved = reduceContentDocumentPageReadyState(initial, {
    type: "draftChanged",
    body: "# Launch Notes\nUnsaved",
  });
  const failed = reduceContentDocumentPageReadyState(unsaved, {
    type: "saveFailed",
    message: "Draft update failed.",
  });

  assert.equal(failed.saveState, "unsaved");
  assert.equal(failed.draftBody, "# Launch Notes\nUnsaved");
  assert.equal(failed.mutationError, "Draft update failed.");
});

test("applySuccessfulDraftSaveToReadyState preserves newer unsaved edits when an earlier save resolves", () => {
  const initial = createReadyState();
  const saving = reduceContentDocumentPageReadyState(
    reduceContentDocumentPageReadyState(initial, {
      type: "draftChanged",
      body: "# Launch Notes\nSaved edit",
    }),
    {
      type: "saveStarted",
    },
  );
  const withNewerEdit = reduceContentDocumentPageReadyState(saving, {
    type: "draftChanged",
    body: "# Launch Notes\nNewer edit",
  });

  const next = applySuccessfulDraftSaveToReadyState({
    state: withNewerEdit,
    requestBody: "# Launch Notes\nSaved edit",
    updatedAt: "2026-03-27T12:06:00.000Z",
  });

  assert.equal(next.document.body, "# Launch Notes\nSaved edit");
  assert.equal(next.draftBody, "# Launch Notes\nNewer edit");
  assert.equal(next.saveState, "unsaved");
  assert.equal(next.mutationError, undefined);
});

test("loadContentDocumentPageState loads the routed draft and version history", async () => {
  const shellCalls: Array<Record<string, unknown>> = [];
  const versionCalls: Array<Record<string, unknown>> = [];

  const next = await loadContentDocumentPageState({
    context: createMountContext(),
    typeId: "BlogPost",
    typeLabel: "Blog post",
    documentId: "11111111-1111-4111-8111-111111111111",
    loadDocumentShell: async (config, target, options) => {
      shellCalls.push({
        project: config.project,
        environment: config.environment,
        serverUrl: config.serverUrl,
        type: target.type,
        documentId: target.documentId,
        authMode: options?.auth?.mode,
      });

      return createReadyShell();
    },
    createRouteApi: () => ({
      listVersions: async (input) => {
        versionCalls.push(input as Record<string, unknown>);

        return {
          data: [createVersionSummary(3), createVersionSummary(1)],
          pagination: {
            total: 2,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
        };
      },
    }),
  });

  assert.equal(shellCalls[0]?.project, "marketing-site");
  assert.equal(shellCalls[0]?.environment, "staging");
  assert.equal(shellCalls[0]?.type, "BlogPost");
  assert.equal(
    versionCalls[0]?.documentId,
    "11111111-1111-4111-8111-111111111111",
  );

  if (next.status !== "ready") {
    throw new Error("expected ready state");
  }

  assert.equal(next.versionHistory.status, "ready");
  assert.deepEqual(
    next.versionHistory.versions.map((version) => version.version),
    [3, 1],
  );
  assert.deepEqual(next.selectedComparison, {
    leftVersion: 1,
    rightVersion: 3,
  });
});

test("saveContentDocumentReadyState persists routed draft updates through the content mutation", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const initial = reduceContentDocumentPageReadyState(createReadyState(), {
    type: "draftChanged",
    body: "# Launch Notes\nUpdated",
  });

  const next = await saveContentDocumentReadyState({
    api: {
      updateDraft: async (input) => {
        calls.push(input as Record<string, unknown>);

        return createDocumentResponse({
          body: "# Launch Notes\nUpdated",
          hasUnpublishedChanges: true,
          updatedAt: "2026-03-27T12:05:00.000Z",
        });
      },
    },
    route: createRouteContext(),
    state: initial,
  });

  assert.equal(calls[0]?.documentId, initial.documentId);
  assert.equal(calls[0]?.locale, initial.document.locale);
  assert.equal(calls[0]?.schemaHash, "schema-hash");
  assert.deepEqual(calls[0]?.payload, {
    body: "# Launch Notes\nUpdated",
  });
  assert.equal(next.saveState, "saved");
  assert.equal(next.document.body, "# Launch Notes\nUpdated");
  assert.equal(next.document.updatedAt, "2026-03-27T12:05:00.000Z");
});

test("saveContentDocumentReadyState keeps the unsaved draft when the routed update returns a validation failure", async () => {
  const initial = reduceContentDocumentPageReadyState(createReadyState(), {
    type: "draftChanged",
    body: "# Launch Notes\nInvalid",
  });

  const next = await saveContentDocumentReadyState({
    api: {
      updateDraft: async () => {
        throw new RuntimeError({
          code: "VALIDATION_ERROR",
          message: "Path must be unique.",
          statusCode: 400,
        });
      },
    },
    route: createRouteContext(),
    state: initial,
  });

  assert.equal(next.saveState, "unsaved");
  assert.equal(next.draftBody, "# Launch Notes\nInvalid");
  assert.equal(next.document.body, "# Launch Notes");
  assert.equal(next.mutationError, "Path must be unique.");
});

test("saveContentDocumentReadyState surfaces forbidden routed draft updates without pretending the draft persisted", async () => {
  const initial = reduceContentDocumentPageReadyState(createReadyState(), {
    type: "draftChanged",
    body: "# Launch Notes\nForbidden",
  });

  const next = await saveContentDocumentReadyState({
    api: {
      updateDraft: async () => {
        throw new RuntimeError({
          code: "FORBIDDEN",
          message: "You do not have permission to update this draft.",
          statusCode: 403,
        });
      },
    },
    route: createRouteContext(),
    state: initial,
  });

  assert.equal(next.saveState, "unsaved");
  assert.equal(next.draftBody, "# Launch Notes\nForbidden");
  assert.equal(next.document.body, "# Launch Notes");
  assert.equal(
    next.mutationError,
    "You do not have permission to update this draft.",
  );
});

test("publishContentDocumentReadyState submits optional change summary and refreshes version history", async () => {
  const initial = createReadyState();
  const publishCalls: Array<Record<string, unknown>> = [];
  const listCalls: Array<Record<string, unknown>> = [];

  const next = await publishContentDocumentReadyState({
    api: {
      publish: async (input) => {
        publishCalls.push(input as Record<string, unknown>);

        return createDocumentResponse({
          hasUnpublishedChanges: false,
          publishedVersion: 6,
          version: 6,
          updatedAt: "2026-03-27T12:10:00.000Z",
        });
      },
      listVersions: async (input) => {
        listCalls.push(input as Record<string, unknown>);

        return {
          data: [
            createVersionSummary(6, {
              changeSummary: "Ready for launch.",
            }),
            createVersionSummary(5),
          ],
          pagination: {
            total: 2,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
        };
      },
    },
    state: initial,
    changeSummary: "Ready for launch.",
  });

  assert.equal(publishCalls[0]?.documentId, initial.documentId);
  assert.equal(publishCalls[0]?.locale, initial.locale);
  assert.equal(publishCalls[0]?.changeSummary, "Ready for launch.");
  assert.equal(listCalls[0]?.documentId, initial.documentId);
  assert.equal(next.document.publishedVersion, 6);
  assert.equal(next.document.hasUnpublishedChanges, false);
  assert.equal(next.versionHistory.status, "ready");
  assert.deepEqual(
    next.versionHistory.versions.map((version) => version.version),
    [6, 5],
  );
});

test("loadContentDocumentVersionDiff compares any two selected versions", async () => {
  const calls: number[] = [];

  const diff = await loadContentDocumentVersionDiff({
    api: {
      getVersion: async ({ version }) => {
        calls.push(version);

        if (version === 1) {
          return createVersionDocument(1);
        }

        return createVersionDocument(3, {
          path: "blog/launch-notes-updated",
          frontmatter: {
            title: "Launch Notes v3",
            summary: "Published update",
          },
          body: "# Launch Notes\nVersion 3\nAdded line",
        });
      },
    },
    documentId: "11111111-1111-4111-8111-111111111111",
    locale: "en",
    leftVersion: 1,
    rightVersion: 3,
  });

  assert.deepEqual(calls, [1, 3]);
  assert.equal(diff.leftVersion, 1);
  assert.equal(diff.rightVersion, 3);
  assert.equal(diff.path.changed, true);
  assert.equal(diff.body.changed, true);
});

test("loadContentDocumentPageState seeds arbitrary version comparison and diff selection against routed version APIs", async () => {
  const calls: number[] = [];

  const loaded = await loadContentDocumentPageState({
    context: createMountContext(),
    typeId: "BlogPost",
    typeLabel: "Blog post",
    documentId: "11111111-1111-4111-8111-111111111111",
    loadDocumentShell: async () => createReadyShell(),
    createRouteApi: () => ({
      listVersions: async () => ({
        data: [createVersionSummary(3), createVersionSummary(1)],
        pagination: {
          total: 2,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      }),
    }),
  });

  if (loaded.status !== "ready") {
    throw new Error("expected ready state");
  }

  const diff = await loadContentDocumentVersionDiff({
    api: {
      getVersion: async ({ version }) => {
        calls.push(version);

        if (version === 1) {
          return createVersionDocument(1);
        }

        return createVersionDocument(3, {
          path: "blog/launch-notes-updated",
          frontmatter: {
            title: "Launch Notes v3",
          },
          body: "# Launch Notes\nVersion 3\nAdded line",
        });
      },
    },
    documentId: loaded.documentId,
    locale: loaded.document.locale,
    leftVersion: loaded.selectedComparison.leftVersion ?? 0,
    rightVersion: loaded.selectedComparison.rightVersion ?? 0,
  });

  assert.deepEqual(calls, [1, 3]);
  assert.equal(diff.leftVersion, 1);
  assert.equal(diff.rightVersion, 3);
});

test("ContentDocumentPageView renders version history states and arbitrary-version diff output", () => {
  const ready = createReadyState();
  const loadingMarkup = renderPageMarkup({
    ...ready,
    versionHistory: {
      status: "loading",
      versions: [],
    },
    versionDiff: {
      status: "idle",
    },
  });
  const emptyMarkup = renderPageMarkup({
    ...ready,
    versionHistory: {
      status: "empty",
      versions: [],
    },
    versionDiff: {
      status: "idle",
    },
  });
  const errorMarkup = renderPageMarkup({
    ...ready,
    versionHistory: {
      status: "error",
      versions: [],
      message: "Version history temporarily unavailable.",
    },
    versionDiff: {
      status: "idle",
    },
  });
  const readyMarkup = renderPageMarkup({
    ...ready,
    publishDialogOpen: true,
    publishChangeSummary: "Ready for launch.",
    versionHistory: {
      status: "ready",
      versions: [
        createVersionSummary(3, {
          changeSummary: "Ready for launch.",
        }),
        createVersionSummary(1, {
          changeSummary: "Initial publish.",
        }),
      ],
    },
    versionDiff: {
      status: "ready",
      diff: {
        leftVersion: 1,
        rightVersion: 3,
        path: {
          before: "blog/launch-notes",
          after: "blog/launch-notes-updated",
          changed: true,
        },
        frontmatter: {
          changed: true,
          changes: [
            {
              path: "title",
              before: "Launch Notes v1",
              after: "Launch Notes v3",
            },
          ],
        },
        body: {
          changed: true,
          lines: [
            {
              leftLineNumber: 1,
              rightLineNumber: 1,
              leftText: "# Launch Notes",
              rightText: "# Launch Notes",
              status: "unchanged" as const,
            },
            {
              leftLineNumber: 2,
              rightLineNumber: 2,
              leftText: "Version 1",
              rightText: "Version 3",
              status: "changed" as const,
            },
          ],
        },
      },
    },
    selectedComparison: {
      leftVersion: 1,
      rightVersion: 3,
    },
  });

  assert.match(loadingMarkup, /data-mdcms-version-history-state="loading"/);
  assert.match(loadingMarkup, /Loading version history/);
  assert.match(emptyMarkup, /data-mdcms-version-history-state="empty"/);
  assert.match(emptyMarkup, /No published versions yet/);
  assert.match(errorMarkup, /data-mdcms-version-history-state="error"/);
  assert.match(errorMarkup, /Version history temporarily unavailable/);
  assert.match(readyMarkup, /data-mdcms-version-history-state="ready"/);
  assert.match(readyMarkup, /Version 3/);
  assert.match(readyMarkup, /33333333-3333-4333-8333-333333333333/);
  assert.match(readyMarkup, /Ready for launch\./);
  assert.match(readyMarkup, /Publish document/);
  assert.match(readyMarkup, /data-mdcms-version-diff-state="ready"/);
  assert.match(readyMarkup, /Comparing v1 to v3/);
  assert.match(readyMarkup, /blog\/launch-notes-updated/);
  assert.match(readyMarkup, /Launch Notes v3/);
  assert.match(
    readyMarkup,
    /Write-enabled draft saves require a local schema hash derived from the authored Studio config\./,
  );
  assert.doesNotMatch(readyMarkup, />Unpublish</);
  assert.doesNotMatch(readyMarkup, /Move \/ Rename/);
  assert.doesNotMatch(readyMarkup, /View published version/);
});

test("ContentDocumentPageView blocks writes when the local schema hash capability is unavailable", () => {
  const state = createContentDocumentPageState({
    shell: createReadyShell(),
    typeLabel: "Blog post",
    documentRoute: {
      project: "marketing-site",
      environment: "staging",
      write: {
        canWrite: false,
        message: "Schema sync required before Studio can write drafts.",
      },
    },
  });

  if (state.status !== "ready") {
    throw new Error("expected ready state");
  }

  const markup = renderPageMarkup(state);

  assert.equal(state.canWrite, false);
  assert.match(markup, /data-mdcms-document-write-state="blocked"/);
  assert.match(markup, /Schema sync required before Studio can write drafts\./);
});
