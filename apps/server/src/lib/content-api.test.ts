import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import type { DrizzleDatabase } from "./db.js";
import {
  documents,
  documentVersions,
  rbacGrants,
  schemaRegistryEntries,
  schemaSyncs,
} from "./db/schema.js";
import { createServerRequestHandler } from "./server.js";
import { createServerRequestHandlerWithModules } from "./runtime-with-modules.js";
import {
  createDatabaseContentStore,
  createInMemoryContentStore,
  mountContentApiRoutes,
} from "./content-api.js";
import { resolveProjectEnvironmentScope } from "./project-provisioning.js";

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

type TestServerHandlerFactory = (
  options?: Parameters<typeof createServerRequestHandlerWithModules>[0],
) => {
  handler: ReturnType<typeof createServerRequestHandler>;
  dbConnection: {
    db: DrizzleDatabase;
    close: () => Promise<void>;
  };
};

async function createDatabaseTestContext(
  source: string,
  createHandlerWithModules: TestServerHandlerFactory = createServerRequestHandlerWithModules,
) {
  const { handler, dbConnection } = createHandlerWithModules({
    env: dbEnv,
    logger,
  });
  const safeSource = source.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const email = `content-${safeSource}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mdcms.local`;
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
    const loginBody = (await loginResponse.json()) as {
      data: {
        session: {
          userId: string;
        };
      };
    };

    assert.equal(loginResponse.status, 200);

    const cookie = loginResponse.headers.get("set-cookie");
    assert.ok(cookie);

    await dbConnection.db
      .insert(rbacGrants)
      .values({
        userId: loginBody.data.session.userId,
        role: "owner",
        scopeKind: "global",
        source,
        createdByUserId: loginBody.data.session.userId,
      })
      .onConflictDoNothing();

    return {
      handler,
      dbConnection,
      cookie,
    };
  } catch (error) {
    await dbConnection.close();
    throw error;
  }
}

async function seedSchemaRegistryScope(
  db: DrizzleDatabase,
  input: {
    scope: { project: string; environment: string };
    supportedLocales?: string[];
    entries: Array<{
      type: string;
      directory: string;
      localized: boolean;
    }>;
  },
) {
  const resolvedScope = await resolveProjectEnvironmentScope(db, {
    project: input.scope.project,
    environment: input.scope.environment,
    createIfMissing: true,
  });

  assert.ok(resolvedScope);

  const schemaHash = `cms20-${randomUUID()}`;
  const syncedAt = new Date();
  const rawConfigSnapshot = {
    project: input.scope.project,
    ...(input.supportedLocales
      ? {
          locales: {
            default: input.supportedLocales[0],
            supported: input.supportedLocales,
          },
        }
      : {}),
  };

  await db
    .insert(schemaSyncs)
    .values({
      projectId: resolvedScope.project.id,
      environmentId: resolvedScope.environment.id,
      schemaHash,
      rawConfigSnapshot,
      extractedComponents: null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: [schemaSyncs.projectId, schemaSyncs.environmentId],
      set: {
        schemaHash,
        rawConfigSnapshot,
        extractedComponents: null,
        syncedAt,
      },
    });

  for (const entry of input.entries) {
    const resolvedSchema = {
      type: entry.type,
      directory: entry.directory,
      localized: entry.localized,
      fields: {},
    };

    await db
      .insert(schemaRegistryEntries)
      .values({
        projectId: resolvedScope.project.id,
        environmentId: resolvedScope.environment.id,
        schemaType: entry.type,
        directory: entry.directory,
        localized: entry.localized,
        schemaHash,
        resolvedSchema,
        syncedAt,
      })
      .onConflictDoUpdate({
        target: [
          schemaRegistryEntries.projectId,
          schemaRegistryEntries.environmentId,
          schemaRegistryEntries.schemaType,
        ],
        set: {
          directory: entry.directory,
          localized: entry.localized,
          schemaHash,
          resolvedSchema,
          syncedAt,
        },
      });
  }
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

test("content API creates a locale variant from sourceDocumentId with a fresh documentId", async () => {
  const handler = createHandler();

  const sourceCreateResponse = await handler(
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
        frontmatter: { slug: "hello-world" },
        body: "hello world",
      }),
    }),
  );
  const sourceCreated = (await sourceCreateResponse.json()) as {
    data: { documentId: string; translationGroupId: string };
  };

  assert.equal(sourceCreateResponse.status, 200);

  const variantCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/hello-world",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "bonjour-le-monde" },
        body: "bonjour le monde",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  const variantCreated = (await variantCreateResponse.json()) as {
    data: { documentId: string; translationGroupId: string; locale: string };
  };

  assert.equal(variantCreateResponse.status, 200);
  assert.notEqual(
    variantCreated.data.documentId,
    sourceCreated.data.documentId,
  );
  assert.equal(
    variantCreated.data.translationGroupId,
    sourceCreated.data.translationGroupId,
  );
  assert.equal(variantCreated.data.locale, "fr");
});

test("content API rejects duplicate locale variants in the same translation group", async () => {
  const handler = createHandler();

  const sourceCreateResponse = await handler(
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
        frontmatter: { slug: "hello-world" },
        body: "hello world",
      }),
    }),
  );
  const sourceCreated = (await sourceCreateResponse.json()) as {
    data: { documentId: string };
  };

  assert.equal(sourceCreateResponse.status, 200);

  const firstVariantResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/bonjour-le-monde",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "bonjour-le-monde" },
        body: "bonjour le monde",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );

  assert.equal(firstVariantResponse.status, 200);

  const duplicateVariantResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/salut-le-monde",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "salut-le-monde" },
        body: "salut le monde",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  const duplicateVariantBody = (await duplicateVariantResponse.json()) as {
    code: string;
  };

  assert.equal(duplicateVariantResponse.status, 409);
  assert.equal(duplicateVariantBody.code, "TRANSLATION_VARIANT_CONFLICT");
});

test("content API returns CONTENT_PATH_CONFLICT before translation variant conflict in memory create", async () => {
  const handler = createHandler();

  const sourceCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/path-conflict-source",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "path-conflict-source" },
        body: "source body",
      }),
    }),
  );
  const sourceCreated = (await sourceCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(sourceCreateResponse.status, 200);

  const existingLocaleResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/path-conflict-target",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "path-conflict-target" },
        body: "existing body",
      }),
    }),
  );
  assert.equal(existingLocaleResponse.status, 200);

  const variantCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/path-conflict-target",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "variant-path-conflict-target" },
        body: "variant body",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  const variantCreateBody = (await variantCreateResponse.json()) as {
    code: string;
  };

  assert.equal(variantCreateResponse.status, 409);
  assert.equal(variantCreateBody.code, "CONTENT_PATH_CONFLICT");
});

test("content API returns NOT_FOUND for missing sourceDocumentId in memory create", async () => {
  const handler = createHandler();

  const response = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/missing-source",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "missing-source" },
        body: "body",
        sourceDocumentId: "00000000-0000-0000-0000-000000000123",
      }),
    }),
  );
  const responseBody = (await response.json()) as {
    code: string;
  };

  assert.equal(response.status, 404);
  assert.equal(responseBody.code, "NOT_FOUND");
});

test("content API returns NOT_FOUND for soft-deleted sourceDocumentId in memory create", async () => {
  const handler = createHandler();

  const sourceCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/deleted-source",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "deleted-source" },
        body: "source body",
      }),
    }),
  );
  const sourceCreated = (await sourceCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(sourceCreateResponse.status, 200);

  const deleteResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${sourceCreated.data.documentId}`,
      {
        method: "DELETE",
        headers: scopeHeaders,
      },
    ),
  );
  assert.equal(deleteResponse.status, 200);

  const response = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/deleted-source-variant",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "deleted-source-variant" },
        body: "variant body",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  const responseBody = (await response.json()) as {
    code: string;
  };

  assert.equal(response.status, 404);
  assert.equal(responseBody.code, "NOT_FOUND");
});

test("content API returns INVALID_INPUT for source type mismatch in memory create", async () => {
  const handler = createHandler();

  const sourceCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/type-mismatch-source",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "type-mismatch-source" },
        body: "source body",
      }),
    }),
  );
  const sourceCreated = (await sourceCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(sourceCreateResponse.status, 200);

  const response = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "page/type-mismatch-variant",
        type: "Page",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "type-mismatch-variant" },
        body: "variant body",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  const responseBody = (await response.json()) as {
    code: string;
  };

  assert.equal(response.status, 400);
  assert.equal(responseBody.code, "INVALID_INPUT");
});

test("content API returns TRANSLATION_VARIANT_CONFLICT for in-memory variant locale collisions on update", async () => {
  const handler = createHandler();

  const sourceCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/update-source",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "update-source" },
        body: "source body",
      }),
    }),
  );
  const sourceCreated = (await sourceCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(sourceCreateResponse.status, 200);

  const frVariantResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/update-fr",
        type: "BlogPost",
        locale: "fr",
        format: "md",
        frontmatter: { slug: "update-fr" },
        body: "fr body",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  assert.equal(frVariantResponse.status, 200);

  const deVariantResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/update-de",
        type: "BlogPost",
        locale: "de",
        format: "md",
        frontmatter: { slug: "update-de" },
        body: "de body",
        sourceDocumentId: sourceCreated.data.documentId,
      }),
    }),
  );
  const deVariantCreated = (await deVariantResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(deVariantResponse.status, 200);

  const updateResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${deVariantCreated.data.documentId}`,
      {
        method: "PUT",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          locale: "fr",
        }),
      },
    ),
  );
  const updateBody = (await updateResponse.json()) as {
    code: string;
  };

  assert.equal(updateResponse.status, 409);
  assert.equal(updateBody.code, "TRANSLATION_VARIANT_CONFLICT");
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

test("createDatabaseTestContext closes dbConnection if setup fails before returning", async () => {
  let closed = false;

  await assert.rejects(() =>
    createDatabaseTestContext("test:content-api-db-setup-failure", () => ({
      handler: async () =>
        new Response(JSON.stringify({ code: "INVALID_INPUT" }), {
          status: 400,
          headers: {
            "content-type": "application/json",
          },
        }),
      dbConnection: {
        db: {} as any,
        close: async () => {
          closed = true;
        },
      },
    })),
  );

  assert.equal(closed, true);
});

testWithDatabase(
  "database content store prefers CONTENT_PATH_CONFLICT over translation conflict after a wrapped insert-time race",
  async () => {
    const { dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const scope = {
      project: `race-path-precedence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      environment: "production",
    };

    try {
      const sourceStore = createDatabaseContentStore({ db: dbConnection.db });
      const sourceDocument = await sourceStore.create(scope, {
        path: `blog/race-source-${Date.now()}`,
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "race-source" },
        body: "source body",
      });

      const wrappedDb = Object.assign(Object.create(dbConnection.db), {
        query: dbConnection.db.query,
        transaction: dbConnection.db.transaction.bind(dbConnection.db),
        insert: (table: unknown) => {
          if (table === documents) {
            return {
              values: (values: typeof documents.$inferInsert) => ({
                returning: async () => {
                  await dbConnection.db
                    .insert(documents)
                    .values({
                      ...values,
                      documentId: randomUUID(),
                    })
                    .returning();

                  const error = new Error("duplicate", {
                    cause: {
                      code: "23505",
                      constraint_name:
                        "uniq_documents_active_translation_locale",
                    },
                  });
                  throw error;
                },
              }),
            };
          }

          return dbConnection.db.insert(table as any);
        },
      });

      const store = createDatabaseContentStore({
        db: wrappedDb as typeof dbConnection.db,
      });

      await assert.rejects(
        () =>
          store.create(scope, {
            path: `blog/race-target-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "race-target" },
            body: "variant body",
            sourceDocumentId: sourceDocument.documentId,
          }),
        (error: unknown) => {
          assert.equal(
            (error as { code?: string }).code,
            "CONTENT_PATH_CONFLICT",
          );
          return true;
        },
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "database content store returns TRANSLATION_VARIANT_CONFLICT after a wrapped update-time locale race",
  async () => {
    const { dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const scope = {
      project: `race-update-precedence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      environment: "production",
    };

    try {
      const sourceStore = createDatabaseContentStore({ db: dbConnection.db });
      const sourceDocument = await sourceStore.create(scope, {
        path: `blog/race-update-source-${Date.now()}`,
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "race-update-source" },
        body: "source body",
      });
      const deVariant = await sourceStore.create(scope, {
        path: `blog/race-update-de-${Date.now()}`,
        type: "BlogPost",
        locale: "de",
        format: "md",
        frontmatter: { slug: "race-update-de" },
        body: "de body",
        sourceDocumentId: sourceDocument.documentId,
      });
      const sourceRow = await dbConnection.db.query.documents.findFirst({
        where: eq(documents.documentId, sourceDocument.documentId),
      });

      assert.ok(sourceRow);

      const wrappedDb = Object.assign(Object.create(dbConnection.db), {
        query: dbConnection.db.query,
        transaction: dbConnection.db.transaction.bind(dbConnection.db),
        insert: dbConnection.db.insert.bind(dbConnection.db),
        update: (table: unknown) => {
          if (table === documents) {
            return {
              set: (values: Partial<typeof documents.$inferInsert>) => ({
                where: () => ({
                  returning: async () => {
                    await dbConnection.db
                      .insert(documents)
                      .values({
                        documentId: randomUUID(),
                        translationGroupId: sourceRow.translationGroupId,
                        projectId: sourceRow.projectId,
                        environmentId: sourceRow.environmentId,
                        path: `blog/race-update-fr-competitor-${Date.now()}`,
                        schemaType: sourceRow.schemaType,
                        locale:
                          typeof values.locale === "string"
                            ? values.locale
                            : "fr",
                        contentFormat: sourceRow.contentFormat,
                        body: "fr competitor body",
                        frontmatter: { slug: "race-update-fr-competitor" },
                        isDeleted: false,
                        hasUnpublishedChanges: true,
                        publishedVersion: null,
                        draftRevision: 1,
                        createdBy: sourceRow.createdBy,
                        updatedBy: sourceRow.updatedBy,
                      })
                      .returning();

                    const error = new Error("duplicate", {
                      cause: {
                        code: "23505",
                        constraint_name:
                          "uniq_documents_active_translation_locale",
                      },
                    });
                    throw error;
                  },
                }),
              }),
            };
          }

          return dbConnection.db.update(table as any);
        },
      });

      const store = createDatabaseContentStore({
        db: wrappedDb as typeof dbConnection.db,
      });

      await assert.rejects(
        () =>
          store.update(scope, deVariant.documentId, {
            locale: "fr",
          }),
        (error: unknown) => {
          assert.equal(
            (error as { code?: string }).code,
            "TRANSLATION_VARIANT_CONFLICT",
          );
          return true;
        },
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB create reuses translationGroupId for sourceDocumentId variants",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-variant",
    );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string; translationGroupId: string };
      };

      assert.equal(sourceCreateResponse.status, 200);

      const variantCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-variant-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-variant" },
            body: "variant body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const variantCreated = (await variantCreateResponse.json()) as {
        data: { documentId: string; translationGroupId: string };
      };

      assert.equal(variantCreateResponse.status, 200);
      assert.notEqual(
        variantCreated.data.documentId,
        sourceCreated.data.documentId,
      );
      assert.equal(
        variantCreated.data.translationGroupId,
        sourceCreated.data.translationGroupId,
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB update returns TRANSLATION_VARIANT_CONFLICT for variant locale collisions",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-update-translation-conflict",
    );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-update-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-update-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string };
      };
      assert.equal(sourceCreateResponse.status, 200);

      const frVariantResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-update-fr-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-update-fr" },
            body: "fr body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      assert.equal(frVariantResponse.status, 200);

      const deVariantResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-update-de-${Date.now()}`,
            type: "BlogPost",
            locale: "de",
            format: "md",
            frontmatter: { slug: "db-update-de" },
            body: "de body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const deVariantCreated = (await deVariantResponse.json()) as {
        data: { documentId: string };
      };
      assert.equal(deVariantResponse.status, 200);

      const updateResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${deVariantCreated.data.documentId}`,
          {
            method: "PUT",
            headers: {
              ...scopeHeaders,
              cookie,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              locale: "fr",
            }),
          },
        ),
      );
      const updateBody = (await updateResponse.json()) as {
        code: string;
      };

      assert.equal(updateResponse.status, 409);
      assert.equal(updateBody.code, "TRANSLATION_VARIANT_CONFLICT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB create returns CONTENT_PATH_CONFLICT when a variant path and locale are already taken",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-path-conflict",
    );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-path-conflict-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-path-conflict-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string };
      };

      assert.equal(sourceCreateResponse.status, 200);

      const existingLocaleResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-path-conflict-target-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-path-conflict-target" },
            body: "existing body",
          }),
        }),
      );
      const existingLocaleCreated = (await existingLocaleResponse.json()) as {
        data: { path: string };
      };

      assert.equal(existingLocaleResponse.status, 200);

      const variantCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: existingLocaleCreated.data.path,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-path-conflict-variant" },
            body: "variant body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const variantCreateBody = (await variantCreateResponse.json()) as {
        code: string;
      };

      assert.equal(variantCreateResponse.status, 409);
      assert.equal(variantCreateBody.code, "CONTENT_PATH_CONFLICT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB create rejects duplicate locale variants in the same translation group",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-duplicate-locale",
    );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-duplicate-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-duplicate-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string };
      };

      assert.equal(sourceCreateResponse.status, 200);

      const firstVariantResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-duplicate-first-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-duplicate-first" },
            body: "first variant body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );

      assert.equal(firstVariantResponse.status, 200);

      const duplicateVariantResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-duplicate-second-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-duplicate-second" },
            body: "second variant body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const duplicateVariantBody = (await duplicateVariantResponse.json()) as {
        code: string;
      };

      assert.equal(duplicateVariantResponse.status, 409);
      assert.equal(duplicateVariantBody.code, "TRANSLATION_VARIANT_CONFLICT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB create returns NOT_FOUND for missing or cross-scope sourceDocumentId",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-not-found",
    );

    try {
      const missingSourceResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-missing-source-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-missing-source" },
            body: "missing source body",
            sourceDocumentId: "00000000-0000-0000-0000-000000000099",
          }),
        }),
      );
      const missingSourceBody = (await missingSourceResponse.json()) as {
        code: string;
      };

      assert.equal(missingSourceResponse.status, 404);
      assert.equal(missingSourceBody.code, "NOT_FOUND");

      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-cross-scope-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-cross-scope-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string };
      };

      assert.equal(sourceCreateResponse.status, 200);

      const docsScopeHeaders = {
        "x-mdcms-project": "docs-site",
        "x-mdcms-environment": "production",
      };
      const crossScopeVariantResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...docsScopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `docs/db-cross-scope-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-cross-scope" },
            body: "cross scope body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const crossScopeVariantBody =
        (await crossScopeVariantResponse.json()) as {
          code: string;
        };

      assert.equal(crossScopeVariantResponse.status, 404);
      assert.equal(crossScopeVariantBody.code, "NOT_FOUND");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB create returns NOT_FOUND for soft-deleted sourceDocumentId",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-soft-delete",
    );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-soft-delete-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-soft-delete-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string };
      };

      assert.equal(sourceCreateResponse.status, 200);

      const deleteSourceResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${sourceCreated.data.documentId}`,
          {
            method: "DELETE",
            headers: {
              ...scopeHeaders,
              cookie,
            },
          },
        ),
      );

      assert.equal(deleteSourceResponse.status, 200);

      const variantCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-soft-delete-variant-${Date.now()}`,
            type: "BlogPost",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-soft-delete-variant" },
            body: "variant body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const variantCreateBody = (await variantCreateResponse.json()) as {
        code: string;
      };

      assert.equal(variantCreateResponse.status, 404);
      assert.equal(variantCreateBody.code, "NOT_FOUND");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB create returns INVALID_INPUT for source type mismatch",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-db-type-mismatch",
    );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/db-type-source-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-type-source" },
            body: "source body",
          }),
        }),
      );
      const sourceCreated = (await sourceCreateResponse.json()) as {
        data: { documentId: string };
      };

      assert.equal(sourceCreateResponse.status, 200);

      const variantCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `page/db-type-mismatch-${Date.now()}`,
            type: "Page",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "db-type-mismatch" },
            body: "variant body",
            sourceDocumentId: sourceCreated.data.documentId,
          }),
        }),
      );
      const variantCreateBody = (await variantCreateResponse.json()) as {
        code: string;
      };

      assert.equal(variantCreateResponse.status, 400);
      assert.equal(variantCreateBody.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "database content store rejects sourceDocumentId for non-localized schema types",
  async () => {
    const { dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const scope = {
      project: `db-non-localized-variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      environment: "production",
    };

    try {
      await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        entries: [
          {
            type: "Author",
            directory: "content/authors",
            localized: false,
          },
        ],
      });

      const store = createDatabaseContentStore({ db: dbConnection.db });
      const sourceDocument = await store.create(scope, {
        path: `authors/non-localized-source-${Date.now()}`,
        type: "Author",
        locale: "__mdcms_default__",
        format: "md",
        frontmatter: { slug: "non-localized-source" },
        body: "author body",
      });

      await assert.rejects(
        () =>
          store.create(scope, {
            path: `authors/non-localized-variant-${Date.now()}`,
            type: "Author",
            locale: "fr",
            format: "md",
            frontmatter: { slug: "non-localized-variant" },
            body: "variant body",
            sourceDocumentId: sourceDocument.documentId,
          }),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, "INVALID_INPUT");
          return true;
        },
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "database content store rejects unsupported locales for translation variants when schema sync data is present",
  async () => {
    const { dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const scope = {
      project: `db-unsupported-locale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      environment: "production",
    };

    try {
      await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        supportedLocales: ["en", "fr"],
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });

      const store = createDatabaseContentStore({ db: dbConnection.db });
      const sourceDocument = await store.create(scope, {
        path: `blog/unsupported-locale-source-${Date.now()}`,
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "unsupported-locale-source" },
        body: "source body",
      });

      await assert.rejects(
        () =>
          store.create(scope, {
            path: `blog/unsupported-locale-variant-${Date.now()}`,
            type: "BlogPost",
            locale: "de",
            format: "md",
            frontmatter: { slug: "unsupported-locale-variant" },
            body: "variant body",
            sourceDocumentId: sourceDocument.documentId,
          }),
        (error: unknown) => {
          const runtimeError = error as {
            code?: string;
            details?: { supportedLocales?: string[] };
          };

          assert.equal(runtimeError.code, "INVALID_INPUT");
          assert.deepEqual(runtimeError.details?.supportedLocales, [
            "en",
            "fr",
          ]);
          return true;
        },
      );
    } finally {
      await dbConnection.close();
    }
  },
);

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
      const loginBody = (await loginResponse.json()) as {
        data: {
          session: {
            userId: string;
          };
        };
      };
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get("set-cookie");
      assert.ok(cookie);
      await dbConnection.db
        .insert(rbacGrants)
        .values({
          userId: loginBody.data.session.userId,
          role: "owner",
          scopeKind: "global",
          source: "test:content-api",
          createdByUserId: loginBody.data.session.userId,
        })
        .onConflictDoNothing();

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

testWithDatabase(
  "content API keeps documents isolated across routed projects",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const email = `content-scope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mdcms.local`;
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
            name: "Scoped Content User",
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
      const loginBody = (await loginResponse.json()) as {
        data: {
          session: {
            userId: string;
          };
        };
      };
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get("set-cookie");
      assert.ok(cookie);

      await dbConnection.db
        .insert(rbacGrants)
        .values({
          userId: loginBody.data.session.userId,
          role: "owner",
          scopeKind: "global",
          source: "test:content-api-scope",
          createdByUserId: loginBody.data.session.userId,
        })
        .onConflictDoNothing();

      const marketingCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/scope-marketing-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "scope-marketing" },
            body: "marketing body",
          }),
        }),
      );
      const marketingDocument = (await marketingCreateResponse.json()) as {
        data: { documentId: string };
      };
      assert.equal(marketingCreateResponse.status, 200);

      const docsScopeHeaders = {
        "x-mdcms-project": "docs-site",
        "x-mdcms-environment": "production",
      };
      const docsCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...docsScopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `docs/scope-${Date.now()}`,
            type: "Page",
            locale: "en",
            format: "md",
            frontmatter: { slug: "scope-docs" },
            body: "docs body",
          }),
        }),
      );
      assert.equal(docsCreateResponse.status, 200);

      const wrongProjectGetResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${marketingDocument.data.documentId}?draft=true`,
          {
            headers: {
              ...docsScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const wrongProjectGetBody = (await wrongProjectGetResponse.json()) as {
        code: string;
      };
      assert.equal(wrongProjectGetResponse.status, 404);
      assert.equal(wrongProjectGetBody.code, "NOT_FOUND");

      const wrongProjectDeleteResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${marketingDocument.data.documentId}`,
          {
            method: "DELETE",
            headers: {
              ...docsScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const wrongProjectDeleteBody =
        (await wrongProjectDeleteResponse.json()) as {
          code: string;
        };
      assert.equal(wrongProjectDeleteResponse.status, 404);
      assert.equal(wrongProjectDeleteBody.code, "NOT_FOUND");
    } finally {
      await dbConnection.close();
    }
  },
);
