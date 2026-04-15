import assert from "node:assert/strict";
import { test } from "bun:test";

import type { StudioMountContext } from "@mdcms/shared";

import {
  createAdminLayoutCapabilitiesLoadInput,
  createAdminLayoutSessionLoadInput,
  createAdminLayoutTokenSessionState,
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

test("createAdminLayoutTokenSessionState returns an authenticated shell session for token auth", () => {
  const context = createContext();
  context.auth = { mode: "token", token: "mdcms_key_test" };

  assert.deepEqual(createAdminLayoutTokenSessionState(context.auth), {
    status: "authenticated",
    session: {
      id: "token-auth-session",
      userId: "token-auth-user",
      email: "API token",
      issuedAt: "",
      expiresAt: "",
    },
    csrfToken: "",
  });
});

test("createAdminLayoutTokenSessionState returns null for cookie auth", () => {
  assert.equal(createAdminLayoutTokenSessionState(createContext().auth), null);
});

test("createAdminLayoutTokenSessionState returns token-error for token auth with missing token", () => {
  const context = createContext();
  context.auth = { mode: "token", token: "" };

  const result = createAdminLayoutTokenSessionState(context.auth);
  assert.equal(result?.status, "token-error");
  assert.equal(
    result && "reason" in result ? result.reason : undefined,
    "missing",
  );
});

test("createAdminLayoutTokenSessionState returns token-error when token is undefined in token mode", () => {
  const result = createAdminLayoutTokenSessionState({
    mode: "token",
  } as StudioMountContext["auth"]);
  assert.equal(result?.status, "token-error");
  assert.equal(
    result && "reason" in result ? result.reason : undefined,
    "missing",
  );
});
