CREATE TABLE "project_environment_topology_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" text NOT NULL,
	"config_snapshot_hash" text NOT NULL,
	"definitions" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_project_environment_topology_snapshot" UNIQUE("project")
);
