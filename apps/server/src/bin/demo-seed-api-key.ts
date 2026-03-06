import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { createDatabaseConnection } from "../lib/db.js";
import { apiKeys, authUsers } from "../lib/db/schema.js";

const API_KEY_PREFIX = "mdcms_key_";
const DEFAULT_DEMO_API_KEY = "mdcms_key_demo_local_compose_seed_2026_read";
const DEFAULT_DEMO_USER_EMAIL = "demo-seed@mdcms.local";
const DEFAULT_DEMO_USER_NAME = "Demo Seed User";
const DEFAULT_DEMO_PROJECT = "marketing-site";
const DEFAULT_DEMO_ENVIRONMENT = "staging";
const DEMO_KEY_LABEL = "compose-dev-demo-content-read";
const DEMO_KEY_SCOPES = ["content:read"] as const;

function resolveEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toKeyPrefix(apiKey: string): string {
  const visible = API_KEY_PREFIX.length + 8;
  return `${apiKey.slice(0, visible)}...`;
}

function assertDemoApiKeyFormat(apiKey: string): void {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    throw new Error(
      `MDCMS_DEMO_API_KEY must start with "${API_KEY_PREFIX}" prefix.`,
    );
  }
}

async function ensureDemoUser(input: {
  db: ReturnType<typeof createDatabaseConnection>["db"];
  email: string;
  name: string;
}): Promise<string> {
  const existing = await input.db.query.authUsers.findFirst({
    where: eq(authUsers.email, input.email),
  });

  if (existing) {
    return existing.id;
  }

  const [created] = await input.db
    .insert(authUsers)
    .values({
      id: randomUUID(),
      email: input.email,
      name: input.name,
      emailVerified: true,
    })
    .returning({ id: authUsers.id });

  if (!created) {
    throw new Error("Failed to create demo seed user.");
  }

  return created.id;
}

async function ensureDemoApiKey(input: {
  db: ReturnType<typeof createDatabaseConnection>["db"];
  userId: string;
  apiKey: string;
  project: string;
  environment: string;
}): Promise<void> {
  const keyHash = hashApiKey(input.apiKey);
  const existing = await input.db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  });

  if (existing) {
    await input.db
      .update(apiKeys)
      .set({
        label: DEMO_KEY_LABEL,
        keyPrefix: toKeyPrefix(input.apiKey),
        scopes: [...DEMO_KEY_SCOPES],
        contextAllowlist: [
          {
            project: input.project,
            environment: input.environment,
          },
        ],
        expiresAt: null,
        revokedAt: null,
        createdByUserId: input.userId,
      })
      .where(eq(apiKeys.id, existing.id));

    return;
  }

  await input.db.insert(apiKeys).values({
    label: DEMO_KEY_LABEL,
    keyPrefix: toKeyPrefix(input.apiKey),
    keyHash,
    scopes: [...DEMO_KEY_SCOPES],
    contextAllowlist: [
      {
        project: input.project,
        environment: input.environment,
      },
    ],
    expiresAt: null,
    createdByUserId: input.userId,
  });
}

async function main(): Promise<void> {
  const apiKey = resolveEnv("MDCMS_DEMO_API_KEY", DEFAULT_DEMO_API_KEY);
  const demoUserEmail = resolveEnv(
    "MDCMS_DEMO_SEED_USER_EMAIL",
    DEFAULT_DEMO_USER_EMAIL,
  );
  const demoUserName = resolveEnv(
    "MDCMS_DEMO_SEED_USER_NAME",
    DEFAULT_DEMO_USER_NAME,
  );
  const project = resolveEnv("MDCMS_DEMO_PROJECT", DEFAULT_DEMO_PROJECT);
  const environment = resolveEnv(
    "MDCMS_DEMO_ENVIRONMENT",
    DEFAULT_DEMO_ENVIRONMENT,
  );

  assertDemoApiKeyFormat(apiKey);

  const connection = createDatabaseConnection({ env: process.env });

  try {
    const userId = await ensureDemoUser({
      db: connection.db,
      email: demoUserEmail,
      name: demoUserName,
    });

    await ensureDemoApiKey({
      db: connection.db,
      userId,
      apiKey,
      project,
      environment,
    });

    console.info(
      `[demo-seed] ensured demo API key for ${project}/${environment} (${toKeyPrefix(apiKey)})`,
    );
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[demo-seed] failed: ${message}`);
  process.exitCode = 1;
});
