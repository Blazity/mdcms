import assert from "node:assert/strict";

import { test } from "bun:test";

import { createDatabaseEnvironmentStore } from "./environments-api.js";

test("createDatabaseEnvironmentStore explains when synced definitions are unavailable", async () => {
  const store = createDatabaseEnvironmentStore({
    db: {
      query: {
        projectEnvironmentTopologySnapshots: {
          findFirst: async () => undefined,
        },
      },
    } as never,
  });

  await assert.rejects(
    () => store.create("marketing-site", { name: "staging" }),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "CONFIG_SNAPSHOT_REQUIRED" &&
      "message" in error &&
      error.message ===
        "Environment management is unavailable until this project's config has been synced to the backend. Run cms schema sync from the host app repo.",
  );
});
