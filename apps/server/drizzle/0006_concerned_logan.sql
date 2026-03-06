CREATE TABLE "cli_login_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" text NOT NULL,
	"environment" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"requested_scopes" jsonb NOT NULL,
	"state_hash" text NOT NULL,
	"authorization_code_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_login_challenges_status_check" CHECK ("cli_login_challenges"."status" in ('pending', 'authorized', 'exchanged'))
);
--> statement-breakpoint
ALTER TABLE "cli_login_challenges" ADD CONSTRAINT "cli_login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cli_login_challenges_status_expires" ON "cli_login_challenges" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_cli_login_challenges_user" ON "cli_login_challenges" USING btree ("user_id");