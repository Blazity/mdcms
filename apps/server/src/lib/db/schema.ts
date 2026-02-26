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
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: uuid("created_by").notNull(),
});

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").notNull(),
  },
  (table) => [
    unique("unique_environment_id_project").on(table.id, table.projectId),
    unique("unique_environment_per_project").on(table.projectId, table.name),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.documentId),
    translationGroupId: uuid("translation_group_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    schemaType: text("schema_type").notNull(),
    locale: text("locale").notNull(),
    contentFormat: text("content_format").notNull(),
    path: text("path").notNull(),
    body: text("body").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    version: integer("version").notNull(),
    publishedBy: uuid("published_by").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    changeSummary: text("change_summary"),
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
    documentId: uuid("document_id").primaryKey(),
    translationGroupId: uuid("translation_group_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    path: text("path").notNull(),
    schemaType: text("schema_type").notNull(),
    locale: text("locale").notNull(),
    contentFormat: text("content_format").notNull(),
    body: text("body").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    hasUnpublishedChanges: boolean("has_unpublished_changes")
      .default(true)
      .notNull(),
    publishedVersion: integer("published_version"),
    draftRevision: bigint("draft_revision", { mode: "number" })
      .default(1)
      .notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedBy: uuid("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  s3Key: text("s3_key").notNull(),
  url: text("url").notNull(),
  uploadedBy: uuid("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const migrations = pgTable(
  "migrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: uuid("environment_id").notNull(),
    schemaType: text("schema_type").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    appliedBy: uuid("applied_by").notNull(),
    documentsAffected: integer("documents_affected").notNull(),
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
