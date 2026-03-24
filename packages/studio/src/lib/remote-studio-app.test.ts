import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ActionCatalogItem, StudioMountContext } from "@mdcms/shared";

import {
  RemoteStudioApp,
  matchStudioRoute,
  startDocumentPreview,
  stripStudioBasePath,
} from "./remote-studio-app.js";

test("stripStudioBasePath resolves internal routes under an explicit base path", () => {
  assert.equal(stripStudioBasePath("/admin", "/admin"), "/");
  assert.equal(
    stripStudioBasePath("/admin/content/posts", "/admin"),
    "/content/posts",
  );
  assert.equal(
    stripStudioBasePath("/cms/admin/content/posts", "/cms/admin"),
    "/content/posts",
  );
});

test("matchStudioRoute resolves static and parameterized routes", () => {
  assert.equal(
    matchStudioRoute("/content", [
      { id: "dashboard", path: "/" },
      { id: "content.index", path: "/content" },
      { id: "content.type", path: "/content/:type" },
      { id: "content.document", path: "/content/:type/:documentId" },
    ])?.id,
    "content.index",
  );

  assert.equal(
    matchStudioRoute("/content/posts", [
      { id: "dashboard", path: "/" },
      { id: "content.index", path: "/content" },
      { id: "content.type", path: "/content/:type" },
      { id: "content.document", path: "/content/:type/:documentId" },
    ])?.id,
    "content.type",
  );

  assert.equal(
    matchStudioRoute("/content/posts/entry-1", [
      { id: "dashboard", path: "/" },
      { id: "content.index", path: "/content" },
      { id: "content.type", path: "/content/:type" },
      { id: "content.document", path: "/content/:type/:documentId" },
      { id: "media", path: "/media" },
      { id: "schema", path: "/schema" },
      { id: "workflows", path: "/workflows" },
      { id: "api", path: "/api" },
    ])?.id,
    "content.document",
  );

  assert.equal(
    matchStudioRoute("/media", [
      { id: "dashboard", path: "/" },
      { id: "media", path: "/media" },
      { id: "schema", path: "/schema" },
      { id: "workflows", path: "/workflows" },
      { id: "api", path: "/api" },
    ])?.id,
    "media",
  );

  assert.equal(
    matchStudioRoute("/api", [
      { id: "dashboard", path: "/" },
      { id: "media", path: "/media" },
      { id: "schema", path: "/schema" },
      { id: "workflows", path: "/workflows" },
      { id: "api", path: "/api" },
    ])?.id,
    "api",
  );
});

test("startDocumentPreview calls the host bridge for document routes and cleanup runs on route change or unmount", () => {
  const previewCalls: Array<{
    componentName: string;
    props: Record<string, unknown>;
    key: string;
  }> = [];
  const cleanupCalls: string[] = [];
  const cleanup = startDocumentPreview({
    routeId: "content.document",
    container: { nodeName: "preview" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: (input) => {
        previewCalls.push({
          componentName: input.componentName,
          props: input.props,
          key: input.key,
        });

        return () => {
          cleanupCalls.push(input.key);
        };
      },
    },
  });

  assert.deepEqual(previewCalls, [
    {
      componentName: "HeroBanner",
      props: { title: "Launch" },
      key: "preview:content.document",
    },
  ]);

  cleanup?.();

  assert.deepEqual(cleanupCalls, ["preview:content.document"]);
  assert.equal(
    startDocumentPreview({
      routeId: "dashboard",
      container: { nodeName: "preview" },
      hostBridge: {
        version: "1",
        resolveComponent: () => null,
        renderMdxPreview: () => () => {},
      },
    }),
    undefined,
  );
});

test("RemoteStudioApp renders only the filtered action catalog on the document route", () => {
  const context: StudioMountContext = {
    apiBaseUrl: "http://localhost:4000",
    basePath: "/admin",
    auth: { mode: "cookie" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
    mdx: {
      catalog: {
        components: [
          {
            name: "Chart",
            importPath: "@/components/mdx/Chart",
            description: "Render a chart",
            extractedProps: {
              title: { type: "string", required: false },
            },
          },
          {
            name: "PricingTable",
            importPath: "@/components/mdx/PricingTable",
            propsEditor: "@/components/mdx/PricingTable.editor",
          },
        ],
      },
      resolvePropsEditor: (name) =>
        name === "PricingTable" ? () => null : null,
    },
  };
  const initialActions: ActionCatalogItem[] = [
    {
      id: "content.publish",
      kind: "command",
      method: "POST",
      path: "/api/v1/content/:id/publish",
      permissions: ["content:publish"],
      studio: {
        visible: true,
        label: "Publish entry",
      },
    },
    {
      id: "content.archive",
      kind: "command",
      method: "POST",
      path: "/api/v1/content/:id/archive",
      permissions: ["content:write"],
      studio: {
        visible: true,
        label: "Archive entry",
      },
    },
  ];

  const markup = renderToStaticMarkup(
    createElement(RemoteStudioApp, {
      context,
      initialPathname: "/admin/content/posts/entry-1",
      initialActions,
    }),
  );

  assert.match(markup, /data-mdcms-action-id="content.publish"/);
  assert.match(markup, />Publish</);
  assert.match(markup, /data-mdcms-action-id="content.archive"/);
  assert.match(markup, />Archive entry</);
  assert.doesNotMatch(markup, /content\.hidden/);
  assert.match(markup, /data-mdcms-preview-surface="content.document"/);
  assert.match(markup, /data-mdcms-mdx-component="Chart"/);
  assert.match(markup, /data-mdcms-mdx-component="PricingTable"/);
  assert.match(markup, /data-mdcms-mdx-auto-form="Chart"/);
  assert.match(markup, /data-mdcms-mdx-props-editor="PricingTable"/);
});

test("RemoteStudioApp renders the expanded admin route surfaces", () => {
  const context: StudioMountContext = {
    apiBaseUrl: "http://localhost:4000",
    basePath: "/admin",
    auth: { mode: "cookie" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
  };

  const apiMarkup = renderToStaticMarkup(
    createElement(RemoteStudioApp, {
      context,
      initialPathname: "/admin/api",
      initialActions: [],
    }),
  );
  const mediaMarkup = renderToStaticMarkup(
    createElement(RemoteStudioApp, {
      context,
      initialPathname: "/admin/media",
      initialActions: [],
    }),
  );
  const schemaMarkup = renderToStaticMarkup(
    createElement(RemoteStudioApp, {
      context,
      initialPathname: "/admin/schema",
      initialActions: [],
    }),
  );
  const workflowsMarkup = renderToStaticMarkup(
    createElement(RemoteStudioApp, {
      context,
      initialPathname: "/admin/workflows",
      initialActions: [],
    }),
  );

  assert.match(apiMarkup, /API Playground/);
  assert.match(mediaMarkup, /Media Library/);
  assert.match(schemaMarkup, /Schema Builder/);
  assert.match(workflowsMarkup, /Workflows/);
});
