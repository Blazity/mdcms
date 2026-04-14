import assert from "node:assert/strict";

import { test } from "bun:test";

import {
  createConfigSnapshotHash,
  toProjectTopologySnapshot,
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
