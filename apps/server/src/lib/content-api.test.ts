import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { documentVersions } from "./db/schema.js";
import { createServerRequestHandler } from "./server.js";
import { createServerRequestHandlerWithModules } from "./runtime-with-modules.js";
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

const dbEnv = {
  ...baseEnv,
  DATABASE_URL: "postgres://mdcms:mdcms@localhost:5432/mdcms",
} as NodeJS.ProcessEnv;

const logger = createConsoleLogger({
  level: "error",
  sink: () => undefined,
});

async function canConnectToDatabase(): Promise<boolean> {
  const client = postgres(dbEnv.DATABASE_URL ?? "", {
    onnotice: () => undefined,
    connect_timeout: 1,
    max: 1,
  });

  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 });
  }
}

const dbAvailable = await canConnectToDatabase();
const testWithDatabase = dbAvailable ? test : test.skip;

const scopeHeaders = {
  "x-mdcms-project": "marketing-site",
  "x-mdcms-environment": "production",
};

function createHandler() {
  const store = createInMemoryContentStore();

  return createServerRequestHandler({
    env: baseEnv,
    configureApp: (app) => {
      mountContentApiRoutes(app, {
        store,
        authorize: async () => undefined,
      });
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
      "http://localhost/api/v1/content?draft=true&type=BlogPost&path=blog/&limit=1&offset=1&sort=path&order=asc",
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

test("content API supports draft/publish/unpublish lifecycle", async () => {
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

  const getPublishedBeforePublishResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  assert.equal(getPublishedBeforePublishResponse.status, 404);

  const getDraftResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}?draft=true`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  assert.equal(getDraftResponse.status, 200);

  const publishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          change_summary: "Initial publish",
        }),
      },
    ),
  );
  const published = (await publishResponse.json()) as {
    data: {
      publishedVersion: number | null;
      version: number;
      hasUnpublishedChanges: boolean;
    };
  };

  assert.equal(publishResponse.status, 200);
  assert.equal(published.data.publishedVersion, 1);
  assert.equal(published.data.version, 1);
  assert.equal(published.data.hasUnpublishedChanges, false);

  const getPublishedAfterPublishResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  assert.equal(getPublishedAfterPublishResponse.status, 200);

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
    data: {
      path: string;
      draftRevision: number;
      hasUnpublishedChanges: boolean;
    };
  };

  assert.equal(updateResponse.status, 200);
  assert.equal(updated.data.path, "blog/hello-world-updated");
  assert.equal(updated.data.draftRevision, 2);
  assert.equal(updated.data.hasUnpublishedChanges, true);

  const getPublishedAfterDraftEditResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  const getPublishedAfterDraftEditBody =
    (await getPublishedAfterDraftEditResponse.json()) as {
      data: { path: string; body: string };
    };

  assert.equal(getPublishedAfterDraftEditResponse.status, 200);
  assert.equal(getPublishedAfterDraftEditBody.data.path, "blog/hello-world");
  assert.equal(getPublishedAfterDraftEditBody.data.body, "hello");

  const unpublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/unpublish`,
      {
        method: "POST",
        headers: scopeHeaders,
      },
    ),
  );
  const unpublished = (await unpublishResponse.json()) as {
    data: { publishedVersion: number | null; hasUnpublishedChanges: boolean };
  };

  assert.equal(unpublishResponse.status, 200);
  assert.equal(unpublished.data.publishedVersion, null);
  assert.equal(unpublished.data.hasUnpublishedChanges, true);

  const getPublishedAfterUnpublishResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  const getPublishedAfterUnpublishBody =
    (await getPublishedAfterUnpublishResponse.json()) as {
      code: string;
    };

  assert.equal(getPublishedAfterUnpublishResponse.status, 404);
  assert.equal(getPublishedAfterUnpublishBody.code, "NOT_FOUND");

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

  const malformedLimitResponse = await handler(
    new Request("http://localhost/api/v1/content?limit=1abc", {
      headers: scopeHeaders,
    }),
  );
  const malformedLimitBody = (await malformedLimitResponse.json()) as {
    code: string;
  };

  assert.equal(malformedLimitResponse.status, 400);
  assert.equal(malformedLimitBody.code, "INVALID_QUERY_PARAM");

  const missingScopeResponse = await handler(
    new Request("http://localhost/api/v1/content"),
  );
  const missingScopeBody = (await missingScopeResponse.json()) as {
    code: string;
  };

  assert.equal(missingScopeResponse.status, 400);
  assert.equal(missingScopeBody.code, "MISSING_TARGET_ROUTING");
});

testWithDatabase(
  "content API publish persists change_summary to immutable document_versions row",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const email = `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mdcms.local`;
    const password = "Admin12345!";

    try {
      const signUpResponse = await handler(
        new Request("http://localhost/api/v1/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            name: "Content User",
          }),
        }),
      );
      assert.equal(signUpResponse.status, 200);

      const loginResponse = await handler(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }),
      );
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get("set-cookie");
      assert.ok(cookie);

      const createResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/change-summary-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "change-summary" },
            body: "body",
          }),
        }),
      );
      const created = (await createResponse.json()) as {
        data: { documentId: string };
      };
      assert.equal(createResponse.status, 200);

      const publishResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${created.data.documentId}/publish`,
          {
            method: "POST",
            headers: {
              ...scopeHeaders,
              cookie,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              change_summary: "Ship release v1",
            }),
          },
        ),
      );
      assert.equal(publishResponse.status, 200);

      const versionRows = await dbConnection.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, created.data.documentId));

      assert.equal(versionRows.length, 1);
      assert.equal(versionRows[0]?.changeSummary, "Ship release v1");
      assert.equal(versionRows[0]?.version, 1);
    } finally {
      await dbConnection.close();
    }
  },
);
