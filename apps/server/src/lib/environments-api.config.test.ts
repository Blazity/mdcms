import assert from "node:assert/strict";

import { test } from "bun:test";

import { createDatabaseEnvironmentStore } from "./environments-api.js";

test("createDatabaseEnvironmentStore explains when backend config is unavailable", async () => {
  const store = createDatabaseEnvironmentStore({
    db: {} as never,
    getConfig: async () => undefined,
  });

  await assert.rejects(
    () => store.create("marketing-site", { name: "staging" }),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "message" in error &&
      error.message ===
        "Environment management is unavailable because the connected backend could not load mdcms.config.ts.",
  );
});
