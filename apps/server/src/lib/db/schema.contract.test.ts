import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

type DrizzleJournal = {
  entries: Array<{
    idx: number;
    tag: string;
  }>;
};

type DrizzleSnapshot = {
  tables: Record<
    string,
    {
      columns: Record<string, unknown>;
      indexes: Record<string, unknown>;
      foreignKeys: Record<string, unknown>;
      uniqueConstraints: Record<string, unknown>;
    }
  >;
};

function readLatestArtifacts(): {
  migrationSql: string;
  snapshot: DrizzleSnapshot;
} {
  const drizzleDirectory = resolve(import.meta.dirname, "../../../drizzle");
  const metaDirectory = resolve(drizzleDirectory, "meta");
  const journalPath = resolve(metaDirectory, "_journal.json");
  const journal = JSON.parse(
    readFileSync(journalPath, "utf8"),
  ) as DrizzleJournal;
  const latestEntry = [...journal.entries].sort(
    (left, right) => right.idx - left.idx,
  )[0];

  assert.ok(latestEntry, "expected drizzle journal to have at least one entry");

  const snapshotPath = resolve(
    metaDirectory,
    `${String(latestEntry.idx).padStart(4, "0")}_snapshot.json`,
  );
  const migrationPath = resolve(drizzleDirectory, `${latestEntry.tag}.sql`);

  const snapshot = JSON.parse(
    readFileSync(snapshotPath, "utf8"),
  ) as DrizzleSnapshot;
  const migrationSql = readFileSync(migrationPath, "utf8");

  return {
    migrationSql,
    snapshot,
  };
}

test("schema snapshot includes CMS-11/CMS-12 core tables and columns", () => {
  const { snapshot } = readLatestArtifacts();

  const requiredTableColumns: Record<string, string[]> = {
    "public.projects": [
      "id",
      "organization_id",
      "name",
      "slug",
      "created_at",
      "created_by",
    ],
    "public.environments": [
      "id",
      "project_id",
      "name",
      "description",
      "created_at",
      "created_by",
    ],
    "public.documents": [
      "document_id",
      "translation_group_id",
      "project_id",
      "environment_id",
      "path",
      "schema_type",
      "locale",
      "content_format",
      "body",
      "frontmatter",
      "is_deleted",
      "has_unpublished_changes",
      "published_version",
      "draft_revision",
      "created_by",
      "created_at",
      "updated_by",
      "updated_at",
    ],
    "public.document_versions": [
      "id",
      "document_id",
      "translation_group_id",
      "project_id",
      "environment_id",
      "schema_type",
      "locale",
      "content_format",
      "path",
      "body",
      "frontmatter",
      "version",
      "published_by",
      "published_at",
      "change_summary",
    ],
    "public.media": [
      "id",
      "project_id",
      "filename",
      "mime_type",
      "size_bytes",
      "s3_key",
      "url",
      "uploaded_by",
      "uploaded_at",
    ],
    "public.migrations": [
      "id",
      "name",
      "project_id",
      "environment_id",
      "schema_type",
      "applied_at",
      "applied_by",
      "documents_affected",
    ],
  };

  for (const [tableName, requiredColumns] of Object.entries(
    requiredTableColumns,
  )) {
    const table = snapshot.tables[tableName];
    assert.ok(table, `expected table ${tableName} to exist in snapshot`);

    for (const columnName of requiredColumns) {
      assert.ok(
        table.columns[columnName],
        `expected column ${tableName}.${columnName} to exist in snapshot`,
      );
    }
  }
});

test("snapshot includes required named constraints and indexes", () => {
  const { snapshot } = readLatestArtifacts();
  const documentsTable = snapshot.tables["public.documents"];
  const documentVersionsTable = snapshot.tables["public.document_versions"];
  const environmentsTable = snapshot.tables["public.environments"];

  assert.ok(documentsTable, "expected documents table in snapshot");
  assert.ok(
    documentVersionsTable,
    "expected document_versions table in snapshot",
  );
  assert.ok(environmentsTable, "expected environments table in snapshot");

  for (const indexName of [
    "idx_documents_active_scope_type_locale_path",
    "idx_documents_active_scope_updated_at",
    "idx_documents_active_scope_unpublished_updated_at",
    "idx_documents_scope_translation_group",
    "uniq_documents_active_path",
    "uniq_documents_active_translation_locale",
  ]) {
    assert.ok(
      documentsTable.indexes[indexName],
      `expected index ${indexName} on documents`,
    );
  }

  for (const foreignKeyName of [
    "fk_documents_env_project",
    "fk_documents_published_version",
  ]) {
    assert.ok(
      documentsTable.foreignKeys[foreignKeyName],
      `expected foreign key ${foreignKeyName} on documents`,
    );
  }

  for (const indexName of ["idx_versions_document", "idx_versions_scope"]) {
    assert.ok(
      documentVersionsTable.indexes[indexName],
      `expected index ${indexName} on document_versions`,
    );
  }

  assert.ok(
    documentVersionsTable.foreignKeys.fk_document_versions_env_project,
    "expected foreign key fk_document_versions_env_project on document_versions",
  );
  assert.ok(
    documentVersionsTable.uniqueConstraints.unique_document_version,
    "expected unique constraint unique_document_version on document_versions",
  );
  assert.ok(
    environmentsTable.uniqueConstraints.unique_environment_id_project,
    "expected unique constraint unique_environment_id_project on environments",
  );
  assert.ok(
    environmentsTable.uniqueConstraints.unique_environment_per_project,
    "expected unique constraint unique_environment_per_project on environments",
  );
});

test("migration SQL encodes published-version delete restriction and no extension setup", () => {
  const { migrationSql } = readLatestArtifacts();

  assert.match(
    migrationSql,
    /CONSTRAINT "fk_documents_published_version".*ON DELETE restrict/i,
    "expected fk_documents_published_version to enforce ON DELETE RESTRICT",
  );
  assert.equal(
    /create extension/i.test(migrationSql),
    false,
    "migration SQL must not include extension setup statements",
  );
  assert.equal(
    /uuid-ossp/i.test(migrationSql),
    false,
    "migration SQL must not depend on uuid-ossp",
  );
  assert.equal(
    /pgcrypto/i.test(migrationSql),
    false,
    "migration SQL must not depend on pgcrypto",
  );
});
