import assert from "node:assert/strict";
import { test } from "node:test";

import { createServerRequestHandler } from "./server.js";
import {
  createInMemoryContentStore,
  mountContentApiRoutes,
} from "./content-api.js";

const baseEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
} as NodeJS.ProcessEnv;

const scopeHeaders = {
  "x-mdcms-project": "marketing-site",
  "x-mdcms-environment": "production",
};

function createHandler() {
  const store = createInMemoryContentStore();

  return createServerRequestHandler({
    env: baseEnv,
    configureApp: (app) => {
      mountContentApiRoutes(app, { store });
    },
    now: () => new Date("2026-03-02T10:00:00.000Z"),
  });
}

test("content API supports create/list filters/sort/pagination", async () => {
  const handler = createHandler();

  const createBodies = [
    {
      path: "blog/alpha",
      type: "BlogPost",
      locale: "en",
      format: "md",
      frontmatter: { slug: "alpha" },
      body: "alpha body",
    },
    {
      path: "blog/beta",
      type: "BlogPost",
      locale: "fr",
      format: "mdx",
      frontmatter: { slug: "beta" },
      body: "beta body",
    },
    {
      path: "page/about",
      type: "Page",
      locale: "en",
      format: "md",
      frontmatter: { slug: "about" },
      body: "about body",
    },
  ];

  for (const payload of createBodies) {
    const response = await handler(
      new Request("http://localhost/api/v1/content", {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
    );

    assert.equal(response.status, 200);
  }

  const response = await handler(
    new Request(
      "http://localhost/api/v1/content?type=BlogPost&path=blog/&limit=1&offset=1&sort=path&order=asc",
      {
        headers: scopeHeaders,
      },
    ),
  );
  const body = (await response.json()) as {
    data: Array<{ path: string; type: string }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.pagination.total, 2);
  assert.equal(body.pagination.limit, 1);
  assert.equal(body.pagination.offset, 1);
  assert.equal(body.pagination.hasMore, false);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0]?.path, "blog/beta");
  assert.equal(body.data[0]?.type, "BlogPost");
});

test("content API supports get/update/delete lifecycle", async () => {
  const handler = createHandler();

  const createResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/hello-world",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "hello-world", title: "Hello World" },
        body: "hello",
      }),
    }),
  );
  const created = (await createResponse.json()) as {
    data: { documentId: string };
  };

  assert.equal(createResponse.status, 200);
  assert.ok(created.data.documentId);

  const getResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  assert.equal(getResponse.status, 200);

  const updateResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      method: "PUT",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/hello-world-updated",
        body: "updated body",
      }),
    }),
  );
  const updated = (await updateResponse.json()) as {
    data: { path: string; draftRevision: number; hasUnpublishedChanges: boolean };
  };

  assert.equal(updateResponse.status, 200);
  assert.equal(updated.data.path, "blog/hello-world-updated");
  assert.equal(updated.data.draftRevision, 2);
  assert.equal(updated.data.hasUnpublishedChanges, true);

  const deleteResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      method: "DELETE",
      headers: scopeHeaders,
    }),
  );
  const deleted = (await deleteResponse.json()) as {
    data: { isDeleted: boolean };
  };

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleted.data.isDeleted, true);

  const getDeletedResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  const getDeletedBody = (await getDeletedResponse.json()) as {
    code: string;
  };

  assert.equal(getDeletedResponse.status, 404);
  assert.equal(getDeletedBody.code, "NOT_FOUND");
});

test("content API enforces list query validation and routing requirements", async () => {
  const handler = createHandler();

  const invalidLimitResponse = await handler(
    new Request("http://localhost/api/v1/content?limit=999", {
      headers: scopeHeaders,
    }),
  );
  const invalidLimitBody = (await invalidLimitResponse.json()) as {
    code: string;
  };

  assert.equal(invalidLimitResponse.status, 400);
  assert.equal(invalidLimitBody.code, "INVALID_QUERY_PARAM");

  const missingScopeResponse = await handler(
    new Request("http://localhost/api/v1/content"),
  );
  const missingScopeBody = (await missingScopeResponse.json()) as {
    code: string;
  };

  assert.equal(missingScopeResponse.status, 400);
  assert.equal(missingScopeBody.code, "MISSING_TARGET_ROUTING");
});
