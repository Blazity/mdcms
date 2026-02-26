CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"translation_group_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"schema_type" text NOT NULL,
	"locale" text NOT NULL,
	"content_format" text NOT NULL,
	"path" text NOT NULL,
	"body" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"version" integer NOT NULL,
	"published_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_summary" text,
	CONSTRAINT "unique_document_version" UNIQUE("document_id","version"),
	CONSTRAINT "document_versions_content_format_check" CHECK ("document_versions"."content_format" in ('md', 'mdx'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"translation_group_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"path" text NOT NULL,
	"schema_type" text NOT NULL,
	"locale" text NOT NULL,
	"content_format" text NOT NULL,
	"body" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"has_unpublished_changes" boolean DEFAULT true NOT NULL,
	"published_version" integer,
	"draft_revision" bigint DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_content_format_check" CHECK ("documents"."content_format" in ('md', 'mdx'))
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "unique_environment_id_project" UNIQUE("id","project_id"),
	CONSTRAINT "unique_environment_per_project" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"s3_key" text NOT NULL,
	"url" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"schema_type" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" uuid NOT NULL,
	"documents_affected" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("document_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "fk_document_versions_env_project" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environments"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "fk_documents_env_project" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environments"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "fk_documents_published_version" FOREIGN KEY ("document_id","published_version") REFERENCES "public"."document_versions"("document_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migrations" ADD CONSTRAINT "migrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migrations" ADD CONSTRAINT "fk_migrations_env_project" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environments"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_versions_document" ON "document_versions" USING btree ("document_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_versions_scope" ON "document_versions" USING btree ("project_id","environment_id","locale","schema_type");--> statement-breakpoint
CREATE INDEX "idx_documents_active_scope_type_locale_path" ON "documents" USING btree ("project_id","environment_id","schema_type","locale","path" text_pattern_ops) WHERE "documents"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_documents_active_scope_updated_at" ON "documents" USING btree ("project_id","environment_id","updated_at" DESC NULLS LAST) WHERE "documents"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_documents_active_scope_unpublished_updated_at" ON "documents" USING btree ("project_id","environment_id","updated_at" DESC NULLS LAST) WHERE "documents"."is_deleted" = false and "documents"."has_unpublished_changes" = true;--> statement-breakpoint
CREATE INDEX "idx_documents_scope_translation_group" ON "documents" USING btree ("project_id","environment_id","translation_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_documents_active_path" ON "documents" USING btree ("project_id","environment_id","locale","path") WHERE "documents"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_documents_active_translation_locale" ON "documents" USING btree ("project_id","environment_id","translation_group_id","locale") WHERE "documents"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_migrations_scope" ON "migrations" USING btree ("project_id","environment_id","applied_at" DESC NULLS LAST);