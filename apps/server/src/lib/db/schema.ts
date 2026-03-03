import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid().defaultRandom().primaryKey(),
  organizationId: uuid(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid().notNull(),
});

export const authUsers = pgTable(
  "users",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("uniq_auth_users_email").on(table.email)],
);

export const authSessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("uniq_auth_sessions_token").on(table.token),
    index("idx_auth_sessions_user_id").on(table.userId),
  ],
);

export const authAccounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_auth_accounts_user_id").on(table.userId)],
);

export const authVerifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_auth_verifications_identifier").on(table.identifier)],
);

export type ApiKeyScopeTuple = {
  project: string;
  environment: string;
};

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().defaultRandom().primaryKey(),
    label: text().notNull(),
    keyPrefix: text().notNull(),
    keyHash: text().notNull(),
    scopes: jsonb().$type<string[]>().notNull(),
    contextAllowlist: jsonb().$type<ApiKeyScopeTuple[]>().notNull(),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdByUserId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uniq_api_keys_key_hash").on(table.keyHash),
    index("idx_api_keys_active").on(table.revokedAt, table.expiresAt),
    index("idx_api_keys_created_by").on(table.createdByUserId),
  ],
);

export const environments = pgTable(
  "environments",
  {
    id: uuid().defaultRandom().primaryKey(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    description: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid().notNull(),
  },
  (table) => [
    unique("unique_environment_id_project").on(table.id, table.projectId),
    unique("unique_environment_per_project").on(table.projectId, table.name),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid().defaultRandom().primaryKey(),
    documentId: uuid()
      .notNull()
      .references(() => documents.documentId),
    translationGroupId: uuid().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    environmentId: uuid()
      .notNull()
      .references(() => environments.id),
    schemaType: text().notNull(),
    locale: text().notNull(),
    contentFormat: text().notNull(),
    path: text().notNull(),
    body: text().notNull(),
    frontmatter: jsonb().notNull(),
    version: integer().notNull(),
    publishedBy: uuid().notNull(),
    publishedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    changeSummary: text(),
  },
  (table): any => [
    check(
      "document_versions_content_format_check",
      sql`${table.contentFormat} in ('md', 'mdx')`,
    ),
    unique("unique_document_version").on(table.documentId, table.version),
    foreignKey({
      name: "fk_document_versions_env_project",
      columns: [table.environmentId, table.projectId],
      foreignColumns: [environments.id, environments.projectId],
    }),
    index("idx_versions_document").on(table.documentId, table.version.desc()),
    index("idx_versions_scope").on(
      table.projectId,
      table.environmentId,
      table.locale,
      table.schemaType,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    documentId: uuid().primaryKey(),
    translationGroupId: uuid().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    environmentId: uuid()
      .notNull()
      .references(() => environments.id),
    path: text().notNull(),
    schemaType: text().notNull(),
    locale: text().notNull(),
    contentFormat: text().notNull(),
    body: text().notNull(),
    frontmatter: jsonb().notNull(),
    isDeleted: boolean().default(false).notNull(),
    hasUnpublishedChanges: boolean().default(true).notNull(),
    publishedVersion: integer(),
    draftRevision: bigint({ mode: "number" }).default(1).notNull(),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table): any => [
    check(
      "documents_content_format_check",
      sql`${table.contentFormat} in ('md', 'mdx')`,
    ),
    foreignKey({
      name: "fk_documents_env_project",
      columns: [table.environmentId, table.projectId],
      foreignColumns: [environments.id, environments.projectId],
    }),
    foreignKey({
      name: "fk_documents_published_version",
      columns: [table.documentId, table.publishedVersion],
      foreignColumns: [documentVersions.documentId, documentVersions.version],
    }).onDelete("restrict"),
    index("idx_documents_active_scope_type_locale_path")
      .on(
        table.projectId,
        table.environmentId,
        table.schemaType,
        table.locale,
        table.path.op("text_pattern_ops"),
      )
      .where(sql`${table.isDeleted} = false`),
    index("idx_documents_active_scope_updated_at")
      .on(table.projectId, table.environmentId, table.updatedAt.desc())
      .where(sql`${table.isDeleted} = false`),
    index("idx_documents_active_scope_unpublished_updated_at")
      .on(table.projectId, table.environmentId, table.updatedAt.desc())
      .where(
        sql`${table.isDeleted} = false and ${table.hasUnpublishedChanges} = true`,
      ),
    index("idx_documents_scope_translation_group").on(
      table.projectId,
      table.environmentId,
      table.translationGroupId,
    ),
    uniqueIndex("uniq_documents_active_path")
      .on(table.projectId, table.environmentId, table.locale, table.path)
      .where(sql`${table.isDeleted} = false`),
    uniqueIndex("uniq_documents_active_translation_locale")
      .on(
        table.projectId,
        table.environmentId,
        table.translationGroupId,
        table.locale,
      )
      .where(sql`${table.isDeleted} = false`),
  ],
);

export const media = pgTable("media", {
  id: uuid().defaultRandom().primaryKey(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  filename: text().notNull(),
  mimeType: text().notNull(),
  sizeBytes: bigint({ mode: "number" }).notNull(),
  s3Key: text().notNull(),
  url: text().notNull(),
  uploadedBy: uuid().notNull(),
  uploadedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const migrations = pgTable(
  "migrations",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    environmentId: uuid().notNull(),
    schemaType: text().notNull(),
    appliedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    appliedBy: uuid().notNull(),
    documentsAffected: integer().notNull(),
  },
  (table) => [
    foreignKey({
      name: "fk_migrations_env_project",
      columns: [table.environmentId, table.projectId],
      foreignColumns: [environments.id, environments.projectId],
    }),
    index("idx_migrations_scope").on(
      table.projectId,
      table.environmentId,
      table.appliedAt.desc(),
    ),
  ],
);
