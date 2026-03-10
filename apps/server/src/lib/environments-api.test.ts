import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createConsoleLogger, parseMdcmsConfig } from "@mdcms/shared";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";

import { documents, environments, schemaSyncs } from "./db/schema.js";
import { createServerRequestHandlerWithModules } from "./runtime-with-modules.js";

const env = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  APP_VERSION: "9.9.9",
  PORT: "4000",
  SERVICE_NAME: "mdcms-server",
  DATABASE_URL: "postgres://mdcms:mdcms@localhost:5432/mdcms",
} as NodeJS.ProcessEnv;

const logger = createConsoleLogger({
  level: "error",
  sink: () => undefined,
});

const DEFAULT_ACTOR = "00000000-0000-0000-0000-000000000001";
const testConfig = parseMdcmsConfig({
  project: "marketing-site",
  serverUrl: "http://localhost:4000",
  types: [],
  environments: {
    production: {},
    staging: {
      extends: "production",
    },
    preview: {
      extends: "staging",
    },
  },
});

async function canConnectToDatabase(): Promise<boolean> {
  const client = postgres(env.DATABASE_URL ?? "", {
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

function uniqueEmail(): string {
  return `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mdcms.local`;
}

function uniqueProject(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signUp(
  handler: (request: Request) => Promise<Response>,
  input: {
    email: string;
    password: string;
    name?: string;
  },
): Promise<void> {
  const response = await handler(
    new Request("http://localhost/api/v1/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        name: input.name ?? "Admin User",
      }),
    }),
  );

  assert.equal(response.status, 200);
}

async function login(
  handler: (request: Request) => Promise<Response>,
  input: {
    email: string;
    password: string;
  },
): Promise<string> {
  const response = await handler(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}

type EnvironmentSummary = {
  id: string;
  project: string;
  name: string;
  extends: string | null;
  isDefault: boolean;
  createdAt: string;
};

testWithDatabase(
  "environments API creates project-scoped environments and provisions default production",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
      config: testConfig,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";
    const project = uniqueProject("env-success");

    try {
      await signUp(handler, { email, password });
      const cookie = await login(handler, { email, password });

      const createResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "staging",
            extends: "production",
          }),
        }),
      );
      const createBody = (await createResponse.json()) as {
        data: EnvironmentSummary;
      };

      assert.equal(createResponse.status, 200);
      assert.equal(createBody.data.project, project);
      assert.equal(createBody.data.name, "staging");
      assert.equal(createBody.data.extends, "production");
      assert.equal(createBody.data.isDefault, false);

      const listResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          headers: {
            cookie,
          },
        }),
      );
      const listBody = (await listResponse.json()) as {
        data: EnvironmentSummary[];
      };

      assert.equal(listResponse.status, 200);
      assert.deepEqual(
        listBody.data.map((entry) => ({
          project: entry.project,
          name: entry.name,
          extends: entry.extends,
          isDefault: entry.isDefault,
        })),
        [
          {
            project,
            name: "production",
            extends: null,
            isDefault: true,
          },
          {
            project,
            name: "staging",
            extends: "production",
            isDefault: false,
          },
        ],
      );

      const projectRow = await dbConnection.db.query.projects.findFirst({
        where: (table, operators) => operators.eq(table.slug, project),
      });
      assert.ok(projectRow);

      const environmentRows = await dbConnection.db
        .select()
        .from(environments)
        .where(eq(environments.projectId, projectRow.id));

      assert.deepEqual(environmentRows.map((entry) => entry.name).sort(), [
        "production",
        "staging",
      ]);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "environments API rejects duplicate names, unknown config environments, and extends mismatches",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
      config: testConfig,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";
    const project = uniqueProject("env-invalid");

    try {
      await signUp(handler, { email, password });
      const cookie = await login(handler, { email, password });

      const firstCreateResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "staging",
            extends: "production",
          }),
        }),
      );
      assert.equal(firstCreateResponse.status, 200);

      const duplicateResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "staging",
            extends: "production",
          }),
        }),
      );
      const duplicateBody = (await duplicateResponse.json()) as {
        code: string;
      };

      assert.equal(duplicateResponse.status, 409);
      assert.equal(duplicateBody.code, "CONFLICT");

      const unknownResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "qa",
          }),
        }),
      );
      const unknownBody = (await unknownResponse.json()) as { code: string };

      assert.equal(unknownResponse.status, 400);
      assert.equal(unknownBody.code, "INVALID_INPUT");

      const mismatchedExtendsResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "preview",
            extends: "production",
          }),
        }),
      );
      const mismatchedExtendsBody =
        (await mismatchedExtendsResponse.json()) as {
          code: string;
        };

      assert.equal(mismatchedExtendsResponse.status, 400);
      assert.equal(mismatchedExtendsBody.code, "INVALID_INPUT");
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "environments API protects production and non-empty environments from deletion",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
      config: testConfig,
    });
    const email = uniqueEmail();
    const password = "Admin12345!";
    const project = uniqueProject("env-delete");

    try {
      await signUp(handler, { email, password });
      const cookie = await login(handler, { email, password });

      const createStagingResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "staging",
            extends: "production",
          }),
        }),
      );
      const createStagingBody = (await createStagingResponse.json()) as {
        data: EnvironmentSummary;
      };
      assert.equal(createStagingResponse.status, 200);

      const createPreviewResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "preview",
            extends: "staging",
          }),
        }),
      );
      const createPreviewBody = (await createPreviewResponse.json()) as {
        data: EnvironmentSummary;
      };
      assert.equal(createPreviewResponse.status, 200);

      const productionListResponse = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          headers: {
            cookie,
          },
        }),
      );
      const productionListBody = (await productionListResponse.json()) as {
        data: EnvironmentSummary[];
      };
      const productionEnvironment = productionListBody.data.find(
        (entry) => entry.name === "production",
      );
      assert.ok(productionEnvironment);

      const projectRow = await dbConnection.db.query.projects.findFirst({
        where: (table, operators) => operators.eq(table.slug, project),
      });
      assert.ok(projectRow);

      const stagingRow = await dbConnection.db.query.environments.findFirst({
        where: and(
          eq(environments.projectId, projectRow.id),
          eq(environments.name, "staging"),
        ),
      });
      assert.ok(stagingRow);

      await dbConnection.db.insert(documents).values({
        documentId: randomUUID(),
        translationGroupId: randomUUID(),
        projectId: projectRow.id,
        environmentId: stagingRow.id,
        path: `blog/${Date.now()}`,
        schemaType: "Post",
        locale: "en",
        contentFormat: "md",
        body: "body",
        frontmatter: {},
        isDeleted: false,
        hasUnpublishedChanges: true,
        publishedVersion: null,
        draftRevision: 1,
        createdBy: DEFAULT_ACTOR,
        updatedBy: DEFAULT_ACTOR,
      });

      await dbConnection.db.insert(schemaSyncs).values({
        projectId: projectRow.id,
        environmentId: stagingRow.id,
        schemaHash: "hash",
        rawConfigSnapshot: {
          project,
        },
        extractedComponents: null,
      });

      const deleteProductionResponse = await handler(
        new Request(
          `http://localhost/api/v1/environments/${productionEnvironment.id}?project=${project}`,
          {
            method: "DELETE",
            headers: {
              cookie,
            },
          },
        ),
      );
      const deleteProductionBody = (await deleteProductionResponse.json()) as {
        code: string;
      };

      assert.equal(deleteProductionResponse.status, 409);
      assert.equal(deleteProductionBody.code, "CONFLICT");

      const deleteStagingResponse = await handler(
        new Request(
          `http://localhost/api/v1/environments/${createStagingBody.data.id}?project=${project}`,
          {
            method: "DELETE",
            headers: {
              cookie,
            },
          },
        ),
      );
      const deleteStagingBody = (await deleteStagingResponse.json()) as {
        code: string;
      };

      assert.equal(deleteStagingResponse.status, 409);
      assert.equal(deleteStagingBody.code, "CONFLICT");

      const deletePreviewResponse = await handler(
        new Request(
          `http://localhost/api/v1/environments/${createPreviewBody.data.id}?project=${project}`,
          {
            method: "DELETE",
            headers: {
              cookie,
            },
          },
        ),
      );
      const deletePreviewBody = (await deletePreviewResponse.json()) as {
        data: { deleted: boolean; id: string };
      };

      assert.equal(deletePreviewResponse.status, 200);
      assert.equal(deletePreviewBody.data.deleted, true);
      assert.equal(deletePreviewBody.data.id, createPreviewBody.data.id);
    } finally {
      await dbConnection.close();
    }
  },
);

testWithDatabase(
  "environments API requires an admin or owner session",
  async () => {
    const { handler, dbConnection } = createServerRequestHandlerWithModules({
      env,
      logger,
      config: testConfig,
    });
    const ownerEmail = uniqueEmail();
    const editorEmail = uniqueEmail();
    const password = "Admin12345!";
    const project = uniqueProject("env-auth");

    try {
      await signUp(handler, { email: ownerEmail, password });
      await signUp(handler, {
        email: editorEmail,
        password,
        name: "Editor User",
      });

      await login(handler, { email: ownerEmail, password });
      const editorCookie = await login(handler, {
        email: editorEmail,
        password,
      });

      const response = await handler(
        new Request(`http://localhost/api/v1/environments?project=${project}`, {
          headers: {
            cookie: editorCookie,
          },
        }),
      );
      const body = (await response.json()) as { code: string };

      assert.equal(response.status, 403);
      assert.equal(body.code, "FORBIDDEN");
    } finally {
      await dbConnection.close();
    }
  },
);
