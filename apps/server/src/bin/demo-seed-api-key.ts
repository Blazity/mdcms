import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { RuntimeError } from "@mdcms/shared";

import { createAuthService } from "../lib/auth.js";
import { createDatabaseConnection } from "../lib/db.js";
import { apiKeys, authUsers, rbacGrants } from "../lib/db/schema.js";

const API_KEY_PREFIX = "mdcms_key_";
const DEFAULT_DEMO_API_KEY = "mdcms_key_demo_local_compose_seed_2026_read";
const DEFAULT_DEMO_USER_EMAIL = "demo@mdcms.local";
const DEFAULT_DEMO_USER_NAME = "Demo User";
const DEFAULT_DEMO_USER_PASSWORD = "Demo12345!";
const DEFAULT_DEMO_PROJECT = "marketing-site";
const DEFAULT_DEMO_ENVIRONMENT = "staging";
const DEMO_KEY_LABEL = "compose-dev-demo-content-read";
const DEMO_KEY_SCOPES = ["content:read"] as const;
const LOCAL_AUTH_ORIGIN = "http://localhost";

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

function toErrorText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (!input || typeof input !== "object") {
    return String(input);
  }

  const record = input as Record<string, unknown>;
  const message = record.message;
  const code = record.code;
  return `${typeof code === "string" ? `${code}: ` : ""}${typeof message === "string" ? message : JSON.stringify(input)}`;
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

async function ensureDemoUser(input: {
  db: ReturnType<typeof createDatabaseConnection>["db"];
  authService: ReturnType<typeof createAuthService>;
  email: string;
  name: string;
  password: string;
}): Promise<string> {
  const existing = await input.db.query.authUsers.findFirst({
    where: eq(authUsers.email, input.email),
  });

  const signUp = async (): Promise<string> => {
    const response = await input.authService.handleAuthRequest(
      new Request(`${LOCAL_AUTH_ORIGIN}/api/v1/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          name: input.name,
        }),
      }),
    );

    if (!response.ok) {
      const payload = await parseJson(response);
      throw new Error(
        `failed to create demo login user (${response.status}): ${toErrorText(payload)}`,
      );
    }

    const created = await input.db.query.authUsers.findFirst({
      where: eq(authUsers.email, input.email),
    });

    if (!created) {
      throw new Error("Demo login user was not persisted after sign-up.");
    }

    return created.id;
  };

  const canLogin = async (): Promise<boolean> => {
    try {
      await input.authService.login(
        new Request(`${LOCAL_AUTH_ORIGIN}/api/v1/auth/login`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        }),
        input.email,
        input.password,
      );
      return true;
    } catch (error) {
      if (
        error instanceof RuntimeError &&
        error.code === "AUTH_INVALID_CREDENTIALS"
      ) {
        return false;
      }

      throw error;
    }
  };

  if (!existing) {
    return signUp();
  }

  if (await canLogin()) {
    return existing.id;
  }

  await input.db
    .delete(apiKeys)
    .where(eq(apiKeys.createdByUserId, existing.id));
  await input.db.delete(rbacGrants).where(eq(rbacGrants.userId, existing.id));
  await input.db.delete(authUsers).where(eq(authUsers.id, existing.id));

  return signUp();
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
  const demoUserPassword = resolveEnv(
    "MDCMS_DEMO_SEED_USER_PASSWORD",
    DEFAULT_DEMO_USER_PASSWORD,
  );
  const project = resolveEnv("MDCMS_DEMO_PROJECT", DEFAULT_DEMO_PROJECT);
  const environment = resolveEnv(
    "MDCMS_DEMO_ENVIRONMENT",
    DEFAULT_DEMO_ENVIRONMENT,
  );

  assertDemoApiKeyFormat(apiKey);

  const connection = createDatabaseConnection({ env: process.env });
  const authService = createAuthService({
    db: connection.db,
    env: process.env,
  });

  try {
    const userId = await ensureDemoUser({
      db: connection.db,
      authService,
      email: demoUserEmail,
      name: demoUserName,
      password: demoUserPassword,
    });

    await ensureDemoApiKey({
      db: connection.db,
      userId,
      apiKey,
      project,
      environment,
    });

    console.info(
      `[demo-seed] ensured demo login user ${demoUserEmail} and demo API key for ${project}/${environment} (${toKeyPrefix(apiKey)})`,
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
