import assert from "node:assert/strict";
import { test } from "node:test";

import { createInMemoryCredentialStore } from "./credentials.js";
import { runMdcmsCli } from "./framework.js";
import { createLogoutCommand } from "./logout.js";

test("logout revokes remote key best-effort and clears local profile", async () => {
  const credentialStore = createInMemoryCredentialStore();
  await credentialStore.setProfile(
    {
      serverUrl: "http://localhost:4000",
      project: "marketing-site",
      environment: "staging",
    },
    {
      authMode: "api_key",
      apiKey: "mdcms_key_to_revoke",
      apiKeyId: "key-id-logout",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );

  let called = false;
  const exitCode = await runMdcmsCli(["logout"], {
    commands: [createLogoutCommand({ credentialStore })],
    env: {} as NodeJS.ProcessEnv,
    fetcher: async (input, init) => {
      called = true;
      assert.equal(
        String(input).endsWith("/api/v1/auth/api-keys/self/revoke"),
        true,
      );
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer mdcms_key_to_revoke",
      );
      return new Response(
        JSON.stringify({
          data: {
            revoked: true,
            keyId: "key-id-logout",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
    loadConfig: async () => ({
      config: {
        serverUrl: "http://localhost:4000",
        project: "marketing-site",
        environment: "staging",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: { write: () => undefined },
    stderr: { write: () => undefined },
  });

  assert.equal(exitCode, 0);
  assert.equal(called, true);

  const profile = await credentialStore.getProfile({
    serverUrl: "http://localhost:4000",
    project: "marketing-site",
    environment: "staging",
  });
  assert.equal(profile, undefined);
});

test("logout succeeds with no-op when profile does not exist", async () => {
  let fetchCalls = 0;
  const exitCode = await runMdcmsCli(["logout"], {
    commands: [
      createLogoutCommand({ credentialStore: createInMemoryCredentialStore() }),
    ],
    env: {} as NodeJS.ProcessEnv,
    fetcher: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    },
    loadConfig: async () => ({
      config: {
        serverUrl: "http://localhost:4000",
        project: "marketing-site",
        environment: "staging",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: { write: () => undefined },
    stderr: { write: () => undefined },
  });

  assert.equal(exitCode, 0);
  assert.equal(fetchCalls, 0);
});

test("logout clears local profile even when remote revoke fails", async () => {
  const credentialStore = createInMemoryCredentialStore();
  await credentialStore.setProfile(
    {
      serverUrl: "http://localhost:4000",
      project: "marketing-site",
      environment: "staging",
    },
    {
      authMode: "api_key",
      apiKey: "mdcms_key_remote_failure",
      apiKeyId: "key-id-fail",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );

  const exitCode = await runMdcmsCli(["logout"], {
    commands: [createLogoutCommand({ credentialStore })],
    env: {} as NodeJS.ProcessEnv,
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "UNAUTHORIZED",
          message: "Token already revoked.",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    loadConfig: async () => ({
      config: {
        serverUrl: "http://localhost:4000",
        project: "marketing-site",
        environment: "staging",
      },
      configPath: "/repo/mdcms.config.ts",
    }),
    stdout: { write: () => undefined },
    stderr: { write: () => undefined },
  });

  assert.equal(exitCode, 0);
  const profile = await credentialStore.getProfile({
    serverUrl: "http://localhost:4000",
    project: "marketing-site",
    environment: "staging",
  });
  assert.equal(profile, undefined);
});
