import { parseDatabaseEnv, type DatabaseEnv } from "@mdcms/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./db/schema.js";

export type PostgresClient = ReturnType<typeof postgres>;
export type DrizzleDatabase = PostgresJsDatabase<typeof schema>;

export type DatabaseConnection = {
  env: DatabaseEnv;
  client: PostgresClient;
  db: DrizzleDatabase;
  close: () => Promise<void>;
};

export type CreateDatabaseConnectionOptions = {
  env?: NodeJS.ProcessEnv;
};

export function createDatabaseConnection(
  options: CreateDatabaseConnectionOptions = {},
): DatabaseConnection {
  const env = parseDatabaseEnv(options.env ?? process.env);
  const client = postgres(env.DATABASE_URL, {
    onnotice: () => undefined,
  });
  const db = drizzle(client, {
    casing: "snake_case",
    schema,
  });

  return {
    env,
    client,
    db,
    close: () => client.end({ timeout: 5 }),
  };
}
