CREATE TABLE "auth_login_backoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_key" text NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"first_failed_at" timestamp with time zone NOT NULL,
	"last_failed_at" timestamp with time zone NOT NULL,
	"next_allowed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_auth_login_backoffs_login_key" UNIQUE("login_key")
);
--> statement-breakpoint
CREATE INDEX "idx_auth_login_backoffs_next_allowed" ON "auth_login_backoffs" USING btree ("next_allowed_at");
