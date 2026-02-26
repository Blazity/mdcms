import { parseDatabaseEnv, type DatabaseEnv } from "@mdcms/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type PostgresClient = ReturnType<typeof postgres>;
export type DrizzleDatabase = ReturnType<typeof drizzle>;

export type DatabaseConnection = {
  env: DatabaseEnv;
  client: PostgresClient;
  db: DrizzleDatabase;
  close: () => Promise<void>;
};

export type CreateDatabaseConnectionOptions = {
  env?: NodeJS.ProcessEnv;
};

/**
 * createDatabaseConnection centralizes the baseline Drizzle + postgres.js
 * adapter wiring so downstream tasks can reuse one initialization path.
 */
export function createDatabaseConnection(
  options: CreateDatabaseConnectionOptions = {},
): DatabaseConnection {
  const env = parseDatabaseEnv(options.env ?? process.env);
  const client = postgres(env.DATABASE_URL, {
    onnotice: () => undefined,
  });
  const db = drizzle(client, {
    casing: "snake_case",
  });

  return {
    env,
    client,
    db,
    close: () => client.end({ timeout: 5 }),
  };
}
