import assert from "node:assert/strict";
import { test } from "node:test";

import { RuntimeError, type ActionCatalogItem } from "@mdcms/shared";

import {
  createStudioRuntimeContext,
  formatStudioErrorEnvelope,
  resolveStudioEnv,
} from "./studio.js";
import { createStudioActionCatalogAdapter } from "./action-catalog-adapter.js";
import { Studio } from "./studio-component.js";
import { loadStudioDocumentShell } from "./document-shell.js";

type ReactLikeNode = {
  props?: Record<string, unknown>;
};

function findNodeByDataAction(
  root: unknown,
  action: string,
): ReactLikeNode | undefined {
  if (!root || typeof root !== "object") {
    return undefined;
  }

  const node = root as ReactLikeNode;
  if (node.props?.["data-mdcms-action"] === action) {
    return node;
  }

  const children = node.props?.children;
  if (!children) {
    return undefined;
  }

  const queue = Array.isArray(children) ? [...children] : [children];
  while (queue.length > 0) {
    const candidate = queue.shift();
    const found = findNodeByDataAction(candidate, action);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function findNodeByProp(
  root: unknown,
  key: string,
  value: unknown,
): ReactLikeNode | undefined {
  if (!root || typeof root !== "object") {
    return undefined;
  }

  const node = root as ReactLikeNode;
  if (node.props?.[key] === value) {
    return node;
  }

  const children = node.props?.children;
  if (!children) {
    return undefined;
  }

  const queue = Array.isArray(children) ? [...children] : [children];
  while (queue.length > 0) {
    const candidate = queue.shift();
    const found = findNodeByProp(candidate, key, value);
    if (found) {
      return found;
    }
  }

  return undefined;
}

test("resolveStudioEnv parses core env and applies Studio defaults", () => {
  const env = resolveStudioEnv({
    NODE_ENV: "production",
    LOG_LEVEL: "warn",
    APP_VERSION: "2.0.0",
  } as NodeJS.ProcessEnv);

  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.LOG_LEVEL, "warn");
  assert.equal(env.APP_VERSION, "2.0.0");
  assert.equal(env.STUDIO_NAME, "studio");
});

test("createStudioRuntimeContext wires env and logger", () => {
  const context = createStudioRuntimeContext({
    NODE_ENV: "test",
    LOG_LEVEL: "debug",
    APP_VERSION: "2.0.0",
    STUDIO_NAME: "authoring-ui",
  } as NodeJS.ProcessEnv);

  assert.equal(context.env.STUDIO_NAME, "authoring-ui");
  assert.ok(context.logger);
});

test("formatStudioErrorEnvelope keeps RuntimeError code", () => {
  const envelope = formatStudioErrorEnvelope(
    new RuntimeError({
      code: "STUDIO_RUNTIME_ERROR",
      message: "Cannot load studio runtime.",
      statusCode: 500,
    }),
  );

  assert.equal(envelope.status, "error");
  assert.equal(envelope.code, "STUDIO_RUNTIME_ERROR");
  assert.equal(envelope.message, "Cannot load studio runtime.");
});

test("createStudioActionCatalogAdapter lists actions from /api/v1/actions", async () => {
  const adapter = createStudioActionCatalogAdapter("http://localhost", {
    fetcher: async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "http://localhost/api/v1/actions");
      assert.equal(init?.method, "GET");

      const payload: ActionCatalogItem[] = [
        {
          id: "content.list",
          kind: "query",
          method: "GET",
          path: "/api/v1/content",
          permissions: ["content:read"],
        },
      ];

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await adapter.list();

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "content.list");
});

test("createStudioActionCatalogAdapter resolves detail and validates shape", async () => {
  const adapter = createStudioActionCatalogAdapter("http://localhost", {
    fetcher: async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(
        String(input),
        "http://localhost/api/v1/actions/content.publish",
      );
      assert.equal(init?.method, "GET");

      return new Response(
        JSON.stringify({
          id: "content.publish",
          kind: "command",
          method: "POST",
          path: "/api/v1/content/:id/publish",
          permissions: ["content:publish"],
        } satisfies ActionCatalogItem),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await adapter.getById("content.publish");
  assert.equal(result.id, "content.publish");
});

test("Studio renders deterministic embed shell marker", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
  });

  assert.equal(typeof node, "object");
  assert.equal(node.props["data-testid"], "mdcms-studio-root");
  assert.equal(node.props["data-mdcms-project"], "marketing-site");
  assert.equal(node.props["data-mdcms-server-url"], "http://localhost:4000");
  assert.equal(node.props["data-mdcms-brand"], "MDCMS");
  assert.equal(node.props["data-mdcms-state"], "ready");
  assert.equal(node.props["data-mdcms-role"], "viewer");
});

test("Studio supports loading shell state", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "loading",
  });

  assert.equal(node.props["data-mdcms-state"], "loading");
  assert.equal(
    node.props.children[0].props.children[0].props.children[2].props.children,
    "Loading Studio...",
  );
});

test("Studio supports forbidden shell state", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "forbidden",
  });

  assert.equal(node.props["data-mdcms-state"], "forbidden");
  assert.equal(
    node.props.children[1].props.children,
    "You do not have permission to access Studio.",
  );
});

test("Studio supports error shell state with custom message", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "error",
    errorMessage: "Bootstrap request failed.",
  });

  assert.equal(node.props["data-mdcms-state"], "error");
  assert.equal(
    node.props.children[1].props.children,
    "Bootstrap request failed.",
  );
});

test("Studio supports empty shell state", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "empty",
  });

  assert.equal(node.props["data-mdcms-state"], "empty");
  assert.equal(
    node.props.children[1].props.children,
    "No content found for this route.",
  );
});

test("Studio enforces viewer-safe interaction constraints", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "viewer",
  });
  const createButton = findNodeByDataAction(node, "create-content");
  const publishButton = findNodeByDataAction(node, "publish-content");

  assert.equal(node.props["data-mdcms-can-write"], "false");
  assert.equal(node.props["data-mdcms-can-publish"], "false");
  assert.equal(createButton?.props?.disabled, true);
  assert.equal(publishButton?.props?.disabled, true);
});

test("Studio enables editing actions for editor role", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "editor",
  });
  const createButton = findNodeByDataAction(node, "create-content");
  const publishButton = findNodeByDataAction(node, "publish-content");

  assert.equal(node.props["data-mdcms-can-write"], "true");
  assert.equal(node.props["data-mdcms-can-publish"], "true");
  assert.equal(createButton?.props?.disabled, false);
  assert.equal(publishButton?.props?.disabled, false);
});

test("Studio resolves content route from catch-all path segments", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "editor",
    path: ["content", "posts"],
  });

  assert.equal(node.props["data-mdcms-route"], "content");
  assert.equal(node.props["data-mdcms-state"], "ready");
  assert.equal(node.props["data-mdcms-content-view"], "schema");
});

test("Studio enforces admin-only route access for users/settings", () => {
  const editorNode = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "editor",
    path: ["users"],
  });
  const adminNode = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "admin",
    path: ["users"],
  });

  assert.equal(editorNode.props["data-mdcms-state"], "forbidden");
  assert.equal(adminNode.props["data-mdcms-state"], "ready");
});

test("Studio supports schema and folder-path content navigation modes", () => {
  const schemaNode = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "editor",
    path: ["content"],
  });
  const folderNode = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "editor",
    path: ["content", "by-path", "blog"],
  });

  assert.equal(schemaNode.props["data-mdcms-content-view"], "schema");
  assert.equal(folderNode.props["data-mdcms-content-view"], "folder");

  const schemaOption = findNodeByProp(
    schemaNode,
    "data-mdcms-content-view-option",
    "schema",
  );
  const folderOption = findNodeByProp(
    folderNode,
    "data-mdcms-content-view-option",
    "folder",
  );

  assert.equal(schemaOption?.props?.["data-mdcms-content-view-active"], "true");
  assert.equal(folderOption?.props?.["data-mdcms-content-view-active"], "true");
});

test("loadStudioDocumentShell fetches draft content with scoped headers", async () => {
  const result = await loadStudioDocumentShell(
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
      fetcher: async (input, init) => {
        assert.equal(
          String(input),
          "http://localhost:4000/api/v1/content/11111111-1111-4111-8111-111111111111?draft=true",
        );
        assert.equal(
          (init?.headers as Record<string, string>)["x-mdcms-project"],
          "marketing-site",
        );
        assert.equal(
          (init?.headers as Record<string, string>)["x-mdcms-environment"],
          "staging",
        );
        assert.equal(
          (init?.headers as Record<string, string>)["x-mdcms-locale"],
          "en",
        );

        return new Response(
          JSON.stringify({
            data: {
              documentId: "11111111-1111-4111-8111-111111111111",
              type: "BlogPost",
              locale: "en",
              path: "blog/launch-notes",
              body: "# Launch Notes",
              updatedAt: "2026-03-04T10:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    },
  );

  assert.equal(result.state, "ready");
  assert.equal(result.data?.path, "blog/launch-notes");
});

test("Studio renders document shell state for content document routes", () => {
  const node = Studio({
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    state: "ready",
    role: "editor",
    path: ["content", "BlogPost", "11111111-1111-4111-8111-111111111111"],
    documentShell: {
      state: "ready",
      type: "BlogPost",
      documentId: "11111111-1111-4111-8111-111111111111",
      locale: "en",
      data: {
        path: "blog/launch-notes",
        body: "# Launch Notes",
        updatedAt: "2026-03-04T10:00:00.000Z",
      },
    },
  });

  assert.equal(node.props["data-mdcms-route"], "content");
  assert.equal(node.props["data-mdcms-document-shell"], undefined);
  const documentShellNode = findNodeByProp(
    node,
    "data-mdcms-document-shell",
    "true",
  );
  assert.ok(documentShellNode);
  assert.equal(
    documentShellNode?.props?.["data-mdcms-editor-engine"],
    "tiptap-markdown",
  );
});
