ALTER TABLE "document_versions" ALTER COLUMN "published_by" SET DATA TYPE uuid USING "published_by"::uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "updated_by" SET DATA TYPE uuid USING "updated_by"::uuid;--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;
