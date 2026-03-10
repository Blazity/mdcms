CREATE TABLE "schema_registry_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"schema_type" text NOT NULL,
	"directory" text NOT NULL,
	"localized" boolean NOT NULL,
	"schema_hash" text NOT NULL,
	"resolved_schema" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_schema_registry_entry_per_type" UNIQUE("project_id","environment_id","schema_type")
);
--> statement-breakpoint
CREATE TABLE "schema_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"schema_hash" text NOT NULL,
	"raw_config_snapshot" jsonb NOT NULL,
	"extracted_components" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_schema_sync_per_environment" UNIQUE("project_id","environment_id")
);
--> statement-breakpoint
ALTER TABLE "schema_registry_entries" ADD CONSTRAINT "schema_registry_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_registry_entries" ADD CONSTRAINT "schema_registry_entries_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_registry_entries" ADD CONSTRAINT "fk_schema_registry_entries_env_project" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environments"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_syncs" ADD CONSTRAINT "schema_syncs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_syncs" ADD CONSTRAINT "schema_syncs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_syncs" ADD CONSTRAINT "fk_schema_syncs_env_project" FOREIGN KEY ("environment_id","project_id") REFERENCES "public"."environments"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_schema_registry_entries_scope" ON "schema_registry_entries" USING btree ("project_id","environment_id","schema_type");--> statement-breakpoint
CREATE INDEX "idx_schema_syncs_scope" ON "schema_syncs" USING btree ("project_id","environment_id");