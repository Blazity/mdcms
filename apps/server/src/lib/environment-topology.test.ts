import assert from "node:assert/strict";

import { test } from "bun:test";

import {
  createConfigSnapshotHash,
  toProjectTopologySnapshot,
  upsertProjectEnvironmentTopologySnapshot,
} from "./environment-topology.js";

test("toProjectTopologySnapshot strips environment-scoped fields", () => {
  const snapshot = toProjectTopologySnapshot({
    project: "marketing-site",
    serverUrl: "http://localhost:4000",
    environment: "staging",
    contentDirectories: ["content"],
    locales: {
      default: "en",
      supported: ["en", "fr"],
    },
    environments: {
      preview: {
        extends: "staging",
      },
      production: {},
      staging: {
        extends: "production",
      },
    },
  });

  assert.deepEqual(snapshot, {
    project: "marketing-site",
    environments: {
      preview: {
        extends: "staging",
      },
      production: {},
      staging: {
        extends: "production",
      },
    },
  });
});

test("createConfigSnapshotHash is stable across object key order changes", () => {
  const left = createConfigSnapshotHash({
    project: "marketing-site",
    environments: {
      production: {},
      staging: {
        extends: "production",
      },
    },
  });
  const right = createConfigSnapshotHash({
    environments: {
      staging: {
        extends: "production",
      },
      production: {},
    },
    project: "marketing-site",
  });

  assert.equal(left, right);
});

test("upsertProjectEnvironmentTopologySnapshot rejects project mismatches", async () => {
  await assert.rejects(
    () =>
      upsertProjectEnvironmentTopologySnapshot(
        {
          insert: () => {
            throw new Error("should not reach database insert");
          },
        } as never,
        {
          project: "docs-site",
          rawConfigSnapshot: {
            project: "marketing-site",
            environments: {
              production: {},
            },
          },
          syncedAt: new Date("2026-04-14T10:00:00.000Z"),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal("code" in error ? error.code : undefined, "INVALID_INPUT");
      assert.equal("statusCode" in error ? error.statusCode : undefined, 400);
      const details =
        "details" in error && error.details && typeof error.details === "object"
          ? (error.details as Record<string, unknown>)
          : undefined;
      assert.equal(details?.expected, "docs-site");
      assert.equal(details?.actual, "marketing-site");
      assert.match(error.message, /marketing-site/);
      assert.match(error.message, /docs-site/);
      assert.doesNotMatch(error.message, /^Field "payload/);
      return true;
    },
  );
});
