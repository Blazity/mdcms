import assert from "node:assert/strict";
import { test } from "bun:test";

import type { StudioMountContext } from "@mdcms/shared";

import {
  createAdminLayoutCapabilitiesLoadInput,
  createAdminLayoutSessionLoadInput,
} from "./layout.js";

function createContext(): StudioMountContext {
  return {
    apiBaseUrl: "http://localhost:4000",
    basePath: "/admin",
    auth: { mode: "cookie" },
    hostBridge: {
      version: "1",
      resolveComponent: () => null,
      renderMdxPreview: () => () => {},
    },
    documentRoute: {
      project: "marketing-site",
      initialEnvironment: "staging",
      write: {
        canWrite: true,
        schemaHash: "schema-hash",
      },
    },
  };
}

test("createAdminLayoutCapabilitiesLoadInput maps the mounted project and environment", () => {
  assert.deepEqual(createAdminLayoutCapabilitiesLoadInput(createContext()), {
    config: {
      project: "marketing-site",
      environment: "staging",
      serverUrl: "http://localhost:4000",
    },
    auth: { mode: "cookie" },
  });
});

test("createAdminLayoutCapabilitiesLoadInput returns null without an active document route", () => {
  const context = createContext();
  delete context.documentRoute;

  assert.equal(createAdminLayoutCapabilitiesLoadInput(context), null);
});

test("createAdminLayoutSessionLoadInput maps the server URL and auth", () => {
  assert.deepEqual(createAdminLayoutSessionLoadInput(createContext()), {
    config: { serverUrl: "http://localhost:4000" },
    auth: { mode: "cookie" },
  });
});
