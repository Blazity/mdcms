ALTER TABLE "invites" RENAME COLUMN "token" TO "token_hash";--> statement-breakpoint
ALTER TABLE "invites" DROP CONSTRAINT "uniq_invites_token";--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "uniq_invites_token_hash" UNIQUE("token_hash");
