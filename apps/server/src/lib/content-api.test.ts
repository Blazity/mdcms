import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createConsoleLogger } from "@mdcms/shared";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import type { ContentWritePayload } from "./content-api/types.js";
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
import { CONTENT_SCHEMA_HASH_HEADER } from "./content-api/schema-hash.js";
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

function splitSetCookieHeader(header: string): string[] {
  return header
    .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function toCookieHeader(setCookie: string): string {
  return splitSetCookieHeader(setCookie)
    .map((value) => value.split(";")[0]?.trim() ?? "")
    .filter((value) => value.length > 0)
    .join("; ");
}

function extractCookieValue(
  setCookie: string,
  name: string,
): string | undefined {
  return splitSetCookieHeader(setCookie)
    .map((value) => value.split(";")[0]?.trim() ?? "")
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function createCsrfHeaders(
  session: {
    cookie: string;
    setCookie: string;
  },
  headers: Record<string, string> = {},
): Record<string, string> {
  const csrfToken = extractCookieValue(session.setCookie, "mdcms_csrf");
  assert.ok(csrfToken);

  return {
    cookie: session.cookie,
    "x-mdcms-csrf-token": csrfToken,
    ...headers,
  };
}

const inMemorySchemaHash = "cms29-in-memory-schema-hash";

function isContentWriteRoute(request: Request): boolean {
  const url = new URL(request.url);

  return (
    (request.method === "POST" && url.pathname === "/api/v1/content") ||
    (request.method === "PUT" &&
      /^\/api\/v1\/content\/[^/]+$/.test(url.pathname))
  );
}

async function withSchemaHashHeader(
  request: Request,
  schemaHash: string,
): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.set(CONTENT_SCHEMA_HASH_HEADER, schemaHash);
  const bodyText = await request.clone().text();

  return new Request(request.url, {
    method: request.method,
    headers,
    body: bodyText.length > 0 ? bodyText : undefined,
  });
}

function wrapHandlerWithAutoSchemaHash(
  rawHandler: ReturnType<typeof createServerRequestHandler>,
  resolveSchemaHash: (
    request: Request,
  ) => Promise<string | undefined> | string | undefined,
): ReturnType<typeof createServerRequestHandler> {
  return async (request: Request): Promise<Response> => {
    if (
      !isContentWriteRoute(request) ||
      request.headers.has(CONTENT_SCHEMA_HASH_HEADER)
    ) {
      return rawHandler(request);
    }

    const schemaHash = await resolveSchemaHash(request);

    if (!schemaHash) {
      return rawHandler(request);
    }

    return rawHandler(await withSchemaHashHeader(request, schemaHash));
  };
}

function createHandler() {
  const store = createInMemoryContentStore({
    schemaScopes: [
      {
        project: scopeHeaders["x-mdcms-project"],
        environment: scopeHeaders["x-mdcms-environment"],
        schemas: createCms26ResolvedSchemas(),
      },
    ],
  });
  const rawHandler = createServerRequestHandler({
    env: baseEnv,
    configureApp: (app) => {
      mountContentApiRoutes(app, {
        store,
        authorize: async () => undefined,
        requireCsrf: async () => undefined,
        getWriteSchemaSyncState: async () => ({
          schemaHash: inMemorySchemaHash,
        }),
      });
    },
    now: () => new Date("2026-03-02T10:00:00.000Z"),
  });

  return wrapHandlerWithAutoSchemaHash(rawHandler, () => inMemorySchemaHash);
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

type DatabaseTestContextOptions = {
  autoSchemaHashHeaders?: boolean;
  autoSeedWriteSchemas?: boolean;
};

const defaultWriteSchemaSeedEntries = [
  {
    type: "Author",
    directory: "content/authors",
    localized: true,
  },
  {
    type: "BlogPost",
    directory: "content/blog",
    localized: true,
  },
  {
    type: "Page",
    directory: "content/pages",
    localized: true,
  },
] as const;

async function createDatabaseTestContext(
  source: string,
  createHandlerWithModules: TestServerHandlerFactory = createServerRequestHandlerWithModules,
  contextOptions: DatabaseTestContextOptions = {},
) {
  const { handler: baseHandler, dbConnection } = createHandlerWithModules({
    env: dbEnv,
    logger,
  });
  const handler =
    contextOptions.autoSchemaHashHeaders === false
      ? baseHandler
      : wrapHandlerWithAutoSchemaHash(baseHandler, async (request) => {
          // Most legacy write tests are asserting lifecycle and scope behavior,
          // not the CMS-29 transport contract. Dedicated schema-hash tests opt
          // out of this helper and assert the public header behavior directly.
          const project = request.headers.get("x-mdcms-project")?.trim();
          const environment = request.headers
            .get("x-mdcms-environment")
            ?.trim();

          if (!project || !environment) {
            return undefined;
          }

          const scope = { project, environment };
          const resolvedScope = await resolveProjectEnvironmentScope(
            dbConnection.db,
            {
              project,
              environment,
              createIfMissing: false,
            },
          );
          let schemaHash = resolvedScope
            ? (
                await dbConnection.db.query.schemaSyncs.findFirst({
                  where: and(
                    eq(schemaSyncs.projectId, resolvedScope.project.id),
                    eq(schemaSyncs.environmentId, resolvedScope.environment.id),
                  ),
                })
              )?.schemaHash
            : undefined;

          if (!schemaHash && contextOptions.autoSeedWriteSchemas !== false) {
            schemaHash = (
              await seedSchemaRegistryScope(dbConnection.db, {
                scope,
                supportedLocales: ["en", "fr", "de"],
                entries: defaultWriteSchemaSeedEntries.map((entry) => ({
                  ...entry,
                })),
              })
            ).schemaHash;
          }

          return schemaHash;
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

    const setCookie = loginResponse.headers.get("set-cookie");
    assert.ok(setCookie);
    const cookie = toCookieHeader(setCookie);

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
      setCookie,
      userId: loginBody.data.session.userId,
      csrfHeaders: (headers: Record<string, string> = {}) =>
        createCsrfHeaders({ cookie, setCookie }, headers),
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
    schemaHash?: string;
    supportedLocales?: string[];
    entries: Array<{
      type: string;
      directory: string;
      localized: boolean;
      fields?: Record<string, unknown>;
    }>;
  },
) {
  const resolvedScope = await resolveProjectEnvironmentScope(db, {
    project: input.scope.project,
    environment: input.scope.environment,
    createIfMissing: true,
  });

  assert.ok(resolvedScope);

  const schemaHash = input.schemaHash ?? `cms20-${randomUUID()}`;
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
      fields: entry.fields ?? {},
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

  return { schemaHash };
}

const cms26BlogPostSchemaFields = {
  slug: {
    kind: "string",
    required: true,
    nullable: false,
  },
  title: {
    kind: "string",
    required: false,
    nullable: true,
  },
  author: {
    kind: "string",
    required: false,
    nullable: true,
    reference: {
      targetType: "Author",
    },
  },
  hero: {
    kind: "object",
    required: false,
    nullable: true,
    fields: {
      author: {
        kind: "string",
        required: false,
        nullable: true,
        reference: {
          targetType: "Author",
        },
      },
    },
  },
  contributors: {
    kind: "array",
    required: false,
    nullable: false,
    default: [],
    item: {
      kind: "string",
      required: true,
      nullable: false,
      reference: {
        targetType: "Author",
      },
    },
  },
  slugline: {
    kind: "string",
    required: false,
    nullable: true,
  },
};

const cms26AuthorSchemaFields = {
  name: {
    kind: "string",
    required: true,
    nullable: false,
  },
};

const cms26PageSchemaFields = {
  slug: {
    kind: "string",
    required: true,
    nullable: false,
  },
};

function createCms26ResolvedSchemas() {
  return {
    BlogPost: {
      type: "BlogPost",
      directory: "content/blog",
      localized: true,
      fields: cms26BlogPostSchemaFields,
    },
    Author: {
      type: "Author",
      directory: "content/authors",
      localized: true,
      fields: cms26AuthorSchemaFields,
    },
    Page: {
      type: "Page",
      directory: "content/pages",
      localized: true,
      fields: cms26PageSchemaFields,
    },
  };
}

async function seedCms26ReferenceSchema(
  db: DrizzleDatabase,
  scope: { project: string; environment: string },
) {
  await seedSchemaRegistryScope(db, {
    scope,
    entries: [
      {
        type: "BlogPost",
        directory: "content/blog",
        localized: true,
        fields: cms26BlogPostSchemaFields,
      },
      {
        type: "Author",
        directory: "content/authors",
        localized: true,
        fields: cms26AuthorSchemaFields,
      },
      {
        type: "Page",
        directory: "content/pages",
        localized: true,
        fields: cms26PageSchemaFields,
      },
    ],
  });
}

async function createContentDocument(
  handler: ReturnType<typeof createServerRequestHandler>,
  csrfHeaders: (headers?: Record<string, string>) => Record<string, string>,
  scopeHeaders: Record<string, string>,
  payload: ContentWritePayload,
) {
  const response = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: csrfHeaders({
        ...scopeHeaders,
        "content-type": "application/json",
      }),
      body: JSON.stringify(payload),
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  return body.data;
}

async function overwriteDraftFrontmatter(
  db: DrizzleDatabase,
  documentId: string,
  frontmatter: Record<string, unknown>,
) {
  await db
    .update(documents)
    .set({ frontmatter })
    .where(eq(documents.documentId, documentId));
}

async function createCms26Author(
  handler: ReturnType<typeof createServerRequestHandler>,
  csrfHeaders: (headers?: Record<string, string>) => Record<string, string>,
  scopeHeaders: Record<string, string>,
  slug: string,
) {
  return createContentDocument(handler, csrfHeaders, scopeHeaders, {
    path: `authors/cms26-${slug}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    type: "Author",
    locale: "en",
    format: "md",
    frontmatter: {
      slug,
      name: `${slug} author`,
    },
    body: `${slug} bio`,
  });
}

async function createCms26BlogPost(
  handler: ReturnType<typeof createServerRequestHandler>,
  csrfHeaders: (headers?: Record<string, string>) => Record<string, string>,
  scopeHeaders: Record<string, string>,
  slug: string,
  frontmatter: Record<string, unknown>,
) {
  return createContentDocument(handler, csrfHeaders, scopeHeaders, {
    path: `blog/cms26-${slug}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    type: "BlogPost",
    locale: "en",
    format: "md",
    frontmatter: {
      slug,
      ...frontmatter,
    },
    body: `${slug} body`,
  });
}

async function createCms28ReferenceWriteContext(source: string) {
  const context = await createDatabaseTestContext(source);
  const project = `cms28-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testScopeHeaders = {
    ...scopeHeaders,
    "x-mdcms-project": project,
    "x-mdcms-environment": "production",
  };
  const scope = {
    project,
    environment: testScopeHeaders["x-mdcms-environment"],
  };

  await seedCms26ReferenceSchema(context.dbConnection.db, scope);

  return {
    ...context,
    scope,
    testScopeHeaders,
  };
}

function createCms28BlogPostPayload(
  frontmatter: Record<string, unknown>,
): ContentWritePayload {
  return {
    path: `blog/cms28-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "BlogPost",
    locale: "en",
    format: "md",
    frontmatter: {
      slug: `cms28-${Math.random().toString(36).slice(2, 8)}`,
      ...frontmatter,
    },
    body: "cms28 body",
  };
}

async function publishContentDocument(
  handler: ReturnType<typeof createServerRequestHandler>,
  csrfHeaders: (headers?: Record<string, string>) => Record<string, string>,
  scopeHeaders: Record<string, string>,
  documentId: string,
) {
  const response = await handler(
    new Request(`http://localhost/api/v1/content/${documentId}/publish`, {
      method: "POST",
      headers: csrfHeaders({
        ...scopeHeaders,
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        change_summary: "cms26 publish",
      }),
    }),
  );

  assert.equal(response.status, 200);
  return (await response.json()) as {
    data: {
      version: number;
      publishedVersion: number | null;
    };
  };
}

async function deleteContentDocument(
  handler: ReturnType<typeof createServerRequestHandler>,
  csrfHeaders: (headers?: Record<string, string>) => Record<string, string>,
  scopeHeaders: Record<string, string>,
  documentId: string,
) {
  const response = await handler(
    new Request(`http://localhost/api/v1/content/${documentId}`, {
      method: "DELETE",
      headers: csrfHeaders({
        ...scopeHeaders,
      }),
    }),
  );

  assert.equal(response.status, 200);
}

testWithDatabase(
  "content API rejects session mutations without CSRF, accepts matching CSRF, and exempts API key writes",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-csrf");

    try {
      const missingHeaderResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: `blog/csrf-missing-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "csrf-missing" },
            body: "missing header",
          }),
        }),
      );
      const missingHeaderBody = (await missingHeaderResponse.json()) as {
        code: string;
      };

      assert.equal(missingHeaderResponse.status, 403);
      assert.equal(missingHeaderBody.code, "FORBIDDEN");

      const allowedSessionResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/csrf-session-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "csrf-session" },
            body: "session allowed",
          }),
        }),
      );

      assert.equal(allowedSessionResponse.status, 200);
      const resolvedScope = await resolveProjectEnvironmentScope(
        dbConnection.db,
        {
          project: scopeHeaders["x-mdcms-project"],
          environment: scopeHeaders["x-mdcms-environment"],
        },
      );
      assert.ok(resolvedScope);
      const schemaSync = await dbConnection.db.query.schemaSyncs.findFirst({
        where: and(
          eq(schemaSyncs.projectId, resolvedScope.project.id),
          eq(schemaSyncs.environmentId, resolvedScope.environment.id),
        ),
      });
      assert.ok(schemaSync);

      const apiKeyResponse = await handler(
        new Request("http://localhost/api/v1/auth/api-keys", {
          method: "POST",
          headers: csrfHeaders({
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            label: "content-csrf-write",
            scopes: ["content:write"],
            contextAllowlist: [
              { project: "marketing-site", environment: "production" },
            ],
          }),
        }),
      );
      const apiKeyBody = (await apiKeyResponse.json()) as {
        data: { key: string };
      };

      assert.equal(apiKeyResponse.status, 200);

      const apiKeyCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: {
            ...scopeHeaders,
            authorization: `Bearer ${apiKeyBody.data.key}`,
            "content-type": "application/json",
            "x-mdcms-schema-hash": schemaSync.schemaHash,
          },
          body: JSON.stringify({
            path: `blog/csrf-api-key-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "csrf-api-key" },
            body: "api key allowed",
          }),
        }),
      );

      assert.equal(apiKeyCreateResponse.status, 200);
    } finally {
      await dbConnection.close();
    }
  },
);
testWithDatabase(
  "content API create rejects missing schema hash header",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-schema-hash-required",
        createServerRequestHandlerWithModules,
        { autoSchemaHashHeaders: false },
      );
    const project = `cms29-required-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        schemaHash: "schema-hash-required",
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });

      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/schema-required-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "schema-required" },
            body: "missing schema hash",
          }),
        }),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 400);
      assert.equal(body.code, "SCHEMA_HASH_REQUIRED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API create rejects unsynced target schema on write",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-schema-not-synced");
    const project = `cms29-not-synced-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };

    try {
      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
            "x-mdcms-schema-hash": "unsynced-schema-hash",
          }),
          body: JSON.stringify({
            path: `blog/schema-not-synced-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "schema-not-synced" },
            body: "unsynced target schema",
          }),
        }),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 409);
      assert.equal(body.code, "SCHEMA_NOT_SYNCED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API create rejects mismatched schema hash header",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-schema-hash-mismatch");
    const project = `cms29-mismatch-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      const { schemaHash } = await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        schemaHash: "schema-hash-match-me",
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });

      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
            "x-mdcms-schema-hash": "schema-hash-wrong",
          }),
          body: JSON.stringify({
            path: `blog/schema-mismatch-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "schema-mismatch" },
            body: "mismatched schema hash",
          }),
        }),
      );
      const body = (await response.json()) as {
        code: string;
        details?: {
          clientSchemaHash?: string;
          serverSchemaHash?: string;
        };
      };

      assert.equal(response.status, 409);
      assert.equal(body.code, "SCHEMA_HASH_MISMATCH");
      assert.equal(body.details?.clientSchemaHash, "schema-hash-wrong");
      assert.equal(body.details?.serverSchemaHash, schemaHash);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API update rejects missing schema hash header",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-update-schema-required",
        createServerRequestHandlerWithModules,
        { autoSchemaHashHeaders: false },
      );
    const project = `cms29-update-required-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        schemaHash: "schema-hash-update",
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });

      const store = createDatabaseContentStore({ db: dbConnection.db });
      const existing = await store.create(scope, {
        path: `blog/schema-update-${Date.now()}`,
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "schema-update" },
        body: "before update",
      });

      const response = await handler(
        new Request(`http://localhost/api/v1/content/${existing.documentId}`, {
          method: "PUT",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            body: "after update",
          }),
        }),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 400);
      assert.equal(body.code, "SCHEMA_HASH_REQUIRED");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API create accepts matching schema hash header",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-schema-hash-create-match",
      );
    const project = `cms29-create-match-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      const { schemaHash } = await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        schemaHash: "schema-hash-create-match",
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });

      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
            "x-mdcms-schema-hash": schemaHash,
          }),
          body: JSON.stringify({
            path: `blog/schema-create-match-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "schema-create-match" },
            body: "matching schema hash",
          }),
        }),
      );
      const body = (await response.json()) as {
        data: {
          documentId: string;
        };
      };

      assert.equal(response.status, 200);
      assert.ok(body.data.documentId);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API update accepts matching schema hash header",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-schema-hash-update-match",
      );
    const project = `cms29-update-match-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      const { schemaHash } = await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        schemaHash: "schema-hash-update-match",
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });

      const store = createDatabaseContentStore({ db: dbConnection.db });
      const existing = await store.create(scope, {
        path: `blog/schema-update-match-${Date.now()}`,
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "schema-update-match" },
        body: "before update",
      });

      const response = await handler(
        new Request(`http://localhost/api/v1/content/${existing.documentId}`, {
          method: "PUT",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
            "x-mdcms-schema-hash": schemaHash,
          }),
          body: JSON.stringify({
            body: "after update",
          }),
        }),
      );
      const body = (await response.json()) as {
        data: {
          documentId: string;
          draftRevision: number;
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.documentId, existing.documentId);
      assert.equal(body.data.draftRevision, 2);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write create accepts valid environment-local ids",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-create-valid",
      );

    try {
      const primaryAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-primary",
      );
      const heroAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-hero",
      );
      const contributorAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-contributor",
      );

      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              author: primaryAuthor.documentId,
              hero: {
                author: heroAuthor.documentId,
              },
              contributors: [
                primaryAuthor.documentId,
                contributorAuthor.documentId,
              ],
            }),
          ),
        }),
      );
      const body = (await response.json()) as {
        data: {
          frontmatter: {
            author: string;
            hero: {
              author: string;
            };
            contributors: string[];
          };
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.frontmatter.author, primaryAuthor.documentId);
      assert.equal(body.data.frontmatter.hero.author, heroAuthor.documentId);
      assert.deepEqual(body.data.frontmatter.contributors, [
        primaryAuthor.documentId,
        contributorAuthor.documentId,
      ]);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write update accepts valid environment-local ids",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-update-valid",
      );

    try {
      const basePayload = createCms28BlogPostPayload({
        title: "before",
      });
      const created = await createContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        basePayload,
      );
      const primaryAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-update-primary",
      );
      const heroAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-update-hero",
      );
      const contributorAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-update-contributor",
      );

      const response = await handler(
        new Request(`http://localhost/api/v1/content/${created.documentId}`, {
          method: "PUT",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            frontmatter: {
              ...(basePayload.frontmatter ?? {}),
              author: primaryAuthor.documentId,
              hero: {
                author: heroAuthor.documentId,
              },
              contributors: [
                primaryAuthor.documentId,
                contributorAuthor.documentId,
              ],
            },
            body: "updated body",
          }),
        }),
      );
      const body = (await response.json()) as {
        data: {
          frontmatter: {
            author: string;
            hero: {
              author: string;
            };
            contributors: string[];
          };
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.frontmatter.author, primaryAuthor.documentId);
      assert.equal(body.data.frontmatter.hero.author, heroAuthor.documentId);
      assert.deepEqual(body.data.frontmatter.contributors, [
        primaryAuthor.documentId,
        contributorAuthor.documentId,
      ]);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write create rejects malformed uuid strings",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-malformed",
      );

    try {
      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              author: "not-a-uuid",
            }),
          ),
        }),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write create rejects non-string reference values",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-non-string",
      );

    try {
      const response = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              author: {
                documentId: randomUUID(),
              },
            }),
          ),
        }),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write create rejects missing deleted and wrong-type targets",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-target-state",
      );

    try {
      const missingResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              author: randomUUID(),
            }),
          ),
        }),
      );
      const missingBody = (await missingResponse.json()) as {
        code: string;
      };
      assert.equal(missingResponse.status, 400);
      assert.equal(missingBody.code, "INVALID_INPUT");

      const deletedAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-deleted-author",
      );
      await deleteContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        deletedAuthor.documentId as string,
      );

      const deletedResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              author: deletedAuthor.documentId,
            }),
          ),
        }),
      );
      const deletedBody = (await deletedResponse.json()) as {
        code: string;
      };
      assert.equal(deletedResponse.status, 400);
      assert.equal(deletedBody.code, "INVALID_INPUT");

      const page = await createContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        {
          path: `pages/cms28-page-${Date.now()}`,
          type: "Page",
          locale: "en",
          format: "md",
          frontmatter: {
            slug: `cms28-page-${Math.random().toString(36).slice(2, 8)}`,
          },
          body: "page body",
        },
      );

      const wrongTypeResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              author: page.documentId,
            }),
          ),
        }),
      );
      const wrongTypeBody = (await wrongTypeResponse.json()) as {
        code: string;
      };
      assert.equal(wrongTypeResponse.status, 400);
      assert.equal(wrongTypeBody.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write create rejects nested object and array violations",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-nested-array",
      );

    try {
      const validAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "cms28-array-valid",
      );

      const nestedResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              hero: {
                author: randomUUID(),
              },
            }),
          ),
        }),
      );
      const nestedBody = (await nestedResponse.json()) as {
        code: string;
      };
      assert.equal(nestedResponse.status, 400);
      assert.equal(nestedBody.code, "INVALID_INPUT");

      const arrayResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify(
            createCms28BlogPostPayload({
              contributors: [validAuthor.documentId, "not-a-uuid"],
            }),
          ),
        }),
      );
      const arrayBody = (await arrayResponse.json()) as {
        code: string;
      };
      assert.equal(arrayResponse.status, 400);
      assert.equal(arrayBody.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 reference write update rejects missing targets",
  async () => {
    const { handler, dbConnection, csrfHeaders, testScopeHeaders } =
      await createCms28ReferenceWriteContext(
        "test:cms-28-reference-write-update-invalid",
      );

    try {
      const basePayload = createCms28BlogPostPayload({
        title: "before",
      });
      const created = await createContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        basePayload,
      );

      const response = await handler(
        new Request(`http://localhost/api/v1/content/${created.documentId}`, {
          method: "PUT",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            frontmatter: {
              ...(basePayload.frontmatter ?? {}),
              author: randomUUID(),
            },
            body: "updated body",
          }),
        }),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "cms-28 database content store enforces reference identity when schema snapshots are present",
  async () => {
    const { dbConnection } = createServerRequestHandlerWithModules({
      env: dbEnv,
      logger,
    });
    const scope = {
      project: `cms28-db-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      environment: "production",
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const store = createDatabaseContentStore({ db: dbConnection.db });
      const page = await store.create(scope, {
        path: `pages/cms28-db-page-${Date.now()}`,
        type: "Page",
        locale: "en",
        format: "md",
        frontmatter: {
          slug: `cms28-db-page-${Math.random().toString(36).slice(2, 8)}`,
        },
        body: "page body",
      });
      const blogPayload = createCms28BlogPostPayload({
        title: "db base",
      });
      const blog = await store.create(scope, blogPayload);

      await assert.rejects(
        () =>
          store.create(scope, {
            ...createCms28BlogPostPayload({
              author: page.documentId,
            }),
          }),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, "INVALID_INPUT");
          return true;
        },
      );

      await assert.rejects(
        () =>
          store.update(scope, blog.documentId, {
            frontmatter: {
              ...(blogPayload.frontmatter ?? {}),
              author: randomUUID(),
            },
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

test("cms-28 in-memory content store enforces reference identity when schema snapshots are present", async () => {
  const scope = {
    project: "cms28-in-memory",
    environment: "production",
  };
  const store = createInMemoryContentStore({
    schemaScopes: [
      {
        project: scope.project,
        environment: scope.environment,
        schemas: createCms26ResolvedSchemas(),
      },
    ],
  });
  const page = await store.create(scope, {
    path: `pages/cms28-memory-page-${Date.now()}`,
    type: "Page",
    locale: "en",
    format: "md",
    frontmatter: {
      slug: `cms28-memory-page-${Math.random().toString(36).slice(2, 8)}`,
    },
    body: "page body",
  });
  const blogPayload = createCms28BlogPostPayload({
    title: "memory base",
  });
  const blog = await store.create(scope, blogPayload);

  await assert.rejects(
    () =>
      store.create(scope, {
        ...createCms28BlogPostPayload({
          author: page.documentId,
        }),
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "INVALID_INPUT");
      return true;
    },
  );

  await assert.rejects(
    () =>
      store.update(scope, blog.documentId, {
        frontmatter: {
          ...(blogPayload.frontmatter ?? {}),
          author: randomUUID(),
        },
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "INVALID_INPUT");
      return true;
    },
  );
});

testWithDatabase(
  "content API resolve list inline returns referenced authors",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-list");
    const project = `cms26-resolve-list-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const mainAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "list-primary",
      );
      const heroAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "list-hero",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-list",
        {
          author: mainAuthor.documentId as string,
          hero: { author: heroAuthor.documentId as string },
        },
      );

      const response = await handler(
        new Request(
          "http://localhost/api/v1/content?type=BlogPost&draft=true&sort=path&order=asc&resolve=author&resolve=hero.author",
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Array<Record<string, unknown>>;
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.length, 1);

      const [document] = body.data;
      assert.equal(document.documentId, blog.documentId);
      const frontmatter = document.frontmatter as Record<string, unknown>;
      const resolvedAuthor = frontmatter.author as Record<string, unknown>;
      assert.equal(resolvedAuthor?.documentId, mainAuthor.documentId);
      const hero = frontmatter.hero as Record<string, unknown> | undefined;
      const resolvedHero = hero?.author as Record<string, unknown>;
      assert.equal(resolvedHero?.documentId, heroAuthor.documentId);
      assert.equal(document.resolveErrors, undefined);
    } finally {
      await dbConnection.close();
    }
  },
);

test("content API in-memory resolve supports configured schema scopes", async () => {
  const store = createInMemoryContentStore({
    schemaScopes: [
      {
        project: scopeHeaders["x-mdcms-project"],
        environment: scopeHeaders["x-mdcms-environment"],
        schemas: createCms26ResolvedSchemas(),
      },
    ],
  });
  const rawHandler = createServerRequestHandler({
    env: baseEnv,
    configureApp: (app) => {
      mountContentApiRoutes(app, {
        store,
        authorize: async () => undefined,
        requireCsrf: async () => undefined,
        getWriteSchemaSyncState: async () => ({
          schemaHash: inMemorySchemaHash,
        }),
      });
    },
    now: () => new Date("2026-03-02T10:00:00.000Z"),
  });
  const handler = wrapHandlerWithAutoSchemaHash(
    rawHandler,
    () => inMemorySchemaHash,
  );

  const authorCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "authors/in-memory-author",
        type: "Author",
        locale: "en",
        format: "md",
        frontmatter: {
          slug: "in-memory-author",
          name: "In Memory Author",
        },
        body: "author body",
      }),
    }),
  );
  const authorCreateBody = (await authorCreateResponse.json()) as {
    data: {
      documentId: string;
    };
  };
  assert.equal(authorCreateResponse.status, 200);

  const blogCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/in-memory-resolve",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: {
          slug: "in-memory-resolve",
          author: authorCreateBody.data.documentId,
        },
        body: "blog body",
      }),
    }),
  );
  const blogCreateBody = (await blogCreateResponse.json()) as {
    data: {
      documentId: string;
    };
  };
  assert.equal(blogCreateResponse.status, 200);

  const response = await handler(
    new Request(
      `http://localhost/api/v1/content/${blogCreateBody.data.documentId}?draft=true&resolve=author`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const body = (await response.json()) as {
    data: Record<string, unknown>;
  };

  assert.equal(response.status, 200);
  const frontmatter = body.data.frontmatter as Record<string, unknown>;
  const resolvedAuthor = frontmatter.author as Record<string, unknown>;
  assert.equal(resolvedAuthor?.documentId, authorCreateBody.data.documentId);
  assert.equal(body.data.resolveErrors, undefined);
});

testWithDatabase(
  "content API resolve single document returns inline references",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-single");
    const project = `cms26-resolve-single-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const mainAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "single-primary",
      );
      const heroAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "single-hero",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-single",
        {
          author: mainAuthor.documentId as string,
          hero: { author: heroAuthor.documentId as string },
        },
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=author&resolve=hero.author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const document = body.data;
      const frontmatter = document.frontmatter as Record<string, unknown>;
      const resolvedAuthor = frontmatter.author as Record<string, unknown>;
      assert.equal(resolvedAuthor?.documentId, mainAuthor.documentId);
      const hero = frontmatter.hero as Record<string, unknown> | undefined;
      const resolvedHero = hero?.author as Record<string, unknown>;
      assert.equal(resolvedHero?.documentId, heroAuthor.documentId);
      assert.equal(document.resolveErrors, undefined);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve version detail returns inline references",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-version");
    const project = `cms26-resolve-version-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "version-primary",
      );
      await publishContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        author.documentId as string,
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-version",
        {
          author: author.documentId as string,
        },
      );
      await publishContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        blog.documentId as string,
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}/versions/1?resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      const resolvedAuthor = frontmatter.author as Record<string, unknown>;
      assert.equal(resolvedAuthor?.documentId, author.documentId);
      assert.equal(body.data.resolveErrors, undefined);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API version summary stays summary-only when resolve is requested",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-versions-summary-resolve",
      );
    const project = `cms26-resolve-summary-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "summary-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-summary",
        {
          author: author.documentId as string,
        },
      );
      await publishContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        blog.documentId as string,
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}/versions?resolve=author&limit=1`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Array<Record<string, unknown>>;
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].frontmatter, undefined);
      assert.equal(body.data[0].resolveErrors, undefined);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve rejects invalid and non-reference paths",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-invalid-path");
    const project = `cms26-resolve-invalid-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "invalid-path-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-invalid",
        {
          author: author.documentId as string,
          slugline: "not-a-reference",
        },
      );

      const invalidResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=missingField`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const invalidBody = (await invalidResponse.json()) as {
        code: string;
      };
      assert.equal(invalidResponse.status, 400);
      assert.equal(invalidBody.code, "INVALID_QUERY_PARAM");

      const nonRefResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=slugline`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const nonRefBody = (await nonRefResponse.json()) as {
        code: string;
      };
      assert.equal(nonRefResponse.status, 400);
      assert.equal(nonRefBody.code, "INVALID_QUERY_PARAM");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve list requires a type filter",
  async () => {
    const { handler, dbConnection, cookie } = await createDatabaseTestContext(
      "test:content-api-resolve-list-requires-type",
    );
    const project = `cms26-resolve-list-type-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);

      const response = await handler(
        new Request(
          "http://localhost/api/v1/content?draft=true&resolve=author",
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        code: string;
      };

      assert.equal(response.status, 400);
      assert.equal(body.code, "INVALID_QUERY_PARAM");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve missing reference records resolveErrors",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-missing");
    const project = `cms26-resolve-missing-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const heroAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "missing-hero",
      );
      const missingId = randomUUID();
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-missing",
        {
          author: heroAuthor.documentId as string,
          hero: { author: heroAuthor.documentId as string },
        },
      );
      await overwriteDraftFrontmatter(
        dbConnection.db,
        blog.documentId as string,
        {
          slug: "resolve-missing",
          author: missingId,
          hero: { author: heroAuthor.documentId as string },
        },
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=author&resolve=hero.author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const hero = frontmatter.hero as Record<string, unknown> | undefined;
      const resolvedHero = hero?.author as Record<string, unknown>;
      assert.equal(resolvedHero?.documentId, heroAuthor.documentId);

      const resolveErrors = body.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_NOT_FOUND",
      );
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.ref.documentId,
        missingId,
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve malformed reference values become null with resolveErrors",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-malformed");
    const project = `cms26-resolve-malformed-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "malformed-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-malformed",
        {
          author: author.documentId as string,
        },
      );
      await overwriteDraftFrontmatter(
        dbConnection.db,
        blog.documentId as string,
        {
          slug: "resolve-malformed",
          author: {
            bad: true,
          },
        },
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const resolveErrors = body.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_NOT_FOUND",
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve deleted reference surfaces resolveErrors",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-deleted");
    const project = `cms26-resolve-deleted-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const deletedAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "deleted-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-deleted",
        {
          hero: { author: deletedAuthor.documentId as string },
        },
      );
      await deleteContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        deletedAuthor.documentId as string,
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=hero.author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      const hero = frontmatter.hero as Record<string, unknown> | undefined;
      assert.equal(hero?.author, null);

      const resolveErrors = body.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.hero.author"]?.code,
        "REFERENCE_DELETED",
      );
      assert.equal(
        resolveErrors?.["frontmatter.hero.author"]?.ref.documentId,
        deletedAuthor.documentId,
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve hidden deleted references surface forbidden",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders, userId } =
      await createDatabaseTestContext(
        "test:content-api-resolve-hidden-deleted",
      );
    const project = `cms26-resolve-hidden-deleted-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "hidden-deleted-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "hidden-deleted-blog",
        {
          author: author.documentId as string,
        },
      );
      await deleteContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        author.documentId as string,
      );

      await dbConnection.db
        .delete(rbacGrants)
        .where(eq(rbacGrants.userId, userId));

      await dbConnection.db.insert(rbacGrants).values({
        userId,
        role: "editor",
        scopeKind: "folder_prefix",
        project,
        environment: "production",
        pathPrefix: "blog/",
        source: "test:content-api-resolve-hidden-deleted",
        createdByUserId: userId,
      });

      const response = await handler(
        new Request(
          "http://localhost/api/v1/content?type=BlogPost&draft=true&path=blog/&resolve=author",
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Array<Record<string, unknown>>;
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0]?.documentId, blog.documentId);
      const frontmatter = body.data[0]?.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const resolveErrors = body.data[0]?.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_FORBIDDEN",
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve type mismatch surfaces resolveErrors",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-type-mismatch");
    const project = `cms26-resolve-mismatch-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "mismatch-author",
      );
      const page = await createContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        {
          path: `pages/cms26-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          type: "Page",
          locale: "en",
          format: "md",
          frontmatter: {
            slug: "resolve-page-type-mismatch",
          },
          body: "page body",
        },
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-mismatch",
        {
          author: author.documentId as string,
        },
      );
      await overwriteDraftFrontmatter(
        dbConnection.db,
        blog.documentId as string,
        {
          slug: "resolve-mismatch",
          author: page.documentId as string,
        },
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const resolveErrors = body.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_TYPE_MISMATCH",
      );
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.ref.documentId,
        page.documentId,
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve forbidden reference surfaces resolveErrors on list reads",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders, userId } =
      await createDatabaseTestContext("test:content-api-resolve-forbidden");
    const project = `cms26-resolve-forbidden-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "forbidden-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-forbidden",
        {
          author: author.documentId as string,
        },
      );

      await dbConnection.db
        .delete(rbacGrants)
        .where(eq(rbacGrants.userId, userId));

      await dbConnection.db.insert(rbacGrants).values({
        userId,
        role: "editor",
        scopeKind: "folder_prefix",
        project,
        environment: "production",
        pathPrefix: "blog/",
        source: "test:content-api-resolve-forbidden",
        createdByUserId: userId,
      });

      const response = await handler(
        new Request(
          "http://localhost/api/v1/content?type=BlogPost&draft=true&path=blog/&resolve=author",
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Array<Record<string, unknown>>;
      };

      assert.equal(response.status, 200);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0]?.documentId, blog.documentId);
      const frontmatter = body.data[0]?.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const resolveErrors = body.data[0]?.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_FORBIDDEN",
      );
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.ref.documentId,
        author.documentId,
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve draft-only references publishes as not found but resolves in drafts",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-resolve-draft-only");
    const project = `cms26-resolve-draft-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const draftOnlyAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "draft-only-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-draft",
        {
          author: draftOnlyAuthor.documentId as string,
        },
      );
      await publishContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        blog.documentId as string,
      );

      const publishedResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const publishedBody = (await publishedResponse.json()) as {
        data: Record<string, unknown>;
      };
      assert.equal(publishedResponse.status, 200);
      const publishedFrontmatter = publishedBody.data.frontmatter as Record<
        string,
        unknown
      >;
      assert.equal(publishedFrontmatter.author, null);
      const publishedErrors = publishedBody.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(publishedErrors);
      assert.equal(
        publishedErrors?.["frontmatter.author"]?.code,
        "REFERENCE_NOT_FOUND",
      );

      const draftResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?draft=true&resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const draftBody = (await draftResponse.json()) as {
        data: Record<string, unknown>;
      };
      assert.equal(draftResponse.status, 200);
      const draftFrontmatter = draftBody.data.frontmatter as Record<
        string,
        unknown
      >;
      const resolvedAuthor = draftFrontmatter.author as Record<
        string,
        unknown
      > | null;
      assert.equal(resolvedAuthor?.documentId, draftOnlyAuthor.documentId);
      assert.equal(draftBody.data.resolveErrors, undefined);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve published reads hide draft-only deleted references as not found",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-resolve-published-draft-deleted",
      );
    const project = `cms26-resolve-published-deleted-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const deletedAuthor = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "draft-only-deleted-author",
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-published-deleted",
        {
          author: deletedAuthor.documentId as string,
        },
      );
      await deleteContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        deletedAuthor.documentId as string,
      );
      await publishContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        blog.documentId as string,
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const resolveErrors = body.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_NOT_FOUND",
      );
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API resolve published reads hide draft-only type mismatches as not found",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-resolve-published-draft-mismatch",
      );
    const project = `cms26-resolve-published-mismatch-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const testScopeHeaders = {
      ...scopeHeaders,
      "x-mdcms-project": project,
      "x-mdcms-environment": "production",
    };
    const scope = {
      project,
      environment: testScopeHeaders["x-mdcms-environment"],
    };

    try {
      await seedCms26ReferenceSchema(dbConnection.db, scope);
      const author = await createCms26Author(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "published-mismatch-author",
      );
      const draftOnlyPage = await createContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        {
          path: `pages/cms26-published-mismatch-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          type: "Page",
          locale: "en",
          format: "md",
          frontmatter: {
            slug: "draft-only-page",
          },
          body: "draft-only page body",
        },
      );
      const blog = await createCms26BlogPost(
        handler,
        csrfHeaders,
        testScopeHeaders,
        "resolve-published-mismatch",
        {
          author: author.documentId as string,
        },
      );
      await overwriteDraftFrontmatter(
        dbConnection.db,
        blog.documentId as string,
        {
          slug: "resolve-published-mismatch",
          author: draftOnlyPage.documentId as string,
        },
      );
      await publishContentDocument(
        handler,
        csrfHeaders,
        testScopeHeaders,
        blog.documentId as string,
      );

      const response = await handler(
        new Request(
          `http://localhost/api/v1/content/${blog.documentId}?resolve=author`,
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const body = (await response.json()) as {
        data: Record<string, unknown>;
      };

      assert.equal(response.status, 200);
      const frontmatter = body.data.frontmatter as Record<string, unknown>;
      assert.equal(frontmatter.author, null);
      const resolveErrors = body.data.resolveErrors as
        | Record<string, { code: string; ref: Record<string, unknown> }>
        | undefined;
      assert.ok(resolveErrors);
      assert.equal(
        resolveErrors?.["frontmatter.author"]?.code,
        "REFERENCE_NOT_FOUND",
      );
    } finally {
      await dbConnection.close();
    }
  },
);

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

test("content API list uses published snapshots by default and hides deleted draft rows unless explicitly requested", async () => {
  const handler = createHandler();

  const publishedCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/list-visible-published",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "list-visible-published" },
        body: "published body",
      }),
    }),
  );
  const publishedCreated = (await publishedCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(publishedCreateResponse.status, 200);

  const publishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${publishedCreated.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          change_summary: "Publish visible baseline",
        }),
      },
    ),
  );
  assert.equal(publishResponse.status, 200);

  const publishedUpdateResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${publishedCreated.data.documentId}`,
      {
        method: "PUT",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          path: "blog/list-visible-draft",
          body: "draft body",
        }),
      },
    ),
  );
  assert.equal(publishedUpdateResponse.status, 200);

  const unpublishedCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/list-unpublished-only",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "list-unpublished-only" },
        body: "unpublished draft body",
      }),
    }),
  );
  const unpublishedCreated = (await unpublishedCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(unpublishedCreateResponse.status, 200);

  const deletedCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/list-deleted-doc",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "list-deleted-doc" },
        body: "deleted body",
      }),
    }),
  );
  const deletedCreated = (await deletedCreateResponse.json()) as {
    data: { documentId: string };
  };
  assert.equal(deletedCreateResponse.status, 200);

  const deletedPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${deletedCreated.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          change_summary: "Publish before delete",
        }),
      },
    ),
  );
  assert.equal(deletedPublishResponse.status, 200);

  const deletedDeleteResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${deletedCreated.data.documentId}`,
      {
        method: "DELETE",
        headers: scopeHeaders,
      },
    ),
  );
  assert.equal(deletedDeleteResponse.status, 200);

  const publishedListResponse = await handler(
    new Request("http://localhost/api/v1/content?sort=path&order=asc", {
      headers: scopeHeaders,
    }),
  );
  const publishedListBody = (await publishedListResponse.json()) as {
    data: Array<{
      documentId: string;
      path: string;
      body: string;
      isDeleted: boolean;
    }>;
  };
  assert.equal(publishedListResponse.status, 200);
  assert.deepEqual(
    publishedListBody.data.map((document) => ({
      documentId: document.documentId,
      path: document.path,
      body: document.body,
      isDeleted: document.isDeleted,
    })),
    [
      {
        documentId: publishedCreated.data.documentId,
        path: "blog/list-visible-published",
        body: "published body",
        isDeleted: false,
      },
    ],
  );

  const draftListResponse = await handler(
    new Request(
      "http://localhost/api/v1/content?draft=true&sort=path&order=asc",
      {
        headers: scopeHeaders,
      },
    ),
  );
  const draftListBody = (await draftListResponse.json()) as {
    data: Array<{
      documentId: string;
      path: string;
      body: string;
      isDeleted: boolean;
    }>;
  };
  assert.equal(draftListResponse.status, 200);
  assert.deepEqual(
    draftListBody.data.map((document) => ({
      documentId: document.documentId,
      path: document.path,
      body: document.body,
      isDeleted: document.isDeleted,
    })),
    [
      {
        documentId: unpublishedCreated.data.documentId,
        path: "blog/list-unpublished-only",
        body: "unpublished draft body",
        isDeleted: false,
      },
      {
        documentId: publishedCreated.data.documentId,
        path: "blog/list-visible-draft",
        body: "draft body",
        isDeleted: false,
      },
    ],
  );

  const deletedDraftListResponse = await handler(
    new Request(
      "http://localhost/api/v1/content?draft=true&isDeleted=true&sort=path&order=asc",
      {
        headers: scopeHeaders,
      },
    ),
  );
  const deletedDraftListBody = (await deletedDraftListResponse.json()) as {
    data: Array<{
      documentId: string;
      path: string;
      body: string;
      isDeleted: boolean;
    }>;
  };
  assert.equal(deletedDraftListResponse.status, 200);
  assert.deepEqual(
    deletedDraftListBody.data.map((document) => ({
      documentId: document.documentId,
      path: document.path,
      body: document.body,
      isDeleted: document.isDeleted,
    })),
    [
      {
        documentId: deletedCreated.data.documentId,
        path: "blog/list-deleted-doc",
        body: "deleted body",
        isDeleted: true,
      },
    ],
  );
});

test("content API restore undeletes the current head without appending a version", async () => {
  const handler = createHandler();

  const createResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/restore-me",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "restore-me", title: "Restore Me" },
        body: "restore me body",
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
          "content-type": "application/json",
        },
        body: JSON.stringify({
          changeSummary: "Publish before trash",
        }),
      },
    ),
  );
  const published = (await publishResponse.json()) as {
    data: { publishedVersion: number | null };
  };

  assert.equal(publishResponse.status, 200);
  assert.equal(published.data.publishedVersion, 1);

  const deleteResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      method: "DELETE",
      headers: scopeHeaders,
    }),
  );

  assert.equal(deleteResponse.status, 200);

  const restoreResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/restore`,
      {
        method: "POST",
        headers: scopeHeaders,
      },
    ),
  );
  const restoreBody = (await restoreResponse.json()) as {
    data: {
      isDeleted: boolean;
      publishedVersion: number | null;
      body: string;
    };
  };

  assert.equal(restoreResponse.status, 200);
  assert.equal(restoreBody.data.isDeleted, false);
  assert.equal(restoreBody.data.publishedVersion, 1);
  assert.equal(restoreBody.data.body, "restore me body");

  const versionsResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const versionsBody = (await versionsResponse.json()) as {
    data: Array<{ version: number }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };

  assert.equal(versionsResponse.status, 200);
  assert.equal(versionsBody.data.length, 1);
  assert.equal(versionsBody.data[0]?.version, 1);
  assert.deepEqual(versionsBody.pagination, {
    total: 1,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  const publishedReadResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  const publishedReadBody = (await publishedReadResponse.json()) as {
    data: { body: string };
  };

  assert.equal(publishedReadResponse.status, 200);
  assert.equal(publishedReadBody.data.body, "restore me body");
});

test("content API restore returns CONTENT_PATH_CONFLICT when undelete collides with an active path", async () => {
  const handler = createHandler();

  const trashedCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/conflict-path",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "conflict-path" },
        body: "trashed body",
      }),
    }),
  );
  const trashedDocument = (await trashedCreateResponse.json()) as {
    data: { documentId: string };
  };

  assert.equal(trashedCreateResponse.status, 200);

  const deleteResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${trashedDocument.data.documentId}`,
      {
        method: "DELETE",
        headers: scopeHeaders,
      },
    ),
  );

  assert.equal(deleteResponse.status, 200);

  const conflictingCreateResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/conflict-path",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "conflict-path-live" },
        body: "live body",
      }),
    }),
  );

  assert.equal(conflictingCreateResponse.status, 200);

  const restoreResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${trashedDocument.data.documentId}/restore`,
      {
        method: "POST",
        headers: scopeHeaders,
      },
    ),
  );
  const restoreBody = (await restoreResponse.json()) as {
    code: string;
    details?: { path?: string; locale?: string; conflictDocumentId?: string };
  };

  assert.equal(restoreResponse.status, 409);
  assert.equal(restoreBody.code, "CONTENT_PATH_CONFLICT");
  assert.equal(restoreBody.details?.path, "blog/conflict-path");
  assert.equal(restoreBody.details?.locale, "en");
  assert.ok(restoreBody.details?.conflictDocumentId);
});

test("content API returns version history summaries and immutable snapshots", async () => {
  const handler = createHandler();

  const createResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/version-history",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "version-history", title: "Version One" },
        body: "version one body",
      }),
    }),
  );
  const created = (await createResponse.json()) as {
    data: { documentId: string };
  };

  assert.equal(createResponse.status, 200);

  const firstPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          changeSummary: "Version one",
        }),
      },
    ),
  );

  assert.equal(firstPublishResponse.status, 200);

  const updateResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      method: "PUT",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/version-history-updated",
        frontmatter: { slug: "version-history", title: "Version Two" },
        body: "version two body",
      }),
    }),
  );

  assert.equal(updateResponse.status, 200);

  const secondPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          changeSummary: "Version two",
        }),
      },
    ),
  );

  assert.equal(secondPublishResponse.status, 200);

  const versionsResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const versionsBody = (await versionsResponse.json()) as {
    data: Array<{
      version: number;
      path: string;
      changeSummary?: string;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };

  assert.equal(versionsResponse.status, 200);
  assert.equal(versionsBody.data.length, 2);
  assert.equal(versionsBody.data[0]?.version, 2);
  assert.equal(versionsBody.data[0]?.path, "blog/version-history-updated");
  assert.equal(versionsBody.data[0]?.changeSummary, "Version two");
  assert.equal(versionsBody.data[1]?.version, 1);
  assert.equal(versionsBody.data[1]?.path, "blog/version-history");
  assert.equal(versionsBody.data[1]?.changeSummary, "Version one");
  assert.deepEqual(versionsBody.pagination, {
    total: 2,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  const pagedVersionsResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions?limit=1&offset=0`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const pagedVersionsBody = (await pagedVersionsResponse.json()) as {
    data: Array<{
      version: number;
      path: string;
      changeSummary?: string;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };

  assert.equal(pagedVersionsResponse.status, 200);
  assert.equal(pagedVersionsBody.data.length, 1);
  assert.equal(pagedVersionsBody.data[0]?.version, 2);
  assert.deepEqual(pagedVersionsBody.pagination, {
    total: 2,
    limit: 1,
    offset: 0,
    hasMore: true,
  });

  const offsetVersionsResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions?limit=1&offset=1`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const offsetVersionsBody = (await offsetVersionsResponse.json()) as {
    data: Array<{
      version: number;
      path: string;
      changeSummary?: string;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };

  assert.equal(offsetVersionsResponse.status, 200);
  assert.equal(offsetVersionsBody.data.length, 1);
  assert.equal(offsetVersionsBody.data[0]?.version, 1);
  assert.deepEqual(offsetVersionsBody.pagination, {
    total: 2,
    limit: 1,
    offset: 1,
    hasMore: false,
  });

  const versionOneResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions/1`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const versionOneBody = (await versionOneResponse.json()) as {
    data: {
      version: number;
      path: string;
      body: string;
      frontmatter: { title?: string };
      changeSummary?: string;
    };
  };

  assert.equal(versionOneResponse.status, 200);
  assert.equal(versionOneBody.data.version, 1);
  assert.equal(versionOneBody.data.path, "blog/version-history");
  assert.equal(versionOneBody.data.body, "version one body");
  assert.equal(versionOneBody.data.frontmatter.title, "Version One");
  assert.equal(versionOneBody.data.changeSummary, "Version one");
});

test("content API restores a historical version to draft state by default", async () => {
  const handler = createHandler();

  const createResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/restore-draft",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "restore-draft", title: "Draft Version One" },
        body: "draft version one body",
      }),
    }),
  );
  const created = (await createResponse.json()) as {
    data: { documentId: string };
  };

  assert.equal(createResponse.status, 200);

  const firstPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
      },
    ),
  );

  assert.equal(firstPublishResponse.status, 200);

  const updateResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      method: "PUT",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/restore-draft-updated",
        frontmatter: { slug: "restore-draft", title: "Draft Version Two" },
        body: "draft version two body",
      }),
    }),
  );

  assert.equal(updateResponse.status, 200);

  const secondPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
      },
    ),
  );

  assert.equal(secondPublishResponse.status, 200);

  const restoreResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions/1/restore`,
      {
        method: "POST",
        headers: scopeHeaders,
      },
    ),
  );
  const restoreBody = (await restoreResponse.json()) as {
    data: {
      body: string;
      path: string;
      publishedVersion: number | null;
      hasUnpublishedChanges: boolean;
    };
  };

  assert.equal(restoreResponse.status, 200);
  assert.equal(restoreBody.data.body, "draft version one body");
  assert.equal(restoreBody.data.path, "blog/restore-draft");
  assert.equal(restoreBody.data.publishedVersion, 2);
  assert.equal(restoreBody.data.hasUnpublishedChanges, true);

  const publishedReadResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      headers: scopeHeaders,
    }),
  );
  const publishedReadBody = (await publishedReadResponse.json()) as {
    data: { body: string; path: string };
  };

  assert.equal(publishedReadResponse.status, 200);
  assert.equal(publishedReadBody.data.body, "draft version two body");
  assert.equal(publishedReadBody.data.path, "blog/restore-draft-updated");

  const versionsResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const versionsBody = (await versionsResponse.json()) as {
    data: Array<{ version: number }>;
  };

  assert.equal(versionsResponse.status, 200);
  assert.equal(versionsBody.data.length, 2);
  assert.equal(versionsBody.data[0]?.version, 2);
  assert.equal(versionsBody.data[1]?.version, 1);
});

test("content API restores a historical version to published state when requested", async () => {
  const handler = createHandler();

  const createResponse = await handler(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/restore-published",
        type: "BlogPost",
        locale: "en",
        format: "md",
        frontmatter: { slug: "restore-published", title: "Published One" },
        body: "published one body",
      }),
    }),
  );
  const created = (await createResponse.json()) as {
    data: { documentId: string };
  };

  assert.equal(createResponse.status, 200);

  const firstPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
      },
    ),
  );

  assert.equal(firstPublishResponse.status, 200);

  const updateResponse = await handler(
    new Request(`http://localhost/api/v1/content/${created.data.documentId}`, {
      method: "PUT",
      headers: {
        ...scopeHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "blog/restore-published-updated",
        frontmatter: { slug: "restore-published", title: "Published Two" },
        body: "published two body",
      }),
    }),
  );

  assert.equal(updateResponse.status, 200);

  const secondPublishResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/publish`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
      },
    ),
  );

  assert.equal(secondPublishResponse.status, 200);

  const restoreResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions/1/restore`,
      {
        method: "POST",
        headers: {
          ...scopeHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          targetStatus: "published",
          changeSummary: "Republish v1",
        }),
      },
    ),
  );
  const restoreBody = (await restoreResponse.json()) as {
    data: {
      body: string;
      path: string;
      publishedVersion: number | null;
      version: number;
      hasUnpublishedChanges: boolean;
    };
  };

  assert.equal(restoreResponse.status, 200);
  assert.equal(restoreBody.data.body, "published one body");
  assert.equal(restoreBody.data.path, "blog/restore-published");
  assert.equal(restoreBody.data.publishedVersion, 3);
  assert.equal(restoreBody.data.version, 3);
  assert.equal(restoreBody.data.hasUnpublishedChanges, false);

  const versionsResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const versionsBody = (await versionsResponse.json()) as {
    data: Array<{ version: number }>;
  };

  assert.equal(versionsResponse.status, 200);
  assert.equal(versionsBody.data.length, 3);
  assert.equal(versionsBody.data[0]?.version, 3);
  assert.equal(versionsBody.data[1]?.version, 2);
  assert.equal(versionsBody.data[2]?.version, 1);

  const latestVersionResponse = await handler(
    new Request(
      `http://localhost/api/v1/content/${created.data.documentId}/versions/3`,
      {
        headers: scopeHeaders,
      },
    ),
  );
  const latestVersionBody = (await latestVersionResponse.json()) as {
    data: { body: string; path: string; changeSummary?: string };
  };

  assert.equal(latestVersionResponse.status, 200);
  assert.equal(latestVersionBody.data.body, "published one body");
  assert.equal(latestVersionBody.data.path, "blog/restore-published");
  assert.equal(latestVersionBody.data.changeSummary, "Republish v1");
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
      await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });
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
        transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          dbConnection.db.transaction(async (tx) => {
            const wrappedTx = Object.assign(Object.create(tx), {
              query: tx.query,
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

                return tx.insert(table as any);
              },
            });

            return callback(wrappedTx);
          }),
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
      await seedSchemaRegistryScope(dbConnection.db, {
        scope,
        entries: [
          {
            type: "BlogPost",
            directory: "content/blog",
            localized: true,
          },
        ],
      });
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
        transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          dbConnection.db.transaction(async (tx) => {
            const wrappedTx = Object.assign(Object.create(tx), {
              query: tx.query,
              insert: tx.insert.bind(tx),
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
                              frontmatter: {
                                slug: "race-update-fr-competitor",
                              },
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

                return tx.update(table as any);
              },
            });

            return callback(wrappedTx);
          }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-variant");

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-db-update-translation-conflict",
      );

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
            headers: csrfHeaders({
              ...scopeHeaders,
              "content-type": "application/json",
            }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-path-conflict");

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-duplicate-locale");

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-not-found");

    try {
      const missingSourceResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...docsScopeHeaders,
            "content-type": "application/json",
          }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-soft-delete");

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
            headers: csrfHeaders({
              ...scopeHeaders,
            }),
          },
        ),
      );

      assert.equal(deleteSourceResponse.status, 200);

      const variantCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-type-mismatch");

    try {
      const sourceCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
  "content API DB list uses published snapshots by default and hides deleted draft rows unless explicitly requested",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-list-visibility");
    const testScopeHeaders = {
      "x-mdcms-project": `content-db-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      "x-mdcms-environment": "production",
    };

    try {
      const publishedCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/db-list-visible-published-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-list-visible-published" },
            body: "published body",
          }),
        }),
      );
      const publishedCreated = (await publishedCreateResponse.json()) as {
        data: { documentId: string; path: string };
      };
      assert.equal(publishedCreateResponse.status, 200);

      const publishResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${publishedCreated.data.documentId}/publish`,
          {
            method: "POST",
            headers: csrfHeaders({
              ...testScopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              change_summary: "Publish visible baseline",
            }),
          },
        ),
      );
      assert.equal(publishResponse.status, 200);

      const publishedUpdateResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${publishedCreated.data.documentId}`,
          {
            method: "PUT",
            headers: csrfHeaders({
              ...testScopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              path: `${publishedCreated.data.path}-draft`,
              body: "draft body",
            }),
          },
        ),
      );
      assert.equal(publishedUpdateResponse.status, 200);

      const unpublishedCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/db-list-unpublished-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-list-unpublished" },
            body: "unpublished draft body",
          }),
        }),
      );
      const unpublishedCreated = (await unpublishedCreateResponse.json()) as {
        data: { documentId: string; path: string };
      };
      assert.equal(unpublishedCreateResponse.status, 200);

      const deletedCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...testScopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/db-list-deleted-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-list-deleted" },
            body: "deleted body",
          }),
        }),
      );
      const deletedCreated = (await deletedCreateResponse.json()) as {
        data: { documentId: string; path: string };
      };
      assert.equal(deletedCreateResponse.status, 200);

      const deletedPublishResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${deletedCreated.data.documentId}/publish`,
          {
            method: "POST",
            headers: csrfHeaders({
              ...testScopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              change_summary: "Publish before delete",
            }),
          },
        ),
      );
      assert.equal(deletedPublishResponse.status, 200);

      const deletedDeleteResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${deletedCreated.data.documentId}`,
          {
            method: "DELETE",
            headers: csrfHeaders(testScopeHeaders),
          },
        ),
      );
      assert.equal(deletedDeleteResponse.status, 200);

      const publishedListResponse = await handler(
        new Request("http://localhost/api/v1/content?sort=path&order=asc", {
          headers: {
            ...testScopeHeaders,
            cookie,
          },
        }),
      );
      const publishedListBody = (await publishedListResponse.json()) as {
        data: Array<{
          documentId: string;
          path: string;
          body: string;
          isDeleted: boolean;
        }>;
      };
      assert.equal(publishedListResponse.status, 200);
      assert.deepEqual(
        publishedListBody.data.map((document) => ({
          documentId: document.documentId,
          path: document.path,
          body: document.body,
          isDeleted: document.isDeleted,
        })),
        [
          {
            documentId: publishedCreated.data.documentId,
            path: publishedCreated.data.path,
            body: "published body",
            isDeleted: false,
          },
        ],
      );

      const draftListResponse = await handler(
        new Request(
          "http://localhost/api/v1/content?draft=true&sort=path&order=asc",
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const draftListBody = (await draftListResponse.json()) as {
        data: Array<{
          documentId: string;
          path: string;
          body: string;
          isDeleted: boolean;
        }>;
      };
      assert.equal(draftListResponse.status, 200);
      assert.deepEqual(
        draftListBody.data.map((document) => ({
          documentId: document.documentId,
          path: document.path,
          body: document.body,
          isDeleted: document.isDeleted,
        })),
        [
          {
            documentId: unpublishedCreated.data.documentId,
            path: unpublishedCreated.data.path,
            body: "unpublished draft body",
            isDeleted: false,
          },
          {
            documentId: publishedCreated.data.documentId,
            path: `${publishedCreated.data.path}-draft`,
            body: "draft body",
            isDeleted: false,
          },
        ],
      );

      const deletedDraftListResponse = await handler(
        new Request(
          "http://localhost/api/v1/content?draft=true&isDeleted=true&sort=path&order=asc",
          {
            headers: {
              ...testScopeHeaders,
              cookie,
            },
          },
        ),
      );
      const deletedDraftListBody = (await deletedDraftListResponse.json()) as {
        data: Array<{
          documentId: string;
          path: string;
          body: string;
          isDeleted: boolean;
        }>;
      };
      assert.equal(deletedDraftListResponse.status, 200);
      assert.deepEqual(
        deletedDraftListBody.data.map((document) => ({
          documentId: document.documentId,
          path: document.path,
          body: document.body,
          isDeleted: document.isDeleted,
        })),
        [
          {
            documentId: deletedCreated.data.documentId,
            path: deletedCreated.data.path,
            body: "deleted body",
            isDeleted: true,
          },
        ],
      );
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
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-change-summary");

    try {
      const createResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
            headers: csrfHeaders({
              ...scopeHeaders,
              "content-type": "application/json",
            }),
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
  "content API DB restore returns CONTENT_PATH_CONFLICT when undelete collides with an active path",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-db-restore-conflict");

    try {
      const trashedCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/db-restore-conflict-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-restore-conflict" },
            body: "trashed body",
          }),
        }),
      );
      const trashedDocument = (await trashedCreateResponse.json()) as {
        data: { documentId: string; path: string };
      };

      assert.equal(trashedCreateResponse.status, 200);

      const deleteResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${trashedDocument.data.documentId}`,
          {
            method: "DELETE",
            headers: csrfHeaders({
              ...scopeHeaders,
            }),
          },
        ),
      );

      assert.equal(deleteResponse.status, 200);

      const conflictingCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: trashedDocument.data.path,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-restore-conflict-live" },
            body: "live body",
          }),
        }),
      );
      const conflictingDocument = (await conflictingCreateResponse.json()) as {
        data: { documentId: string };
      };

      assert.equal(conflictingCreateResponse.status, 200);

      const restoreResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${trashedDocument.data.documentId}/restore`,
          {
            method: "POST",
            headers: csrfHeaders({
              ...scopeHeaders,
            }),
          },
        ),
      );
      const restoreBody = (await restoreResponse.json()) as {
        code: string;
        details?: {
          conflictDocumentId?: string;
          path?: string;
          locale?: string;
        };
      };

      assert.equal(restoreResponse.status, 409);
      assert.equal(restoreBody.code, "CONTENT_PATH_CONFLICT");
      assert.equal(
        restoreBody.details?.conflictDocumentId,
        conflictingDocument.data.documentId,
      );
      assert.equal(restoreBody.details?.path, trashedDocument.data.path);
      assert.equal(restoreBody.details?.locale, "en");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API DB restore version with targetStatus=published appends a new immutable version",
  async () => {
    const { handler, dbConnection, csrfHeaders } =
      await createDatabaseTestContext(
        "test:content-api-db-restore-version-published",
      );

    try {
      const createResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
          body: JSON.stringify({
            path: `blog/db-restore-version-${Date.now()}`,
            type: "BlogPost",
            locale: "en",
            format: "md",
            frontmatter: { slug: "db-restore-version", title: "Version One" },
            body: "version one body",
          }),
        }),
      );
      const created = (await createResponse.json()) as {
        data: { documentId: string; path: string };
      };

      assert.equal(createResponse.status, 200);

      const firstPublishResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${created.data.documentId}/publish`,
          {
            method: "POST",
            headers: csrfHeaders({
              ...scopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              changeSummary: "Version one",
            }),
          },
        ),
      );

      assert.equal(firstPublishResponse.status, 200);

      const updateResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${created.data.documentId}`,
          {
            method: "PUT",
            headers: csrfHeaders({
              ...scopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              path: `${created.data.path}-updated`,
              frontmatter: {
                slug: "db-restore-version",
                title: "Version Two",
              },
              body: "version two body",
            }),
          },
        ),
      );

      assert.equal(updateResponse.status, 200);

      const secondPublishResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${created.data.documentId}/publish`,
          {
            method: "POST",
            headers: csrfHeaders({
              ...scopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              changeSummary: "Version two",
            }),
          },
        ),
      );

      assert.equal(secondPublishResponse.status, 200);

      const restoreResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${created.data.documentId}/versions/1/restore`,
          {
            method: "POST",
            headers: csrfHeaders({
              ...scopeHeaders,
              "content-type": "application/json",
            }),
            body: JSON.stringify({
              targetStatus: "published",
              change_summary: "Republish version one",
            }),
          },
        ),
      );
      const restoreBody = (await restoreResponse.json()) as {
        data: {
          publishedVersion: number | null;
          version: number;
          path: string;
          body: string;
          hasUnpublishedChanges: boolean;
        };
      };

      assert.equal(restoreResponse.status, 200);
      assert.equal(restoreBody.data.publishedVersion, 3);
      assert.equal(restoreBody.data.version, 3);
      assert.equal(restoreBody.data.path, created.data.path);
      assert.equal(restoreBody.data.body, "version one body");
      assert.equal(restoreBody.data.hasUnpublishedChanges, false);

      const versionsResponse = await handler(
        new Request(
          `http://localhost/api/v1/content/${created.data.documentId}/versions?limit=2&offset=1`,
          {
            headers: csrfHeaders({
              ...scopeHeaders,
            }),
          },
        ),
      );
      const versionsBody = (await versionsResponse.json()) as {
        data: Array<{ version: number }>;
        pagination: {
          total: number;
          limit: number;
          offset: number;
          hasMore: boolean;
        };
      };

      assert.equal(versionsResponse.status, 200);
      assert.equal(versionsBody.data.length, 2);
      assert.equal(versionsBody.data[0]?.version, 2);
      assert.equal(versionsBody.data[1]?.version, 1);
      assert.deepEqual(versionsBody.pagination, {
        total: 3,
        limit: 2,
        offset: 1,
        hasMore: false,
      });

      const versionRows = await dbConnection.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, created.data.documentId));

      versionRows.sort((left, right) => left.version - right.version);

      assert.equal(versionRows.length, 3);
      assert.equal(versionRows[0]?.version, 1);
      assert.equal(versionRows[0]?.body, "version one body");
      assert.equal(versionRows[1]?.version, 2);
      assert.equal(versionRows[1]?.body, "version two body");
      assert.equal(versionRows[2]?.version, 3);
      assert.equal(versionRows[2]?.path, created.data.path);
      assert.equal(versionRows[2]?.body, "version one body");
      assert.equal(versionRows[2]?.changeSummary, "Republish version one");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "content API keeps documents isolated across routed projects",
  async () => {
    const { handler, dbConnection, cookie, csrfHeaders } =
      await createDatabaseTestContext("test:content-api-routed-project-scope");

    try {
      const marketingCreateResponse = await handler(
        new Request("http://localhost/api/v1/content", {
          method: "POST",
          headers: csrfHeaders({
            ...scopeHeaders,
            "content-type": "application/json",
          }),
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
          headers: csrfHeaders({
            ...docsScopeHeaders,
            "content-type": "application/json",
          }),
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
            headers: csrfHeaders({
              ...docsScopeHeaders,
            }),
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
