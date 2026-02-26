import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * cmsInternalMetadata provides a minimal persistent table for infrastructure-
 * level metadata so SQL migrations have a concrete baseline artifact.
 */
export const cmsInternalMetadata = pgTable("cms_internal_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});
