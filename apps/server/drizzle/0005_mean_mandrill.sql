CREATE TABLE "rbac_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"scope_kind" text NOT NULL,
	"project" text,
	"environment" text,
	"path_prefix" text,
	"source" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "rbac_grants_role_check" CHECK ("rbac_grants"."role" in ('owner', 'admin', 'editor', 'viewer')),
	CONSTRAINT "rbac_grants_scope_kind_check" CHECK ("rbac_grants"."scope_kind" in ('global', 'project', 'folder_prefix')),
	CONSTRAINT "rbac_grants_scope_fields_check" CHECK ((
        ("rbac_grants"."scope_kind" = 'global' and "rbac_grants"."project" is null and "rbac_grants"."environment" is null and "rbac_grants"."path_prefix" is null)
        or
        ("rbac_grants"."scope_kind" = 'project' and "rbac_grants"."project" is not null and "rbac_grants"."environment" is null and "rbac_grants"."path_prefix" is null)
        or
        ("rbac_grants"."scope_kind" = 'folder_prefix' and "rbac_grants"."project" is not null and "rbac_grants"."environment" is not null and "rbac_grants"."path_prefix" is not null)
      )),
	CONSTRAINT "rbac_grants_admin_owner_global_check" CHECK ((
        "rbac_grants"."role" not in ('owner', 'admin')
        or "rbac_grants"."scope_kind" = 'global'
      ))
);
--> statement-breakpoint
ALTER TABLE "rbac_grants" ADD CONSTRAINT "rbac_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_grants" ADD CONSTRAINT "rbac_grants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_rbac_grants_user_active" ON "rbac_grants" USING btree ("user_id","revoked_at","role");--> statement-breakpoint
CREATE INDEX "idx_rbac_grants_scope_active" ON "rbac_grants" USING btree ("scope_kind","project","environment","revoked_at");