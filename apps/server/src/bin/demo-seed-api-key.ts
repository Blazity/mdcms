import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import { RuntimeError } from "@mdcms/shared";
import { createAuthService } from "../lib/auth.js";
import { createDatabaseContentStore } from "../lib/content-api.js";
import { createDatabaseConnection } from "../lib/db.js";
import { apiKeys, authUsers, rbacGrants } from "../lib/db/schema.js";
import {
  ensureDemoSchemaSynced,
  ensureDemoScopeProvisioned,
} from "../lib/demo-seed.js";

const API_KEY_PREFIX = "mdcms_key_";
const DEFAULT_DEMO_API_KEY = "mdcms_key_demo_local_compose_seed_2026_read";
const DEFAULT_DEMO_USER_EMAIL = "demo@mdcms.local";
const DEFAULT_DEMO_USER_NAME = "Demo User";
const DEFAULT_DEMO_USER_PASSWORD = "Demo12345!";
const DEFAULT_DEMO_PROJECT = "marketing-site";
const DEFAULT_DEMO_ENVIRONMENT = "staging";
const DEFAULT_DEMO_CONTENT_ACTOR_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_KEY_LABEL = "compose-dev-demo";
const DEMO_KEY_SCOPES = [
  "content:read",
  "content:read:draft",
  "content:write",
  "content:delete",
  "content:publish",
  "schema:read",
  "schema:write",
] as const;
const LOCAL_AUTH_ORIGIN = "http://localhost";
const DEMO_CONTENT_CHANGE_SUMMARY = "compose demo seed";

/**
 * Each demo doc is tagged with the deployment(s) it makes sense to seed for:
 * - `compose`  — the long-standing local compose dev set used by the CLI's
 *   pull/push workflow tests (posts, about, campaigns, …).
 * - `marketing` — content that powers the public mdcms.io-style demo
 *   deployment (just the home page MDX today; more later).
 *
 * The `MDCMS_DEMO_SEED_SCOPES` env var (comma-separated) selects which scopes
 * the seed should iterate. Default `compose` keeps existing local compose
 * behaviour identical. Set to `marketing` for the public-demo Railway
 * deployment so it doesn't get cluttered with compose-dev sample posts.
 */
type DemoSeedScope = "compose" | "marketing";

const DEFAULT_DEMO_SEED_SCOPES: readonly DemoSeedScope[] = ["compose"];

type DemoSeedDocument = {
  key: string;
  type: string;
  path: string;
  locale: string;
  format: "md" | "mdx";
  frontmatter: Record<string, unknown>;
  body: string;
  publish: boolean;
  sourceKey?: string;
  scopes: readonly DemoSeedScope[];
};

const DEMO_CONTENT_DOCUMENTS: readonly DemoSeedDocument[] = [
  {
    key: "post:hello-mdcms:en",
    type: "post",
    path: "content/posts/hello-mdcms",
    locale: "en",
    format: "md",
    frontmatter: {
      title: "Hello MDCMS",
      slug: "hello-mdcms",
      excerpt: "Seeded demo post generated for compose runs.",
    },
    body: [
      "# Hello MDCMS",
      "",
      "This is seeded demo content for local pull/push verification.",
      "",
      "- created by `demo:seed`",
      "- project: marketing-site",
      "- environment: staging",
      "",
      "Edit this file locally, run `mdcms push`, and refresh `/demo/content`.",
    ].join("\n"),
    publish: true,
    scopes: ["compose"],
  },
  {
    key: "post:pull-push-demo:en",
    type: "post",
    path: "content/posts/pull-push-demo",
    locale: "en",
    format: "md",
    frontmatter: {
      title: "Pull Push Demo",
      slug: "pull-push-demo",
      excerpt: "Second seeded post used by demo workflow.",
      tags: ["demo", "cli"],
    },
    body: [
      "# Pull Push Demo",
      "",
      "This document exists to prove draft sync with CLI commands.",
      "",
      "1. `mdcms pull`",
      "2. edit local markdown",
      "3. `mdcms push`",
      "4. open `/demo/content`",
    ].join("\n"),
    publish: true,
    scopes: ["compose"],
  },
  {
    key: "page:about:en",
    type: "page",
    path: "content/pages/about",
    locale: "en",
    format: "mdx",
    frontmatter: {
      title: "About Demo",
      slug: "about",
      seoTitle: "MDCMS Demo About",
    },
    body: [
      "# About this demo",
      "",
      "The sample stack seeds:",
      "",
      "- one demo user",
      "- one fixed demo API key",
      "- sample content documents",
    ].join("\n"),
    publish: true,
    scopes: ["compose"],
  },
  {
    key: "page:home:en",
    type: "page",
    path: "content/pages/home",
    locale: "en",
    format: "mdx",
    frontmatter: {
      title: "Home",
      slug: "home",
    },
    body: [
      "<Hero",
      '  headlineLead="AI-native CMS for"',
      '  headlineHighlight="modern marketing teams"',
      '  subtext="MDCMS is an open-source content platform designed to help teams create, manage, and scale content across multiple markets — without relying on developers."',
      '  primaryCtaLabel="Talk to Head of Product"',
      '  primaryCtaHref="#contact"',
      '  secondaryCtaLabel="Explore GitHub"',
      '  secondaryCtaHref="https://github.com/mdcms-ai/mdcms"',
      "/>",
      "",
      "<FeaturePrompt",
      '  kicker="Prompt Based Building"',
      '  headlineLead="Build pages"',
      '  headlineHighlight="with prompts —"',
      '  headlineTrail="not tickets"',
      '  description="Skip the traditional workflow of writing briefs, creating tickets, and waiting for developers. With MDCMS, your marketing team can generate fully structured pages using natural language prompts — ready to review and publish in minutes."',
      "/>",
      "",
      "<FeatureSEO",
      '  kicker="SEO & AI Oriented Content"',
      '  headlineLead="Structured content built for"',
      '  headlineHighlight="SEO and AI"',
      '  description="MDCMS stores all content in clean, structured Markdown — making it instantly readable by search engines, AI agents, and content pipelines. No proprietary formats, no lock-in, just pure machine-friendly content."',
      "/>",
      "",
      "<FeatureMigration",
      '  kicker="Faster Migration"',
      '  headlineLead="Migrate up to"',
      '  headlineHighlight="3×"',
      '  headlineTrail="faster"',
      '  description="Moving to a new CMS shouldn\'t take months. MDCMS streamlines the entire migration process — from schema detection to content transformation — so you can go live in weeks, not quarters."',
      "/>",
      "",
      "<FeatureGrid",
      '  headingLead="Built for teams that"',
      '  headingHighlight="move fast"',
      '  primaryCtaLabel="Talk to Head of Product"',
      '  primaryCtaHref="#contact"',
      '  secondaryCtaLabel="Explore GitHub"',
      '  secondaryCtaHref="https://github.com/mdcms-ai/mdcms"',
      "/>",
      "",
      "<ComparisonTable",
      '  kicker="Engine Efficiency"',
      '  headline="Created for what other CMS platforms struggle with"',
      "/>",
      "",
      "<ImplementationOptions",
      '  headlineLead="Use it"',
      '  headlineHighlight="your way"',
      '  selfTitle="Open-source and ready to go"',
      '  selfDescription="MDCMS is open-source and can be implemented by your internal team."',
      '  blazityTitle="Work with the team behind MDCMS"',
      '  blazityDescription="Accelerate your implementation with the engineering team that built MDCMS from the ground up."',
      "/>",
      "",
      "<TrustSection",
      '  headlineLead="Built by a team trusted by"',
      '  headlineHighlight="global companies"',
      "/>",
      "",
      "<ContactForm",
      '  kicker="GET STARTED"',
      '  headline="Let\'s see if MDCMS fits your setup"',
      '  description="Book a call to explore how this could work for your team, your content, and your markets."',
      "/>",
    ].join("\n"),
    publish: true,
    scopes: ["marketing"],
  },
  {
    key: "campaign:global-launch:en",
    type: "campaign",
    path: "content/campaigns/global-launch",
    locale: "en",
    format: "md",
    frontmatter: {
      title: "Global Launch",
      slug: "global-launch",
      summary: "English launch copy seeded for localized overview testing.",
    },
    body: [
      "# Global Launch",
      "",
      "This localized demo document is the default English campaign source.",
      "",
      "- locale: en",
      "- translation group: global-launch",
      "- created by `demo:seed`",
    ].join("\n"),
    publish: true,
    scopes: ["compose"],
  },
  {
    key: "campaign:global-launch:fr",
    sourceKey: "campaign:global-launch:en",
    type: "campaign",
    path: "content/campaigns/global-launch",
    locale: "fr",
    format: "md",
    frontmatter: {
      title: "Lancement mondial",
      slug: "lancement-mondial",
      summary: "Copie francaise generee pour tester les variantes localisees.",
    },
    body: [
      "# Lancement mondial",
      "",
      "Cette variante partage le meme groupe de traduction que la campagne anglaise.",
      "",
      "- langue: fr",
      "- groupe de traduction: global-launch",
      "- cree par `demo:seed`",
    ].join("\n"),
    publish: true,
    scopes: ["compose"],
  },
];

function resolveEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const KNOWN_DEMO_SEED_SCOPES = new Set<DemoSeedScope>(["compose", "marketing"]);

function parseDemoSeedScopes(raw: string | undefined): ReadonlySet<DemoSeedScope> {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return new Set(DEFAULT_DEMO_SEED_SCOPES);
  }

  const tokens = trimmed
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  const result = new Set<DemoSeedScope>();
  for (const token of tokens) {
    if (!KNOWN_DEMO_SEED_SCOPES.has(token as DemoSeedScope)) {
      throw new Error(
        `MDCMS_DEMO_SEED_SCOPES contains unsupported scope "${token}". Supported: ${[
          ...KNOWN_DEMO_SEED_SCOPES,
        ].join(", ")}.`,
      );
    }
    result.add(token as DemoSeedScope);
  }

  if (result.size === 0) {
    return new Set(DEFAULT_DEMO_SEED_SCOPES);
  }
  return result;
}

function parseBooleanEnv(
  raw: string | undefined,
  fallback: boolean,
  key: string,
): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  throw new Error(`${key} must be "true" or "false" (got "${raw}").`);
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

function assertUuid(value: string, field: string): string {
  const normalized = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new Error(`${field} must be a valid UUID.`);
  }

  return normalized;
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
    const currentAllowlist = Array.isArray(existing.contextAllowlist)
      ? (existing.contextAllowlist as Array<{
          project: string;
          environment: string;
        }>)
      : [];
    const alreadyPresent = currentAllowlist.some(
      (entry) =>
        entry.project === input.project &&
        entry.environment === input.environment,
    );
    const mergedAllowlist = alreadyPresent
      ? currentAllowlist
      : [
          ...currentAllowlist,
          { project: input.project, environment: input.environment },
        ];

    await input.db
      .update(apiKeys)
      .set({
        label: DEMO_KEY_LABEL,
        keyPrefix: toKeyPrefix(input.apiKey),
        scopes: [...DEMO_KEY_SCOPES],
        contextAllowlist: mergedAllowlist,
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

async function ensureDemoRbacGrant(input: {
  db: ReturnType<typeof createDatabaseConnection>["db"];
  userId: string;
  project: string;
}): Promise<void> {
  const existing = await input.db.query.rbacGrants.findFirst({
    where: and(
      eq(rbacGrants.userId, input.userId),
      eq(rbacGrants.scopeKind, "project"),
      eq(rbacGrants.project, input.project),
      isNull(rbacGrants.revokedAt),
    ),
  });

  // admin/owner roles require global scope per RBAC rules.
  // A global admin grant covers all projects including the demo one.
  if (existing) {
    if (existing.role !== "admin" || existing.scopeKind !== "global") {
      await input.db
        .update(rbacGrants)
        .set({ role: "admin", scopeKind: "global", project: null })
        .where(eq(rbacGrants.id, existing.id));
    }
    return;
  }

  await input.db.insert(rbacGrants).values({
    userId: input.userId,
    role: "admin",
    scopeKind: "global",
    source: "demo-seed",
    createdByUserId: input.userId,
  });
}

async function ensureDemoContent(input: {
  db: ReturnType<typeof createDatabaseConnection>["db"];
  actorId: string;
  project: string;
  environment: string;
  scopes: ReadonlySet<DemoSeedScope>;
}): Promise<number> {
  const store = createDatabaseContentStore({ db: input.db });
  const seededDocuments = new Map<string, { documentId: string }>();
  let seededCount = 0;

  const documents = DEMO_CONTENT_DOCUMENTS.filter((template) =>
    template.scopes.some((scope) => input.scopes.has(scope)),
  );

  for (const template of documents) {
    const listed = await store.list(
      {
        project: input.project,
        environment: input.environment,
      },
      {
        draft: "true",
        type: template.type,
        path: template.path,
        locale: template.locale,
        limit: "100",
        offset: "0",
      },
    );

    const existing = listed.rows.find(
      (row) =>
        row.type === template.type &&
        row.path === template.path &&
        row.locale === template.locale &&
        row.isDeleted === false,
    );

    if (existing) {
      const bodyChanged = existing.body !== template.body;
      // Postgres JSONB does not guarantee key-insertion order on read, so a
      // string compare against the seed template would flag spurious changes
      // whenever the driver/database returned the same keys in a different
      // order. Compare structurally instead.
      const frontmatterChanged = !isDeepStrictEqual(
        existing.frontmatter ?? {},
        template.frontmatter ?? {},
      );

      if (bodyChanged || frontmatterChanged) {
        await store.update(
          {
            project: input.project,
            environment: input.environment,
          },
          existing.documentId,
          {
            frontmatter: template.frontmatter,
            body: template.body,
            updatedBy: input.actorId,
          },
        );
      }

      const needsPublish =
        template.publish &&
        (existing.publishedVersion === null ||
          bodyChanged ||
          frontmatterChanged);

      if (needsPublish) {
        await store.publish(
          {
            project: input.project,
            environment: input.environment,
          },
          existing.documentId,
          {
            actorId: input.actorId,
            changeSummary: DEMO_CONTENT_CHANGE_SUMMARY,
          },
        );
      }

      seededDocuments.set(template.key, {
        documentId: existing.documentId,
      });
      seededCount += 1;
      continue;
    }

    const sourceDocumentId = template.sourceKey
      ? seededDocuments.get(template.sourceKey)?.documentId
      : undefined;

    if (template.sourceKey && !sourceDocumentId) {
      throw new Error(
        `Demo seed source document ${template.sourceKey} was not available before creating ${template.key}.`,
      );
    }

    const created = await store.create(
      {
        project: input.project,
        environment: input.environment,
      },
      {
        type: template.type,
        path: template.path,
        locale: template.locale,
        format: template.format,
        frontmatter: template.frontmatter,
        body: template.body,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        ...(sourceDocumentId ? { sourceDocumentId } : {}),
      },
    );

    if (template.publish) {
      await store.publish(
        {
          project: input.project,
          environment: input.environment,
        },
        created.documentId,
        {
          actorId: input.actorId,
          changeSummary: DEMO_CONTENT_CHANGE_SUMMARY,
        },
      );
    }

    seededDocuments.set(template.key, {
      documentId: created.documentId,
    });
    seededCount += 1;
  }

  return seededCount;
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
  const contentActorId = assertUuid(
    resolveEnv("MDCMS_DEMO_CONTENT_ACTOR_ID", DEFAULT_DEMO_CONTENT_ACTOR_ID),
    "MDCMS_DEMO_CONTENT_ACTOR_ID",
  );
  const scopes = parseDemoSeedScopes(process.env.MDCMS_DEMO_SEED_SCOPES);
  const skipSchemaSync = parseBooleanEnv(
    process.env.MDCMS_DEMO_SKIP_SCHEMA_SYNC,
    false,
    "MDCMS_DEMO_SKIP_SCHEMA_SYNC",
  );
  const skipContentSeed = parseBooleanEnv(
    process.env.MDCMS_DEMO_SKIP_CONTENT_SEED,
    false,
    "MDCMS_DEMO_SKIP_CONTENT_SEED",
  );

  assertDemoApiKeyFormat(apiKey);

  const connection = createDatabaseConnection({ env: process.env });
  const authService = createAuthService({
    db: connection.db,
    env: process.env,
  });

  try {
    if (skipSchemaSync) {
      // Caller is responsible for pushing the schema separately (e.g. via
      // `mdcms schema sync` from the consumer repo). We still need to
      // provision the project/environment scope for downstream writes.
      await ensureDemoScopeProvisioned({
        db: connection.db,
        project,
        environment,
      });
    } else {
      await ensureDemoSchemaSynced({
        db: connection.db,
        project,
        environment,
      });
    }

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

    await ensureDemoRbacGrant({
      db: connection.db,
      userId,
      project,
    });

    const seededDocuments = skipContentSeed
      ? 0
      : await ensureDemoContent({
          db: connection.db,
          actorId: contentActorId,
          project,
          environment,
          scopes,
        });

    console.info(
      `[demo-seed] ensured demo login user ${demoUserEmail}, demo API key, and ${seededDocuments} seeded documents for ${project}/${environment} (scopes=${[...scopes].join(",")}, skipSchemaSync=${skipSchemaSync}, skipContentSeed=${skipContentSeed}, ${toKeyPrefix(apiKey)})`,
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
